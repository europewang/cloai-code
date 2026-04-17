import * as bcrypt from 'bcryptjs'
import type { Role, PrismaClient } from '@prisma/client'
import type { AppConfig } from '../config.js'

export async function upsertBootstrapUsers(prisma: PrismaClient, config: AppConfig) {
  const RESOURCE_TYPE = {
    DATASET: 'DATASET',
    DATASET_OWNER: 'DATASET_OWNER',
    SKILL: 'SKILL',
    MEMORY_PROFILE: 'MEMORY_PROFILE',
  } as const

  const upsertUserWithProfile = async ({
    username,
    password,
    role,
    profileId,
    managerUserId,
  }: {
    username: string
    password: string
    role: Role
    profileId: string
    managerUserId: bigint | null
  }) => {
    const passwordHash = await bcrypt.hash(password, 10)
    const user = await prisma.user.upsert({
      where: { username },
      update: { role, status: 'active', passwordHash, managerUserId },
      create: { username, role, status: 'active', passwordHash, managerUserId },
    })
    await prisma.memoryProfile.upsert({
      where: { userId: user.id },
      update: { profileId, storageRoot: `profiles/${profileId}` },
      create: { userId: user.id, profileId, storageRoot: `profiles/${profileId}` },
    })
    return user
  }

  const superAdmin = await upsertUserWithProfile({
    username: config.BOOTSTRAP_SUPERADMIN_USERNAME,
    password: config.BOOTSTRAP_SUPERADMIN_PASSWORD,
    role: 'super_admin',
    profileId: config.BOOTSTRAP_SUPERADMIN_PROFILE_ID,
    managerUserId: null,
  })
  const managerAdmin = await upsertUserWithProfile({
    username: config.BOOTSTRAP_MANAGER_USERNAME,
    password: config.BOOTSTRAP_MANAGER_PASSWORD,
    role: 'admin',
    profileId: config.BOOTSTRAP_MANAGER_PROFILE_ID,
    managerUserId: null,
  })
  const userA = await upsertUserWithProfile({
    username: config.BOOTSTRAP_USER_A_USERNAME,
    password: config.BOOTSTRAP_USER_A_PASSWORD,
    role: 'user',
    profileId: config.BOOTSTRAP_USER_A_PROFILE_ID,
    managerUserId: managerAdmin.id,
  })
  const userB = await upsertUserWithProfile({
    username: config.BOOTSTRAP_USER_B_USERNAME,
    password: config.BOOTSTRAP_USER_B_PASSWORD,
    role: 'user',
    profileId: config.BOOTSTRAP_USER_B_PROFILE_ID,
    managerUserId: managerAdmin.id,
  })

  // Grant permissions to superAdmin
  await prisma.permission.upsert({
    where: {
      userId_resourceType_resourceId: {
        userId: superAdmin.id,
        resourceType: RESOURCE_TYPE.SKILL,
        resourceId: 'rag-query',
      },
    },
    update: { grantedBy: superAdmin.id },
    create: {
      userId: superAdmin.id,
      resourceType: RESOURCE_TYPE.SKILL,
      resourceId: 'rag-query',
      grantedBy: superAdmin.id,
    },
  })
  await prisma.permission.upsert({
    where: {
      userId_resourceType_resourceId: {
        userId: superAdmin.id,
        resourceType: RESOURCE_TYPE.SKILL,
        resourceId: 'indicator-verification',
      },
    },
    update: { grantedBy: superAdmin.id },
    create: {
      userId: superAdmin.id,
      resourceType: RESOURCE_TYPE.SKILL,
      resourceId: 'indicator-verification',
      grantedBy: superAdmin.id,
    },
  })
  // Grant permissions to userA
  await prisma.permission.upsert({
    where: {
      userId_resourceType_resourceId: {
        userId: userA.id,
        resourceType: RESOURCE_TYPE.SKILL,
        resourceId: 'rag-query',
      },
    },
    update: { grantedBy: superAdmin.id },
    create: {
      userId: userA.id,
      resourceType: RESOURCE_TYPE.SKILL,
      resourceId: 'rag-query',
      grantedBy: superAdmin.id,
    },
  })
  await prisma.permission.upsert({
    where: {
      userId_resourceType_resourceId: {
        userId: userA.id,
        resourceType: RESOURCE_TYPE.SKILL,
        resourceId: 'indicator-verification',
      },
    },
    update: { grantedBy: superAdmin.id },
    create: {
      userId: userA.id,
      resourceType: RESOURCE_TYPE.SKILL,
      resourceId: 'indicator-verification',
      grantedBy: superAdmin.id,
    },
  })
  await prisma.permission.upsert({
    where: {
      userId_resourceType_resourceId: {
        userId: userB.id,
        resourceType: RESOURCE_TYPE.SKILL,
        resourceId: 'indicator-verification',
      },
    },
    update: { grantedBy: superAdmin.id },
    create: {
      userId: userB.id,
      resourceType: RESOURCE_TYPE.SKILL,
      resourceId: 'indicator-verification',
      grantedBy: superAdmin.id,
    },
  })
}
