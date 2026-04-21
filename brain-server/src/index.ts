import { loadConfig } from './config.js'
import { createServer } from './server.js'
import { prisma } from './lib/prisma.js'
import { initMongoDB } from './lib/mongodb.js'
import { upsertBootstrapUsers } from './scripts/seedAdmin.js'

async function bootstrap() {
  const config = loadConfig()

  // Initialize MongoDB for skill docs
  try {
    await initMongoDB()
    console.log('MongoDB initialized successfully')
  } catch (error) {
    console.error('Failed to initialize MongoDB:', error)
    // Continue anyway - MongoDB might be optional for some features
  }

  // Seed bootstrap users on startup
  try {
    await upsertBootstrapUsers(prisma, config)
    console.log('Bootstrap users seeded successfully')
  } catch (error) {
    console.error('Failed to seed bootstrap users:', error)
    // Continue anyway - users might already exist
  }

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
