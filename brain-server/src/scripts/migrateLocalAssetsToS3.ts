import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { loadConfig } from '../config.js'
import { prisma } from '../lib/prisma.js'

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function sha256HexOf(content: Buffer) {
  return createHash('sha256').update(content).digest('hex')
}

async function main() {
  const config = loadConfig()
  if (config.FILE_STORAGE_BACKEND !== 's3') {
    console.log('skip: FILE_STORAGE_BACKEND is not s3')
    return
  }

  const s3 = new S3Client({
    region: config.FILE_S3_REGION,
    endpoint: config.FILE_S3_ENDPOINT,
    forcePathStyle: config.FILE_S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: config.FILE_S3_ACCESS_KEY_ID,
      secretAccessKey: config.FILE_S3_SECRET_ACCESS_KEY,
    },
  })

  const rows = await prisma.fileAsset.findMany({
    where: {
      status: 'active',
      storagePath: {
        startsWith: '/',
      },
    },
    select: {
      id: true,
      ownerUserId: true,
      storagePath: true,
      fileName: true,
      mimeType: true,
      category: true,
      sha256Hex: true,
    },
    orderBy: { createdAt: 'asc' },
    take: 5000,
  })

  let migrated = 0
  let missing = 0
  let failed = 0

  for (const row of rows) {
    if (!path.isAbsolute(row.storagePath)) continue
    try {
      const bytes = await readFile(row.storagePath)
      const objectKey = `${row.category}/${row.ownerUserId}/${row.id}_${sanitizeFileName(row.fileName)}`
      await s3.send(
        new PutObjectCommand({
          Bucket: config.FILE_S3_BUCKET,
          Key: objectKey,
          Body: bytes,
          ContentType: row.mimeType ?? undefined,
        }),
      )
      await prisma.fileAsset.update({
        where: { id: row.id },
        data: {
          storagePath: objectKey,
          sha256Hex: row.sha256Hex ?? sha256HexOf(bytes),
          status: 'active',
          statusReason: null,
          statusUpdatedAt: new Date(),
        },
      })
      migrated += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown'
      if (message.includes('ENOENT')) {
        await prisma.fileAsset.update({
          where: { id: row.id },
          data: {
            status: 'missing',
            statusReason: 'local_file_not_found',
            statusUpdatedAt: new Date(),
          },
        })
        missing += 1
        console.error(`[migrate-missing] fileId=${row.id} path=${row.storagePath} error=${message}`)
      } else {
        failed += 1
        console.error(`[migrate-failed] fileId=${row.id} path=${row.storagePath} error=${message}`)
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        scanned: rows.length,
        migrated,
        missing,
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
