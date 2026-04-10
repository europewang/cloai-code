import { DeleteObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import { loadConfig } from '../config.js'
import { prisma } from '../lib/prisma.js'

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
    select: { storagePath: true },
  })
  const keep = new Set(rows.map((r: { storagePath: string }) => r.storagePath))
  let deleted = 0
  let scanned = 0
  let token: string | undefined

  do {
    const resp = await s3.send(
      new ListObjectsV2Command({
        Bucket: config.FILE_S3_BUCKET,
        ContinuationToken: token,
      }),
    )
    for (const item of resp.Contents ?? []) {
      if (!item.Key) continue
      scanned += 1
      if (!keep.has(item.Key)) {
        await s3.send(
          new DeleteObjectCommand({
            Bucket: config.FILE_S3_BUCKET,
            Key: item.Key,
          }),
        )
        deleted += 1
      }
    }
    token = resp.IsTruncated ? resp.NextContinuationToken : undefined
  } while (token)

  console.log(
    JSON.stringify(
      {
        bucket: config.FILE_S3_BUCKET,
        scanned,
        deleted,
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
