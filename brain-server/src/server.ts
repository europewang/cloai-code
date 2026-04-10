import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import multipart from '@fastify/multipart'
import type { AppConfig } from './config.js'
import * as jwt from 'jsonwebtoken'
import { Pool } from 'pg'
import Redis from 'ioredis'
import { z } from 'zod'
import * as bcrypt from 'bcryptjs'
import { prisma } from './lib/prisma.js'
import { ResourceType } from '@prisma/client'
import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

type Role = 'super_admin' | 'admin' | 'user'

type TokenClaims = {
  sub: string
  username: string
  role: Role
  profileId: string
  tokenType: 'access' | 'refresh'
}

type AuthedRequest = FastifyRequest & {
  auth: Omit<TokenClaims, 'tokenType'>
}

function parseExpiresToSeconds(input: string): number {
  const raw = input.trim().toLowerCase()
  const match = raw.match(/^(\d+)([smhd])$/)
  if (!match) {
    throw new Error(`Invalid expires format: ${input}, expected like 30m/7d`)
  }
  const value = Number(match[1])
  const unit = match[2]
  if (unit === 's') return value
  if (unit === 'm') return value * 60
  if (unit === 'h') return value * 60 * 60
  return value * 60 * 60 * 24
}

export function createServer(config: AppConfig) {
  const app = Fastify({
    logger: true,
  })
  const execFileAsync = promisify(execFile)
  const useS3Storage = config.FILE_STORAGE_BACKEND === 's3'
  const s3Client = useS3Storage
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
  let s3BucketPrepared = false

  const pg = new Pool({
    connectionString: config.DATABASE_URL,
  })
  const redis = new Redis(config.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  })

  const bootstrapUser = {
    id: '1', // 启动前期保留占位，真实登录态以数据库为准。
    username: config.BOOTSTRAP_ADMIN_USERNAME,
    role: config.BOOTSTRAP_ADMIN_ROLE as Role,
    profileId: config.BOOTSTRAP_ADMIN_PROFILE_ID,
    status: 'active',
  }
  const accessExpiresSeconds = parseExpiresToSeconds(config.JWT_ACCESS_EXPIRES_IN)
  const refreshExpiresSeconds = parseExpiresToSeconds(config.JWT_REFRESH_EXPIRES_IN)

  app.addHook('onClose', async () => {
    await Promise.allSettled([pg.end(), redis.quit()])
  })
  void app.register(multipart, {
    limits: {
      fileSize: 200 * 1024 * 1024,
      files: 5,
    },
  })
  void mkdir(config.SKILL_FILE_BASE_DIR, { recursive: true })
  void mkdir(config.SKILL_INPUT_BASE_DIR, { recursive: true })
  void mkdir(config.SKILL_OUTPUT_BASE_DIR, { recursive: true })

  const loginBodySchema = z.object({
    username: z.string().min(1),
    password: z.string().min(1),
  })

  const refreshBodySchema = z.object({
    refreshToken: z.string().min(1),
  })

  const createUserBodySchema = z.object({
    username: z.string().min(3),
    password: z.string().min(8),
    role: z.enum(['super_admin', 'admin', 'user']),
    managerUserId: z.union([z.number().int().positive(), z.null()]).optional(),
  })

  const updateUserBodySchema = z.object({
    role: z.enum(['super_admin', 'admin', 'user']).optional(),
    status: z.enum(['active', 'disabled']).optional(),
    managerUserId: z.union([z.number().int().positive(), z.null()]).optional(),
    password: z.string().min(8).optional(),
  })

  const idParamSchema = z.object({
    id: z.coerce.number().int().positive(),
  })
  const listAuditsQuerySchema = z.object({
    traceId: z.string().optional(),
    userId: z.coerce.number().int().positive().optional(),
    action: z.string().optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  const ragQueryBodySchema = z.object({
    query: z.string().min(1),
    datasetId: z.string().min(1).optional(),
    topK: z.number().int().positive().max(50).optional(),
    chatId: z.string().min(1).optional(),
    extra: z.record(z.string(), z.unknown()).optional(),
  })
  const indicatorRunBodySchema = z.object({
    inputFileIds: z.array(z.string().min(1)).min(1),
    checker: z.string().min(1).default('张三'),
    reviewer: z.string().min(1).default('李四'),
  })

  const mutateDatasetPermissionBodySchema = z.object({
    userId: z.coerce.number().int().positive(),
    action: z.enum(['grant', 'revoke']),
    datasetIds: z.array(z.string().min(1)).min(1),
  })

  const mutateSkillPermissionBodySchema = z.object({
    userId: z.coerce.number().int().positive(),
    action: z.enum(['grant', 'revoke']),
    skillIds: z.array(z.string().min(1)).min(1),
  })

  function signToken(tokenType: 'access' | 'refresh') {
    // token 载荷由数据库用户信息驱动；此函数只负责签名。
    return jwt.sign(
      {
        sub: bootstrapUser.id,
        username: bootstrapUser.username,
        role: bootstrapUser.role,
        profileId: bootstrapUser.profileId,
        tokenType,
      } satisfies TokenClaims,
      config.JWT_SECRET,
      {
        expiresIn: tokenType === 'access' ? accessExpiresSeconds : refreshExpiresSeconds,
      },
    )
  }

  function signUserToken(
    tokenType: 'access' | 'refresh',
    payload: Omit<TokenClaims, 'tokenType'>,
  ) {
    return jwt.sign(
      {
        ...payload,
        tokenType,
      } satisfies TokenClaims,
      config.JWT_SECRET,
      {
        expiresIn: tokenType === 'access' ? accessExpiresSeconds : refreshExpiresSeconds,
      },
    )
  }

  function verifyToken(token: string, tokenType: 'access' | 'refresh') {
    const payload = jwt.verify(token, config.JWT_SECRET) as TokenClaims
    if (payload.tokenType !== tokenType) {
      throw new Error(`Invalid token type: expected ${tokenType}`)
    }
    return payload
  }

  function parseBearerToken(req: FastifyRequest): string {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) {
      throw new Error('Missing bearer token')
    }
    return auth.slice('Bearer '.length)
  }

  function toRole(value: string): Role {
    if (value === 'super_admin' || value === 'admin' || value === 'user') {
      return value
    }
    throw new Error(`Invalid role value: ${value}`)
  }

  function getDerivedProfileId(userId: bigint | string) {
    return `profile-${userId}`
  }

  async function ensureAndGetProfileByUserId(userId: bigint) {
    const existed = await prisma.memoryProfile.findUnique({
      where: { userId },
    })
    if (existed) return existed

    const derivedProfileId = getDerivedProfileId(userId)
    return prisma.memoryProfile.create({
      data: {
        userId,
        profileId: derivedProfileId,
        storageRoot: `profiles/${derivedProfileId}`,
      },
    })
  }

  function formatUser(user: {
    id: bigint
    username: string
    role: string
    status: string
    managerUserId: bigint | null
  }) {
    return {
      id: String(user.id),
      username: user.username,
      role: user.role,
      status: user.status,
      managerUserId: user.managerUserId ? String(user.managerUserId) : null,
      profileId: getDerivedProfileId(user.id),
    }
  }

  async function getActiveOperator(req: AuthedRequest, reply: FastifyReply) {
    const operator = await prisma.user.findUnique({
      where: { username: req.auth.username },
    })
    if (!operator || operator.status !== 'active') {
      reply.code(401).send({
        message: 'Operator not available',
      })
      return null
    }
    return operator
  }

  function canManageTargetUser(
    operator: { id: bigint; role: string },
    target: { id: bigint; managerUserId: bigint | null },
  ) {
    if (operator.role === 'super_admin') return true
    if (operator.role !== 'admin') return false
    return target.id === operator.id || target.managerUserId === operator.id
  }

  async function mutatePermissions(
    payload: { userId: number; action: 'grant' | 'revoke'; resourceIds: string[] },
    resourceType: ResourceType,
    grantedBy: bigint,
  ) {
    if (payload.action === 'grant') {
      await prisma.permission.createMany({
        data: payload.resourceIds.map(resourceId => ({
          userId: BigInt(payload.userId),
          resourceType,
          resourceId,
          grantedBy,
        })),
        skipDuplicates: true,
      })
      return
    }
    await prisma.permission.deleteMany({
      where: {
        userId: BigInt(payload.userId),
        resourceType,
        resourceId: { in: payload.resourceIds },
      },
    })
  }

  async function authGuard(req: FastifyRequest, reply: FastifyReply) {
    try {
      const token = parseBearerToken(req)
      const payload = verifyToken(token, 'access')
      ;(req as AuthedRequest).auth = {
        sub: payload.sub,
        username: payload.username,
        role: payload.role,
        profileId: payload.profileId,
      }
    } catch (error) {
      reply.code(401).send({
        message: 'Unauthorized',
        error: error instanceof Error ? error.message : 'unknown',
      })
    }
  }

  function getTraceId(req: FastifyRequest) {
    const fromHeader = req.headers['x-trace-id']
    if (typeof fromHeader === 'string' && fromHeader.trim()) {
      return fromHeader.trim()
    }
    return randomUUID()
  }

  async function writeAudit(params: {
    traceId: string
    userId?: bigint | null
    operatorId?: bigint | null
    action: string
    resourceType?: string | null
    resourceId?: string | null
    result: 'success' | 'deny' | 'fail'
    payload?: unknown
  }) {
    await prisma.auditLog.create({
      data: {
        traceId: params.traceId,
        userId: params.userId ?? null,
        operatorId: params.operatorId ?? null,
        action: params.action,
        resourceType: params.resourceType ?? null,
        resourceId: params.resourceId ?? null,
        result: params.result,
        payloadJson: params.payload ? (params.payload as object) : undefined,
      },
    })
  }

  function sanitizeFileName(name: string) {
    return name.replace(/[^a-zA-Z0-9._-]/g, '_')
  }

  function sha256HexOf(content: Buffer) {
    return createHash('sha256').update(content).digest('hex')
  }

  async function discoverRagflowChatId(base: string, headers: Record<string, string>) {
    const resp = await fetch(`${base}/api/v1/chats?page=1&page_size=1`, {
      method: 'GET',
      headers,
    })
    if (!resp.ok) {
      throw new Error(`discover chat failed: ${resp.status}`)
    }
    const data = (await resp.json()) as { data?: Array<{ id?: string }> }
    const chatId = data?.data?.[0]?.id
    if (!chatId) {
      throw new Error('no chat found in ragflow tenant')
    }
    return chatId
  }

  async function getFileAssetById(fileId: string) {
    return prisma.fileAsset.findUnique({
      where: { id: fileId },
    })
  }

  async function ensureS3BucketReady() {
    if (!useS3Storage || !s3Client || s3BucketPrepared) return
    try {
      await s3Client.send(new HeadBucketCommand({ Bucket: config.FILE_S3_BUCKET }))
    } catch {
      await s3Client.send(new CreateBucketCommand({ Bucket: config.FILE_S3_BUCKET }))
    }
    s3BucketPrepared = true
  }

  async function storeFile(params: {
    ownerUserId: bigint
    fileId: string
    fileName: string
    mimeType?: string | null
    category: 'input' | 'output'
    content: Buffer
  }) {
    if (useS3Storage && s3Client) {
      await ensureS3BucketReady()
      const objectKey = `${params.category}/${params.ownerUserId}/${params.fileId}_${params.fileName}`
      await s3Client.send(
        new PutObjectCommand({
          Bucket: config.FILE_S3_BUCKET,
          Key: objectKey,
          Body: params.content,
          ContentType: params.mimeType ?? undefined,
        }),
      )
      return { storagePath: objectKey, sizeBytes: params.content.length }
    }

    const ownerDir = path.join(config.SKILL_INPUT_BASE_DIR, String(params.ownerUserId))
    await mkdir(ownerDir, { recursive: true })
    const fullPath = path.join(ownerDir, `${params.fileId}_${params.fileName}`)
    await writeFile(fullPath, params.content)
    const fileStat = await stat(fullPath)
    return { storagePath: fullPath, sizeBytes: fileStat.size }
  }

  async function readAssetBytes(meta: { storagePath: string }) {
    if (useS3Storage && s3Client) {
      const obj = await s3Client.send(
        new GetObjectCommand({
          Bucket: config.FILE_S3_BUCKET,
          Key: meta.storagePath,
        }),
      )
      const body = obj.Body
      if (!body || !(body as any).transformToByteArray) {
        throw new Error('invalid s3 object body')
      }
      const arr = await (body as any).transformToByteArray()
      return Buffer.from(arr)
    }
    return readFile(meta.storagePath)
  }

  // 进程级健康检查：用于判断服务是否存活。
  app.get('/api/health', async () => {
    return {
      status: 'ok',
      ts: new Date().toISOString(),
      service: 'brain-server',
    }
  })

  // 依赖级就绪检查：真实探测 PostgreSQL 与 Redis 可用性。
  app.get('/api/ready', async (_, reply) => {
    let postgresOk = false
    let redisOk = false

    try {
      await pg.query('select 1')
      postgresOk = true
    } catch {
      postgresOk = false
    }

    try {
      if (redis.status === 'wait') {
        await redis.connect()
      }
      redisOk = (await redis.ping()) === 'PONG'
    } catch {
      redisOk = false
    }

    if (!postgresOk || !redisOk) {
      reply.code(503)
    }

    return {
      status: postgresOk && redisOk ? 'ok' : 'fail',
      checks: {
        postgres: postgresOk ? 'ok' : 'fail',
        redis: redisOk ? 'ok' : 'fail',
      },
    }
  })

  app.post('/api/v1/auth/login', async (req, reply) => {
    const parsed = loginBodySchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({
        message: 'Invalid request body',
      })
    }

    const { username, password } = parsed.data
    const user = await prisma.user.findUnique({
      where: { username },
    })
    if (!user || user.status !== 'active') {
      return reply.code(401).send({
        message: 'Invalid credentials',
      })
    }
    const validPassword = await bcrypt.compare(password, user.passwordHash)
    if (!validPassword) {
      return reply.code(401).send({
        message: 'Invalid credentials',
      })
    }

    const memoryProfile = await ensureAndGetProfileByUserId(user.id)
    const tokenPayload = {
      sub: String(user.id),
      username: user.username,
      role: user.role as Role,
      profileId: memoryProfile.profileId,
    }

    const accessToken = signUserToken('access', tokenPayload)
    const refreshToken = signUserToken('refresh', tokenPayload)

    return reply.send({
      accessToken,
      refreshToken,
      expiresIn: config.JWT_ACCESS_EXPIRES_IN,
      user: {
        id: String(user.id),
        username: user.username,
        role: user.role,
        status: user.status,
        profileId: tokenPayload.profileId,
      },
    })
  })

  app.post('/api/v1/auth/refresh', async (req, reply) => {
    const parsed = refreshBodySchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({
        message: 'Invalid request body',
      })
    }

    try {
      const payload = verifyToken(parsed.data.refreshToken, 'refresh')
      const user = await prisma.user.findUnique({
        where: { username: payload.username },
      })
      if (!user || user.status !== 'active') {
        return reply.code(401).send({
          message: 'Invalid refresh token',
        })
      }
      const memoryProfile = await ensureAndGetProfileByUserId(user.id)
      const accessToken = signUserToken('access', {
        sub: String(user.id),
        username: user.username,
        role: user.role as Role,
        profileId: memoryProfile.profileId,
      })
      return reply.send({
        accessToken,
        expiresIn: config.JWT_ACCESS_EXPIRES_IN,
      })
    } catch {
      return reply.code(401).send({
        message: 'Invalid refresh token',
      })
    }
  })

  app.get('/api/v1/auth/me', { preHandler: authGuard }, async req => {
    const authedReq = req as AuthedRequest
    const user = await prisma.user.findUnique({
      where: {
        username: authedReq.auth.username,
      },
    })
    if (!user || user.status !== 'active') {
      return {
        message: 'User not found or disabled',
      }
    }
    const memoryProfile = await ensureAndGetProfileByUserId(user.id)
    return {
      ...formatUser(user),
      profileId: memoryProfile.profileId,
    }
  })

  app.post('/api/v1/admin/users', { preHandler: authGuard }, async (req, reply) => {
    const traceId = getTraceId(req)
    const authedReq = req as AuthedRequest
    const parsed = createUserBodySchema.safeParse(req.body)
    if (!parsed.success) {
      await writeAudit({
        traceId,
        action: 'admin.users.create',
        result: 'fail',
      })
      return reply.code(400).send({
        message: 'Invalid request body',
      })
    }

    const operator = await getActiveOperator(authedReq, reply)
    if (!operator) return

    const { username, password, role, managerUserId } = parsed.data
    const targetRole = toRole(role)

    if (operator.role === 'admin') {
      if (targetRole !== 'user') {
        await writeAudit({
          traceId,
          operatorId: operator.id,
          action: 'admin.users.create',
          result: 'deny',
        })
        return reply.code(403).send({
          message: 'admin can only create user role',
        })
      }
      if (managerUserId !== undefined && managerUserId !== Number(operator.id)) {
        await writeAudit({
          traceId,
          operatorId: operator.id,
          action: 'admin.users.create',
          result: 'deny',
        })
        return reply.code(403).send({
          message: 'admin can only assign self as manager',
        })
      }
    } else if (operator.role !== 'super_admin') {
      await writeAudit({
        traceId,
        operatorId: operator.id,
        action: 'admin.users.create',
        result: 'deny',
      })
      return reply.code(403).send({
        message: 'forbidden',
      })
    }

    const resolvedManagerUserId =
      targetRole === 'user'
        ? BigInt(managerUserId ?? Number(operator.id))
        : null

    if (targetRole !== 'user' && managerUserId !== null && managerUserId !== undefined) {
      await writeAudit({
        traceId,
        operatorId: operator.id,
        action: 'admin.users.create',
        result: 'fail',
      })
      return reply.code(400).send({
        message: 'admin/super_admin managerUserId must be null',
      })
    }

    const passwordHash = await bcrypt.hash(password, 10)

    try {
      const created = await prisma.user.create({
        data: {
          username,
          passwordHash,
          role: targetRole,
          status: 'active',
          managerUserId: resolvedManagerUserId,
        },
      })
      await ensureAndGetProfileByUserId(created.id)
      await writeAudit({
        traceId,
        userId: created.id,
        operatorId: operator.id,
        action: 'admin.users.create',
        resourceType: 'USER',
        resourceId: String(created.id),
        result: 'success',
        payload: { username: created.username, role: created.role },
      })
      return reply.code(201).send(formatUser(created))
    } catch {
      await writeAudit({
        traceId,
        operatorId: operator.id,
        action: 'admin.users.create',
        result: 'fail',
      })
      return reply.code(409).send({
        message: 'username already exists or invalid relation',
      })
    }
  })

  app.patch('/api/v1/admin/users/:id', { preHandler: authGuard }, async (req, reply) => {
    const traceId = getTraceId(req)
    const authedReq = req as AuthedRequest
    const parsedParam = idParamSchema.safeParse(req.params)
    const parsedBody = updateUserBodySchema.safeParse(req.body)
    if (!parsedParam.success || !parsedBody.success) {
      await writeAudit({
        traceId,
        action: 'admin.users.update',
        result: 'fail',
      })
      return reply.code(400).send({
        message: 'Invalid request',
      })
    }

    const operator = await getActiveOperator(authedReq, reply)
    if (!operator) return

    const targetId = BigInt(parsedParam.data.id)
    const target = await prisma.user.findUnique({
      where: { id: targetId },
    })
    if (!target) {
      await writeAudit({
        traceId,
        operatorId: operator.id,
        action: 'admin.users.update',
        result: 'fail',
      })
      return reply.code(404).send({
        message: 'User not found',
      })
    }

    if (!canManageTargetUser(operator, target)) {
      await writeAudit({
        traceId,
        userId: target.id,
        operatorId: operator.id,
        action: 'admin.users.update',
        result: 'deny',
      })
      return reply.code(403).send({
        message: 'admin can only manage self or direct users',
      })
    }

    const updateData: {
      role?: Role
      status?: 'active' | 'disabled'
      managerUserId?: bigint | null
      passwordHash?: string
    } = {}
    const body = parsedBody.data

    if (body.role !== undefined) {
      const nextRole = toRole(body.role)
      if (operator.role === 'admin' && nextRole !== 'user') {
        await writeAudit({
          traceId,
          userId: target.id,
          operatorId: operator.id,
          action: 'admin.users.update',
          result: 'deny',
        })
        return reply.code(403).send({
          message: 'admin cannot assign non-user role',
        })
      }
      updateData.role = nextRole
      if (nextRole !== 'user') {
        updateData.managerUserId = null
      }
    }

    if (body.status !== undefined) {
      updateData.status = body.status
    }

    if (body.managerUserId !== undefined) {
      if ((updateData.role ?? target.role) !== 'user' && body.managerUserId !== null) {
        await writeAudit({
          traceId,
          userId: target.id,
          operatorId: operator.id,
          action: 'admin.users.update',
          result: 'fail',
        })
        return reply.code(400).send({
          message: 'managerUserId must be null when role is not user',
        })
      }
      if (operator.role === 'admin' && body.managerUserId !== Number(operator.id)) {
        await writeAudit({
          traceId,
          userId: target.id,
          operatorId: operator.id,
          action: 'admin.users.update',
          result: 'deny',
        })
        return reply.code(403).send({
          message: 'admin can only assign self as manager',
        })
      }
      updateData.managerUserId = body.managerUserId === null ? null : BigInt(body.managerUserId)
    } else if ((updateData.role ?? target.role) === 'user' && target.managerUserId === null) {
      updateData.managerUserId = operator.id
    }

    if (body.password !== undefined) {
      updateData.passwordHash = await bcrypt.hash(body.password, 10)
    }

    const updated = await prisma.user.update({
      where: { id: target.id },
      data: updateData,
    })
    await writeAudit({
      traceId,
      userId: updated.id,
      operatorId: operator.id,
      action: 'admin.users.update',
      resourceType: 'USER',
      resourceId: String(updated.id),
      result: 'success',
      payload: parsedBody.data,
    })

    return reply.send(formatUser(updated))
  })

  app.get('/api/v1/brain/context', { preHandler: authGuard }, async (req, reply) => {
    const authedReq = req as AuthedRequest
    const operator = await getActiveOperator(authedReq, reply)
    if (!operator) return

    const permissions = await prisma.permission.findMany({
      where: {
        userId: operator.id,
      },
    })
    const memoryProfile = await ensureAndGetProfileByUserId(operator.id)

    const allowedDatasets = permissions
      .filter(p => p.resourceType === 'DATASET' || p.resourceType === 'DATASET_OWNER')
      .map(p => p.resourceId)
    const allowedSkills = permissions
      .filter(p => p.resourceType === 'SKILL')
      .map(p => p.resourceId)

    return {
      role: operator.role,
      profileId: memoryProfile.profileId,
      allowedDatasets: Array.from(new Set(allowedDatasets)),
      allowedSkills: Array.from(new Set(allowedSkills)),
      policyVersion: String(Date.now()),
    }
  })

  app.post('/api/v1/admin/permissions/datasets', { preHandler: authGuard }, async (req, reply) => {
    const traceId = getTraceId(req)
    const authedReq = req as AuthedRequest
    const operator = await getActiveOperator(authedReq, reply)
    if (!operator) return
    const parsed = mutateDatasetPermissionBodySchema.safeParse(req.body)
    if (!parsed.success) {
      await writeAudit({
        traceId,
        action: 'admin.permissions.datasets',
        result: 'fail',
      })
      return reply.code(400).send({
        message: 'Invalid request body',
      })
    }

    const target = await prisma.user.findUnique({
      where: { id: BigInt(parsed.data.userId) },
    })
    if (!target) {
      await writeAudit({
        traceId,
        operatorId: operator.id,
        action: 'admin.permissions.datasets',
        result: 'fail',
      })
      return reply.code(404).send({ message: 'target user not found' })
    }
    if (!canManageTargetUser(operator, target)) {
      await writeAudit({
        traceId,
        userId: target.id,
        operatorId: operator.id,
        action: 'admin.permissions.datasets',
        result: 'deny',
      })
      return reply.code(403).send({ message: 'forbidden' })
    }

    await mutatePermissions(
      {
        userId: parsed.data.userId,
        action: parsed.data.action,
        resourceIds: parsed.data.datasetIds,
      },
      ResourceType.DATASET,
      operator.id,
    )
    await writeAudit({
      traceId,
      userId: target.id,
      operatorId: operator.id,
      action: 'admin.permissions.datasets',
      resourceType: 'DATASET',
      resourceId: parsed.data.datasetIds.join(','),
      result: 'success',
      payload: parsed.data,
    })
    return {
      success: true,
      affected: parsed.data.datasetIds.length,
    }
  })

  app.post('/api/v1/admin/permissions/skills', { preHandler: authGuard }, async (req, reply) => {
    const traceId = getTraceId(req)
    const authedReq = req as AuthedRequest
    const operator = await getActiveOperator(authedReq, reply)
    if (!operator) return
    const parsed = mutateSkillPermissionBodySchema.safeParse(req.body)
    if (!parsed.success) {
      await writeAudit({
        traceId,
        action: 'admin.permissions.skills',
        result: 'fail',
      })
      return reply.code(400).send({
        message: 'Invalid request body',
      })
    }

    const target = await prisma.user.findUnique({
      where: { id: BigInt(parsed.data.userId) },
    })
    if (!target) {
      await writeAudit({
        traceId,
        operatorId: operator.id,
        action: 'admin.permissions.skills',
        result: 'fail',
      })
      return reply.code(404).send({ message: 'target user not found' })
    }
    if (!canManageTargetUser(operator, target)) {
      await writeAudit({
        traceId,
        userId: target.id,
        operatorId: operator.id,
        action: 'admin.permissions.skills',
        result: 'deny',
      })
      return reply.code(403).send({ message: 'forbidden' })
    }

    await mutatePermissions(
      {
        userId: parsed.data.userId,
        action: parsed.data.action,
        resourceIds: parsed.data.skillIds,
      },
      ResourceType.SKILL,
      operator.id,
    )
    await writeAudit({
      traceId,
      userId: target.id,
      operatorId: operator.id,
      action: 'admin.permissions.skills',
      resourceType: 'SKILL',
      resourceId: parsed.data.skillIds.join(','),
      result: 'success',
      payload: parsed.data,
    })
    return {
      success: true,
      affected: parsed.data.skillIds.length,
    }
  })

  app.get('/api/v1/admin/users/:id/permissions', { preHandler: authGuard }, async (req, reply) => {
    const authedReq = req as AuthedRequest
    const operator = await getActiveOperator(authedReq, reply)
    if (!operator) return
    const parsedParam = idParamSchema.safeParse(req.params)
    if (!parsedParam.success) {
      return reply.code(400).send({ message: 'Invalid user id' })
    }

    const target = await prisma.user.findUnique({
      where: {
        id: BigInt(parsedParam.data.id),
      },
    })
    if (!target) {
      return reply.code(404).send({ message: 'target user not found' })
    }
    if (!canManageTargetUser(operator, target)) {
      return reply.code(403).send({ message: 'forbidden' })
    }

    const permissions = await prisma.permission.findMany({
      where: {
        userId: target.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    return {
      userId: String(target.id),
      permissions: permissions.map(p => ({
        resourceType: p.resourceType,
        resourceId: p.resourceId,
      })),
    }
  })

  app.get('/api/v1/admin/audits', { preHandler: authGuard }, async (req, reply) => {
    const authedReq = req as AuthedRequest
    const operator = await getActiveOperator(authedReq, reply)
    if (!operator) return
    if (operator.role === 'user') {
      return reply.code(403).send({ message: 'forbidden' })
    }

    const parsed = listAuditsQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      return reply.code(400).send({ message: 'invalid query' })
    }

    const { traceId, userId, action, page, pageSize } = parsed.data
    const where = {
      ...(traceId ? { traceId } : {}),
      ...(userId ? { userId: BigInt(userId) } : {}),
      ...(action ? { action } : {}),
    }
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.auditLog.count({ where }),
    ])

    return {
      items: items.map(item => ({
        id: String(item.id),
        traceId: item.traceId,
        userId: item.userId ? String(item.userId) : null,
        operatorId: item.operatorId ? String(item.operatorId) : null,
        action: item.action,
        resourceType: item.resourceType,
        resourceId: item.resourceId,
        result: item.result,
        payload: item.payloadJson,
        createdAt: item.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    }
  })

  app.get('/api/v1/integrations/ragflow/health', { preHandler: authGuard }, async (req, reply) => {
    const authedReq = req as AuthedRequest
    const operator = await getActiveOperator(authedReq, reply)
    if (!operator) return
    if (operator.role === 'user') {
      return reply.code(403).send({ message: 'forbidden' })
    }

    const base = config.RAGFLOW_BASE_URL.replace(/\/+$/, '')
    const probeEndpoints = ['/api/version', '/api/v1/version', '/api/health', '/api/v1/health', '/']
    const headers: Record<string, string> = {}
    if (config.RAGFLOW_AUTHORIZATION) {
      headers.Authorization = config.RAGFLOW_AUTHORIZATION
    } else if (config.RAGFLOW_BEARER_TOKEN) {
      headers.Authorization = `Bearer ${config.RAGFLOW_BEARER_TOKEN}`
    } else if (config.RAGFLOW_API_KEY) {
      headers.Authorization = `Bearer ${config.RAGFLOW_API_KEY}`
    }

    async function probe(endpoint: string) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 5000)
      try {
        const resp = await fetch(`${base}${endpoint}`, {
          method: 'GET',
          headers,
          signal: controller.signal,
        })
        const text = await resp.text()
        return {
          ok: resp.ok,
          httpStatus: resp.status,
          endpoint,
          bodyPreview: text.slice(0, 300),
        }
      } finally {
        clearTimeout(timer)
      }
    }

    try {
      let best: {
        ok: boolean
        httpStatus: number
        endpoint: string
        bodyPreview: string
      } | null = null
      for (const endpoint of probeEndpoints) {
        try {
          const res = await probe(endpoint)
          best = res
          // 成功或鉴权拒绝(401/403)都说明联通可用
          if (res.ok || res.httpStatus === 401 || res.httpStatus === 403) {
            break
          }
        } catch {
          // 继续探测下一个端点
        }
      }
      if (!best) {
        return reply.code(503).send({
          status: 'fail',
          baseUrl: base,
          error: 'no endpoint reachable',
        })
      }
      return {
        status: best.ok || best.httpStatus === 401 || best.httpStatus === 403 ? 'ok' : 'fail',
        baseUrl: base,
        endpoint: best.endpoint,
        httpStatus: best.httpStatus,
        bodyPreview: best.bodyPreview,
      }
    } catch (error) {
      return reply.code(503).send({
        status: 'fail',
        baseUrl: base,
        endpoint: probeEndpoints.join(','),
        error: error instanceof Error ? error.message : 'unknown',
      })
    }
  })

  app.post('/api/v1/rag/query', { preHandler: authGuard }, async (req, reply) => {
    const traceId = getTraceId(req)
    const authedReq = req as AuthedRequest
    const operator = await getActiveOperator(authedReq, reply)
    if (!operator) return

    const parsed = ragQueryBodySchema.safeParse(req.body)
    if (!parsed.success) {
      await writeAudit({
        traceId,
        operatorId: operator.id,
        action: 'rag.query.proxy',
        result: 'fail',
      })
      return reply.code(400).send({ message: 'invalid request body' })
    }

    const { query, datasetId, topK, chatId, extra } = parsed.data
    if (operator.role !== 'super_admin') {
      if (!datasetId) {
        await writeAudit({
          traceId,
          userId: operator.id,
          operatorId: operator.id,
          action: 'rag.query.proxy',
          result: 'deny',
          payload: { reason: 'datasetId required for non-super-admin' },
        })
        return reply.code(403).send({
          message: 'datasetId is required for non-super-admin users',
        })
      }
      const allowed = await prisma.permission.findFirst({
        where: {
          userId: operator.id,
          resourceType: { in: [ResourceType.DATASET, ResourceType.DATASET_OWNER] },
          resourceId: datasetId,
        },
      })
      if (!allowed) {
        await writeAudit({
          traceId,
          userId: operator.id,
          operatorId: operator.id,
          action: 'rag.query.proxy',
          result: 'deny',
          resourceType: 'DATASET',
          resourceId: datasetId,
        })
        return reply.code(403).send({
          message: 'dataset permission denied',
        })
      }
    }

    const base = config.RAGFLOW_BASE_URL.replace(/\/+$/, '')
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (config.RAGFLOW_AUTHORIZATION) {
      headers.Authorization = config.RAGFLOW_AUTHORIZATION
    } else if (config.RAGFLOW_BEARER_TOKEN) {
      headers.Authorization = `Bearer ${config.RAGFLOW_BEARER_TOKEN}`
    } else if (config.RAGFLOW_API_KEY) {
      // 兼容部分网关风格
      headers.Authorization = `Bearer ${config.RAGFLOW_API_KEY}`
    }
    const resolvedChatId =
      chatId ??
      config.RAGFLOW_CHAT_ID ??
      (config.RAGFLOW_QUERY_PATH.includes('{chatId}')
        ? await discoverRagflowChatId(base, headers)
        : undefined)
    const pathRaw = config.RAGFLOW_QUERY_PATH.replace('{chatId}', resolvedChatId ?? '')
    const path = pathRaw.startsWith('/') ? pathRaw : `/${pathRaw}`
    const url = `${base}${path}`

    const isOpenAIChatPath = path.includes('/chats_openai/')
    const upstreamBody = isOpenAIChatPath
      ? {
          model: config.RAGFLOW_MODEL,
          messages: [{ role: 'user', content: query }],
          stream: false,
          ...(extra ?? {}),
        }
      : {
          question: query,
          query,
          ...(datasetId ? { datasetId } : {}),
          ...(topK ? { topK } : {}),
          ...(extra ?? {}),
        }

    try {
      const upstreamResp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(upstreamBody),
      })
      const raw = await upstreamResp.text()
      let parsedBody: unknown = raw
      try {
        parsedBody = JSON.parse(raw)
      } catch {
        parsedBody = raw
      }

      await writeAudit({
        traceId,
        userId: operator.id,
        operatorId: operator.id,
        action: 'rag.query.proxy',
        result: upstreamResp.ok ? 'success' : 'fail',
        resourceType: datasetId ? 'DATASET' : null,
        resourceId: datasetId ?? null,
        payload: {
          url,
          chatId: resolvedChatId ?? null,
          status: upstreamResp.status,
          query,
        },
      })

      if (!upstreamResp.ok) {
        return reply.code(502).send({
          message: 'ragflow upstream error',
          upstreamStatus: upstreamResp.status,
          upstreamBody: parsedBody,
        })
      }
      return {
        traceId,
        chatId: resolvedChatId ?? null,
        data: parsedBody,
      }
    } catch (error) {
      await writeAudit({
        traceId,
        userId: operator.id,
        operatorId: operator.id,
        action: 'rag.query.proxy',
        result: 'fail',
        resourceType: datasetId ? 'DATASET' : null,
        resourceId: datasetId ?? null,
        payload: {
          error: error instanceof Error ? error.message : 'unknown',
        },
      })
      return reply.code(503).send({
        message: 'ragflow unreachable',
        error: error instanceof Error ? error.message : 'unknown',
      })
    }
  })

  app.post('/api/v1/files/upload', { preHandler: authGuard }, async (req, reply) => {
    const traceId = getTraceId(req)
    const authedReq = req as AuthedRequest
    const operator = await getActiveOperator(authedReq, reply)
    if (!operator) return
    const part = await (req as FastifyRequest & { file: () => Promise<any> }).file()
    if (!part) {
      return reply.code(400).send({ message: 'file is required' })
    }
    const safeName = sanitizeFileName(part.filename || 'upload.bin')
    const fileId = randomUUID()
    const buffer = await part.toBuffer()
    const sha256Hex = sha256HexOf(buffer)
    const stored = await storeFile({
      ownerUserId: operator.id,
      fileId,
      fileName: safeName,
      mimeType: part.mimetype ?? null,
      category: 'input',
      content: buffer,
    })
    await prisma.fileAsset.create({
      data: {
        id: fileId,
        ownerUserId: operator.id,
        storagePath: stored.storagePath,
        fileName: safeName,
        mimeType: part.mimetype ?? null,
        sizeBytes: BigInt(stored.sizeBytes),
        sha256Hex,
        category: 'input',
      },
    })
    await writeAudit({
      traceId,
      userId: operator.id,
      operatorId: operator.id,
      action: 'files.upload',
      result: 'success',
      payload: { fileId, fileName: safeName, size: stored.sizeBytes, sha256Hex },
    })
    return { fileId, fileName: safeName, size: stored.sizeBytes, sha256Hex }
  })

  app.get('/api/v1/files/:fileId/download', { preHandler: authGuard }, async (req, reply) => {
    const authedReq = req as AuthedRequest
    const operator = await getActiveOperator(authedReq, reply)
    if (!operator) return
    const params = req.params as { fileId?: string }
    const fileId = params.fileId
    if (!fileId) return reply.code(400).send({ message: 'fileId required' })
    const meta = await getFileAssetById(fileId)
    if (!meta) return reply.code(404).send({ message: 'file not found' })
    if (operator.role !== 'super_admin' && meta.ownerUserId !== operator.id) {
      return reply.code(403).send({ message: 'forbidden' })
    }
    const encodedName = encodeURIComponent(meta.fileName)
    reply.header(
      'Content-Disposition',
      `attachment; filename="download.bin"; filename*=UTF-8''${encodedName}`,
    )
    reply.type('application/octet-stream')
    if (useS3Storage && s3Client) {
      const bytes = await readAssetBytes(meta)
      return reply.send(bytes)
    }
    return reply.send(createReadStream(meta.storagePath))
  })

  app.post('/api/v1/skills/indicator-verification/run', { preHandler: authGuard }, async (req, reply) => {
    const traceId = getTraceId(req)
    const authedReq = req as AuthedRequest
    const operator = await getActiveOperator(authedReq, reply)
    if (!operator) return
    const parsed = indicatorRunBodySchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ message: 'invalid request body' })
    }
    const { inputFileIds, checker, reviewer } = parsed.data
    const jobId = randomUUID()
    const jobInput = path.join(config.SKILL_INPUT_BASE_DIR, `job-${jobId}`)
    const jobOutput = path.join(config.SKILL_OUTPUT_BASE_DIR, `job-${jobId}`)
    await mkdir(jobInput, { recursive: true })
    await mkdir(jobOutput, { recursive: true })

    for (const inputFileId of inputFileIds) {
      const meta = await getFileAssetById(inputFileId)
      if (!meta) {
        return reply.code(404).send({ message: `input file not found: ${inputFileId}` })
      }
      if (operator.role !== 'super_admin' && meta.ownerUserId !== operator.id) {
        return reply.code(403).send({ message: `forbidden file access: ${inputFileId}` })
      }
      const targetPath = path.join(jobInput, meta.fileName)
      if (useS3Storage && s3Client) {
        const bytes = await readAssetBytes(meta)
        await writeFile(targetPath, bytes)
      } else {
        await copyFile(meta.storagePath, targetPath)
      }
    }

    await execFileAsync(
      'python3',
      [
        config.SKILL_INDICATOR_SCRIPT_PATH,
        jobInput,
        jobOutput,
        checker,
        reviewer,
      ],
      { cwd: process.cwd(), timeout: 5 * 60 * 1000 },
    )

    const outputFiles = await readdir(jobOutput, { recursive: true })
    const registeredOutputs: Array<{ fileId: string; fileName: string; size: number }> = []
    for (const rel of outputFiles) {
      const relPath = String(rel)
      const fullPath = path.join(jobOutput, relPath)
      const fileInfo = await stat(fullPath)
      if (!fileInfo.isFile()) continue
      const outId = randomUUID()
      const fileName = path.basename(relPath)
      const outputBytes = await readFile(fullPath)
      const sha256Hex = sha256HexOf(outputBytes)
      const stored = await storeFile({
        ownerUserId: operator.id,
        fileId: outId,
        fileName,
        mimeType: null,
        category: 'output',
        content: outputBytes,
      })
      await prisma.fileAsset.create({
        data: {
          id: outId,
          ownerUserId: operator.id,
          storagePath: stored.storagePath,
          fileName,
          mimeType: null,
          sizeBytes: BigInt(stored.sizeBytes),
          sha256Hex,
          category: 'output',
        },
      })
      registeredOutputs.push({ fileId: outId, fileName, size: stored.sizeBytes })
    }

    await writeAudit({
      traceId,
      userId: operator.id,
      operatorId: operator.id,
      action: 'skills.indicator_verification.run',
      result: 'success',
      payload: {
        jobId,
        inputFileIds,
        outputCount: registeredOutputs.length,
      },
    })

    return {
      jobId,
      outputFiles: registeredOutputs,
      downloadEndpoint: '/api/v1/files/{fileId}/download',
    }
  })

  return app
}
