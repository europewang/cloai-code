import * as bcrypt from 'bcryptjs'
import { Role } from '@prisma/client'
import { loadConfig } from '../config.js'
import { prisma } from '../lib/prisma.js'

async function seedAdmin() {
  const config = loadConfig()
  const passwordHash = await bcrypt.hash(config.BOOTSTRAP_ADMIN_PASSWORD, 10)

  const admin = await prisma.user.upsert({
    where: {
      username: config.BOOTSTRAP_ADMIN_USERNAME,
    },
    update: {
      role: config.BOOTSTRAP_ADMIN_ROLE as Role,
      status: 'active',
      passwordHash,
      managerUserId: null,
    },
    create: {
      username: config.BOOTSTRAP_ADMIN_USERNAME,
      role: config.BOOTSTRAP_ADMIN_ROLE as Role,
      status: 'active',
      passwordHash,
      managerUserId: null,
    },
  })

  await prisma.memoryProfile.upsert({
    where: {
      userId: admin.id,
    },
    update: {
      profileId: config.BOOTSTRAP_ADMIN_PROFILE_ID,
      storageRoot: `profiles/${config.BOOTSTRAP_ADMIN_PROFILE_ID}`,
    },
    create: {
      userId: admin.id,
      profileId: config.BOOTSTRAP_ADMIN_PROFILE_ID,
      storageRoot: `profiles/${config.BOOTSTRAP_ADMIN_PROFILE_ID}`,
    },
  })
}

void seedAdmin()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async error => {
    // eslint-disable-next-line no-console
    console.error('seed admin failed', error)
    await prisma.$disconnect()
    process.exit(1)
  })
