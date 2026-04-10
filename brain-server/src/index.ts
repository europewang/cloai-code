import { loadConfig } from './config.js'
import { createServer } from './server.js'

async function bootstrap() {
  const config = loadConfig()
  const app = createServer(config)

  try {
    await app.listen({
      host: '0.0.0.0',
      port: config.PORT,
    })
    app.log.info(`brain-server listening on :${config.PORT}`)
  } catch (error) {
    app.log.error(error)
    process.exit(1)
  }
}

void bootstrap()
