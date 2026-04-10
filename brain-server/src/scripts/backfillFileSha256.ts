import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { loadConfig } from '../config.js'
import { prisma } from '../lib/prisma.js'

function sha256HexOf(content: Buffer) {
  return createHash('sha256').update(content).digest('hex')
}

async function main() {
  const config = loadConfig()
  const useS3 = config.FILE_STORAGE_BACKEND === 's3'
  const s3 = useS3
    ? new S3Client({
        region: config.FILE_S3_REGION,
        endpoint: config.FILE_S3_ENDPOINT,
        forcePathStyle: config.FILE_S3_FORCE_PATH_STYLE,
        credentials: {
          accessKeyId: config.FILE_S3_ACCESS_KEY_ID,
          secretAccessKey: config.FILE_S3_SECRET_ACCESS_KEY,
        },
      })
    : null

  const rows = await prisma.fileAsset.findMany({
    where: { sha256Hex: null },
    select: { id: true, storagePath: true },
    orderBy: { createdAt: 'asc' },
    take: 5000,
  })

  let updated = 0
  let failed = 0
  let skipped = 0

  for (const row of rows) {
    try {
      const likelyLocalPath = path.isAbsolute(row.storagePath)
      if (useS3 && likelyLocalPath) {
        skipped += 1
        continue
      }
      // 历史数据在 local 模式下也可能是 S3 对象键（迁移前写入），这里统一允许回填。
      if (!useS3 && !likelyLocalPath) {
        skipped += 1
        continue
      }
      let bytes: Buffer
      if (useS3 && s3) {
        const obj = await s3.send(
          new GetObjectCommand({
            Bucket: config.FILE_S3_BUCKET,
            Key: row.storagePath,
          }),
        )
        const body = obj.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined
        if (!body?.transformToByteArray) throw new Error('invalid s3 body')
        bytes = Buffer.from(await body.transformToByteArray())
      } else {
        bytes = await readFile(row.storagePath)
      }
      const hash = sha256HexOf(bytes)
      await prisma.fileAsset.update({
        where: { id: row.id },
        data: { sha256Hex: hash },
      })
      updated += 1
    } catch (error) {
      console.error(`[backfill-failed] fileId=${row.id} path=${row.storagePath} error=${error instanceof Error ? error.message : 'unknown'}`)
      failed += 1
    }
  }

  console.log(
    JSON.stringify(
      {
        scanned: rows.length,
        updated,
        skipped,
        failed,
      },
      null,
      2,
    ),
  )
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
