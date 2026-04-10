import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

async function main() {
  const tasks = [
    { name: 'backfill-file-sha256', file: 'dist/scripts/backfillFileSha256.js' },
    { name: 'cleanup-s3-orphans', file: 'dist/scripts/cleanupOrphanS3Objects.js' },
  ]
  const result: Array<{ task: string; ok: boolean; output: string }> = []

  for (const task of tasks) {
    try {
      const { stdout, stderr } = await execFileAsync('node', [task.file], { timeout: 10 * 60 * 1000 })
      result.push({
        task: task.name,
        ok: true,
        output: `${stdout || ''}${stderr || ''}`.trim().slice(0, 1000),
      })
    } catch (error) {
      result.push({
        task: task.name,
        ok: false,
        output: error instanceof Error ? error.message : 'unknown',
      })
    }
  }

  console.log(JSON.stringify({ tickAt: new Date().toISOString(), result }, null, 2))
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
