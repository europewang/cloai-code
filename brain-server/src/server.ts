import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import multipart from '@fastify/multipart'
import type { AppConfig } from './config.js'
import * as jwt from 'jsonwebtoken'
import { Pool } from 'pg'
import Redis from 'ioredis'
import { z } from 'zod'
import * as bcrypt from 'bcryptjs'
import { prisma } from './lib/prisma.js'
import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { registerPreServerRoutes } from './routes/preServer.js'
import { registerPostServerRoutes } from './routes/postServer.js'
import { registerSkillRoutes } from './routes/skills.js'

type Role = 'super_admin' | 'admin' | 'user'
type ResourceType = 'DATASET' | 'DATASET_OWNER' | 'SKILL' | 'MEMORY_PROFILE'

const RESOURCE_TYPE = {
  DATASET: 'DATASET',
  DATASET_OWNER: 'DATASET_OWNER',
  SKILL: 'SKILL',
  MEMORY_PROFILE: 'MEMORY_PROFILE',
} as const

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
  const policyVersionKeyPrefix = 'brain:policy:version:user:'
  const ragChatKeyPrefix = 'brain:rag:chat:user:'

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
  const listToolCallAuditsQuerySchema = z.object({
    traceId: z.string().optional(),
    userId: z.coerce.number().int().positive().optional(),
    operatorId: z.coerce.number().int().positive().optional(),
    toolName: z.string().optional(),
    result: z.enum(['success', 'deny', 'fail']).optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  const listRagQueryAuditsQuerySchema = z.object({
    traceId: z.string().optional(),
    userId: z.coerce.number().int().positive().optional(),
    operatorId: z.coerce.number().int().positive().optional(),
    datasetId: z.string().optional(),
    result: z.enum(['success', 'deny', 'fail']).optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  const listFileAssetsQuerySchema = z.object({
    status: z.enum(['active', 'missing']).optional(),
    category: z.enum(['input', 'output']).optional(),
    ownerUserId: z.coerce.number().int().positive().optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  const fileIdParamSchema = z.object({
    fileId: z.string().min(1),
  })
  const updateFileStatusBodySchema = z.object({
    status: z.enum(['active', 'missing']),
    reason: z.string().max(255).optional(),
  })
  const batchUpdateFileStatusBodySchema = z.object({
    fileIds: z.array(z.string().min(1)).min(1).max(200),
    status: z.enum(['active', 'missing']),
    reason: z.string().max(255).optional(),
  })
  const exportFileAssetsQuerySchema = z.object({
    status: z.enum(['active', 'missing']).default('missing'),
    category: z.enum(['input', 'output']).optional(),
    ownerUserId: z.coerce.number().int().positive().optional(),
  })
  const ragQueryBodySchema = z.object({
    query: z.string().min(1),
    datasetId: z.string().min(1).optional(),
    skillId: z.string().min(1).optional(),
    topK: z.number().int().positive().max(50).optional(),
    chatId: z.string().min(1).optional(),
    extra: z.record(z.string(), z.unknown()).optional(),
  })
  const toolAuthorizeBodySchema = z.object({
    toolName: z.string().min(1),
    skillId: z.string().min(1).optional(),
    datasetId: z.string().min(1).optional(),
    memoryProfileId: z.string().min(1).optional(),
    action: z.string().min(1).optional(),
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
  const mutateDatasetOwnerPermissionBodySchema = z.object({
    userId: z.coerce.number().int().positive(),
    action: z.enum(['grant', 'revoke']),
    datasetIds: z.array(z.string().min(1)).min(1),
  })

  const mutateSkillPermissionBodySchema = z.object({
    userId: z.coerce.number().int().positive(),
    action: z.enum(['grant', 'revoke']),
    skillIds: z.array(z.string().min(1)).min(1),
  })
  const mutateMemoryProfilePermissionBodySchema = z.object({
    userId: z.coerce.number().int().positive(),
    action: z.enum(['grant', 'revoke']),
    profileIds: z.array(z.string().min(1)).min(1),
  })
  const memoryProfileQuerySchema = z.object({
    profileId: z.string().min(1).optional(),
  })
  const updateMemoryBodySchema = z.object({
    profileId: z.string().min(1).optional(),
    content: z.string().max(200000),
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

  async function ensureRedisReady() {
    if (redis.status === 'wait') {
      await redis.connect()
    }
  }

  // policyVersion 由 Redis 版本号驱动，避免每次 context 返回 Date.now() 造成缓存无法命中。
  async function getPolicyVersion(userId: bigint) {
    const key = `${policyVersionKeyPrefix}${userId.toString()}`
    try {
      await ensureRedisReady()
      const current = await redis.get(key)
      if (current) return current
      await redis.setnx(key, '1')
      return (await redis.get(key)) ?? '1'
    } catch {
      // Redis 异常时保底返回固定值，避免接口报错阻断执行链路。
      return '0'
    }
  }

  async function loadUserPermissionContext(userId: bigint, role: Role) {
    const permissions = await prisma.permission.findMany({
      where: {
        userId,
      },
    })
    const memoryProfile = await ensureAndGetProfileByUserId(userId)
    const allowedDatasets = permissions
      .filter((p: { resourceType: string }) => p.resourceType === RESOURCE_TYPE.DATASET)
      .map((p: { resourceId: string }) => p.resourceId)
    const allowedDatasetOwners = permissions
      .filter((p: { resourceType: string }) => p.resourceType === RESOURCE_TYPE.DATASET_OWNER)
      .map((p: { resourceId: string }) => p.resourceId)
    const allowedSkills = permissions
      .filter((p: { resourceType: string }) => p.resourceType === RESOURCE_TYPE.SKILL)
      .map((p: { resourceId: string }) => p.resourceId)
    const allowedMemoryProfiles = permissions
      .filter((p: { resourceType: string }) => p.resourceType === RESOURCE_TYPE.MEMORY_PROFILE)
      .map((p: { resourceId: string }) => p.resourceId)
    const policyVersion = await getPolicyVersion(userId)
    return {
      role,
      profileId: memoryProfile.profileId,
      allowedDatasets: Array.from(new Set(allowedDatasets)),
      allowedDatasetOwners: Array.from(new Set(allowedDatasetOwners)),
      allowedSkills: Array.from(new Set(allowedSkills)),
      allowedMemoryProfiles: Array.from(new Set([memoryProfile.profileId, ...allowedMemoryProfiles])),
      policyVersion,
    }
  }

  async function bumpPolicyVersion(userId: bigint, reason: string) {
    const key = `${policyVersionKeyPrefix}${userId.toString()}`
    try {
      await ensureRedisReady()
      const next = await redis.incr(key)
      app.log.info(
        {
          userId: userId.toString(),
          policyVersion: next,
          reason,
        },
        'policy version bumped',
      )
      return String(next)
    } catch (error) {
      app.log.warn(
        {
          userId: userId.toString(),
          reason,
          error: error instanceof Error ? error.message : 'unknown',
        },
        'failed to bump policy version',
      )
      return null
    }
  }

  // 用户记忆以 profile 为隔离单元，统一落盘到 brain 存储目录下。
  function getMemoryBaseDir() {
    return path.resolve(config.SKILL_FILE_BASE_DIR, 'memory-profiles')
  }

  // 仅允许写入 memory-profiles 根目录下，避免路径穿越。
  function buildProfileMemoryFilePath(storageRoot: string) {
    const base = getMemoryBaseDir()
    const target = path.resolve(base, storageRoot, 'MEMORY.md')
    if (!target.startsWith(`${base}${path.sep}`) && target !== path.join(base, 'MEMORY.md')) {
      throw new Error('invalid profile storage path')
    }
    return target
  }

  // 解析目标 profile，并做访问权限校验。
  async function resolveMemoryTarget(
    operator: { id: bigint; role: Role },
    profileId: string | undefined,
  ) {
    const ctx = await loadUserPermissionContext(operator.id, operator.role)
    const targetProfileId = profileId?.trim() || ctx.profileId
    if (!ctx.allowedMemoryProfiles.includes(targetProfileId) && operator.role !== 'super_admin') {
      return {
        ok: false as const,
        reason: 'memory_profile_permission_denied',
        ctx,
      }
    }
    const profile = await prisma.memoryProfile.findUnique({
      where: { profileId: targetProfileId },
    })
    if (!profile) {
      return {
        ok: false as const,
        reason: 'memory_profile_not_found',
        ctx,
      }
    }
    return {
      ok: true as const,
      profile,
      ctx,
    }
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

  async function writeToolCallAudit(params: {
    traceId: string
    toolCallId?: string | null
    userId?: bigint | null
    operatorId?: bigint | null
    toolName: string
    result: 'success' | 'deny' | 'fail'
    latencyMs?: number | null
    errorMessage?: string | null
    input?: unknown
    output?: unknown
  }) {
    await prisma.toolCallAudit.create({
      data: {
        traceId: params.traceId,
        toolCallId: params.toolCallId ?? null,
        userId: params.userId ?? null,
        operatorId: params.operatorId ?? null,
        toolName: params.toolName,
        result: params.result,
        latencyMs: params.latencyMs ?? null,
        errorMessage: params.errorMessage ?? null,
        inputJson: params.input ? (params.input as object) : undefined,
        outputJson: params.output ? (params.output as object) : undefined,
      },
    })
  }

  async function writeRagQueryAudit(params: {
    traceId: string
    userId?: bigint | null
    operatorId?: bigint | null
    datasetId?: string | null
    chatId?: string | null
    queryText: string
    upstreamStatus?: number | null
    result: 'success' | 'deny' | 'fail'
    latencyMs?: number | null
    errorMessage?: string | null
    request?: unknown
    response?: unknown
  }) {
    await prisma.ragQueryAudit.create({
      data: {
        traceId: params.traceId,
        userId: params.userId ?? null,
        operatorId: params.operatorId ?? null,
        datasetId: params.datasetId ?? null,
        chatId: params.chatId ?? null,
        queryText: params.queryText,
        upstreamStatus: params.upstreamStatus ?? null,
        result: params.result,
        latencyMs: params.latencyMs ?? null,
        errorMessage: params.errorMessage ?? null,
        requestJson: params.request ? (params.request as object) : undefined,
        responseJson: params.response ? (params.response as object) : undefined,
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

  async function createRagflowChat(
    base: string,
    headers: Record<string, string>,
    name: string,
    datasetIds: string[] = [],
  ) {
    const body = datasetIds.length > 0 ? { name, dataset_ids: datasetIds } : { name }
    const resp = await fetch(`${base}/api/v1/chats`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    if (!resp.ok) {
      throw new Error(`create chat failed: ${resp.status}`)
    }
    const payload = (await resp.json()) as {
      code?: number
      message?: string
      data?: { id?: string }
    }
    if (payload?.code !== 0 || !payload?.data?.id) {
      throw new Error(payload?.message || 'create chat business failed')
    }
    return payload.data.id
  }

  async function getOrCreateUserRagflowChatId(
    base: string,
    headers: Record<string, string>,
    userId: bigint,
    datasetIds: string[] = [],
  ) {
    const key = `${ragChatKeyPrefix}${String(userId)}`
    let cached: string | null = null
    try {
      await ensureRedisReady()
      cached = await redis.get(key)
    } catch (error) {
      app.log.warn(
        {
          userId: String(userId),
          error: error instanceof Error ? error.message : 'unknown',
        },
        'redis unavailable when reading rag chat mapping; fallback to create chat',
      )
    }
    if (cached) {
      return cached
    }
    const chatName = `brain_user_${String(userId)}_${Date.now()}`
    let created: string
    const candidates = Array.from(new Set(datasetIds.filter((id) => !!id && id !== 'public-default')))
    // 优先尝试“单 dataset”绑定，避免混入无效 id 导致整批失败。
    for (const id of candidates) {
      try {
        created = await createRagflowChat(base, headers, chatName, [id])
        try {
          await ensureRedisReady()
          await redis.set(key, created)
        } catch {}
        return created
      } catch {
        // try next candidate
      }
    }
    try {
      created = await createRagflowChat(base, headers, chatName, candidates)
      try {
        await ensureRedisReady()
        await redis.set(key, created)
      } catch {}
      return created
    } catch {
      // 部分租户下 dataset 绑定可能被 RagFlow 侧校验拒绝，兜底创建空 chat 避免链路中断。
      created = await createRagflowChat(base, headers, chatName, [])
    }
    try {
      await ensureRedisReady()
      await redis.set(key, created)
    } catch {}
    return created
  }

  function buildRagflowHeaders(contentType = 'application/json') {
    const headers: Record<string, string> = {}
    if (contentType) {
      headers['Content-Type'] = contentType
    }
    if (config.RAGFLOW_AUTHORIZATION) {
      headers.Authorization = config.RAGFLOW_AUTHORIZATION
    } else if (config.RAGFLOW_BEARER_TOKEN) {
      headers.Authorization = `Bearer ${config.RAGFLOW_BEARER_TOKEN}`
    } else if (config.RAGFLOW_API_KEY) {
      headers.Authorization = `Bearer ${config.RAGFLOW_API_KEY}`
    }
    return headers
  }

  async function getFileAssetById(fileId: string) {
    return prisma.fileAsset.findUnique({
      where: { id: fileId },
    })
  }

  async function getManageableUserIds(operator: { id: bigint; role: string }) {
    if (operator.role === 'super_admin') {
      return null
    }
    // admin 仅允许查看自己与直属用户，避免扩大文件可见域。
    const subs = await prisma.user.findMany({
      where: {
        managerUserId: operator.id,
      },
      select: { id: true },
    })
    return [operator.id, ...subs.map((s: { id: bigint }) => s.id)]
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
      await bumpPolicyVersion(created.id, 'admin.users.create')
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

  app.get('/api/v1/admin/users', { preHandler: authGuard }, async (req, reply) => {
    const authedReq = req as AuthedRequest
    const operator = await getActiveOperator(authedReq, reply)
    if (!operator) return
    if (operator.role === 'user') {
      return reply.code(403).send({ message: 'forbidden' })
    }

    // super_admin 可查看全量；admin 仅查看自己及直属用户。
    const users = await prisma.user.findMany({
      where:
        operator.role === 'super_admin'
          ? {}
          : {
              OR: [{ id: operator.id }, { managerUserId: operator.id }],
            },
      orderBy: { id: 'asc' },
    })

    return users.map((user: any) => formatUser(user))
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
    await bumpPolicyVersion(updated.id, 'admin.users.update')
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

  app.delete('/api/v1/admin/users/:id', { preHandler: authGuard }, async (req, reply) => {
    const traceId = getTraceId(req)
    const authedReq = req as AuthedRequest
    const parsedParam = idParamSchema.safeParse(req.params)
    if (!parsedParam.success) {
      await writeAudit({
        traceId,
        action: 'admin.users.delete',
        result: 'fail',
      })
      return reply.code(400).send({ message: 'Invalid request' })
    }

    const operator = await getActiveOperator(authedReq, reply)
    if (!operator) return
    const target = await prisma.user.findUnique({
      where: { id: BigInt(parsedParam.data.id) },
    })
    if (!target) {
      await writeAudit({
        traceId,
        operatorId: operator.id,
        action: 'admin.users.delete',
        result: 'fail',
      })
      return reply.code(404).send({ message: 'User not found' })
    }
    if (!canManageTargetUser(operator, target)) {
      await writeAudit({
        traceId,
        userId: target.id,
        operatorId: operator.id,
        action: 'admin.users.delete',
        result: 'deny',
      })
      return reply.code(403).send({ message: 'forbidden' })
    }
    if (target.role === 'super_admin') {
      return reply.code(400).send({ message: 'cannot delete super_admin' })
    }

    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { status: 'disabled' },
    })
    await bumpPolicyVersion(updated.id, 'admin.users.delete')
    await writeAudit({
      traceId,
      userId: updated.id,
      operatorId: operator.id,
      action: 'admin.users.delete',
      resourceType: 'USER',
      resourceId: String(updated.id),
      result: 'success',
    })
    return reply.send(formatUser(updated))
  })

  registerPreServerRoutes(app, {
    authGuard,
    getActiveOperator: (req: FastifyRequest, reply: FastifyReply) =>
      getActiveOperator(req as AuthedRequest, reply),
    loadUserPermissionContext,
  })
  registerPostServerRoutes(app, {
    authGuard,
    getActiveOperator: (req: FastifyRequest, reply: FastifyReply) =>
      getActiveOperator(req as AuthedRequest, reply),
    loadUserPermissionContext,
    toolAuthorizeBodySchema,
  })

  // Register skill management routes
  registerSkillRoutes(app, {
    authGuard,
    getActiveOperator: (req: FastifyRequest, reply: FastifyReply) =>
      getActiveOperator(req as AuthedRequest, reply),
  })

  // Brain query schema - simplified brain decision endpoint
  const brainQueryBodySchema = z.object({
    query: z.string().min(1),
    conversationId: z.string().optional(),
  })

  /**
   * Brain Query Endpoint
   *
   * PROXY to brainService.ts (src brain) for proper LLM-based decision making.
   * The src brain decides: direct answer, RAG, or CAD skill.
   * Returns SSE stream or JSON based on the brain's decision.
   */
  app.post('/api/v1/brain/query', { preHandler: authGuard }, async (req, reply) => {
    const authedReq = req as AuthedRequest
    const operator = await getActiveOperator(authedReq, reply)
    if (!operator) return

    const parsed = brainQueryBodySchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ message: 'invalid request body' })
    }

    const { query, conversationId } = parsed.data

    // Get user context (pre-server equivalent)
    const ctx = await loadUserPermissionContext(operator.id, operator.role)

    // Proxy to brainService.ts (src brain) on port 3100
    // brain uses network_mode: host, so we need host.docker.internal to reach it
    const brainServiceUrl = `http://host.docker.internal:3100/api/query`
    
    try {
      const brainPayload = {
        query,
        conversationId,
        context: {
          userId: String(operator.id),
          role: operator.role,
          profileId: ctx.profileId,
        },
      }

      const brainResp = await fetch(brainServiceUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': req.headers.authorization || '',
        },
        body: JSON.stringify(brainPayload),
      })

      // Handle SSE stream response (RAG queries)
      if (brainResp.headers.get('content-type')?.includes('text/event-stream')) {
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        })

        if (brainResp.body) {
          // Convert web ReadableStream to Node.js Readable for piping
          const { Readable } = require('node:stream')
          const nodeStream = Readable.fromWeb(brainResp.body)
          nodeStream.pipe(reply.raw)
        } else {
          reply.raw.write('data: [DONE]\n\n')
          reply.raw.end()
        }
        return
      }

      // Handle JSON response (skill triggers, errors, direct answers)
      const result = await brainResp.json()

      // Pass through the response from brainService
      if (result.type === 'skill_trigger') {
        return reply.send({
          skillNeeded: true,
          skillName: result.skillName,
          skillHint: result.skillHint,
          message: result.message || `已识别 ${result.skillName} 技能调用`,
        })
      }

      if (result.type === 'error') {
        return reply.send({
          error: result.error,
          message: result.content,
        })
      }

      // Direct answer from brain
      return reply.send({
        type: result.type,
        content: result.content,
        loopCount: result.loopCount,
      })
    } catch (err) {
      req.log.error({ err }, 'brainService proxy failed')
      return reply.code(502).send({
        error: 'brain_service_unavailable',
        message: '脑服务暂不可用，请稍后重试',
      })
    }
  })

  // 返回当前用户可见的 profile 列表，供前端做”记忆切换”。
  app.get('/api/v1/memory/profiles', { preHandler: authGuard }, async (req, reply) => {
    const authedReq = req as AuthedRequest
    const operator = await getActiveOperator(authedReq, reply)
    if (!operator) return
    const ctx = await loadUserPermissionContext(operator.id, operator.role)
    return {
      currentProfileId: ctx.profileId,
      allowedProfileIds: ctx.allowedMemoryProfiles,
      memoryScope: {
        type: 'profile',
        profileId: ctx.profileId,
      },
      policyVersion: ctx.policyVersion,
    }
  })

  // 读取当前 profile 的记忆内容。
  app.get('/api/v1/memory/current', { preHandler: authGuard }, async (req, reply) => {
    const authedReq = req as AuthedRequest
    const operator = await getActiveOperator(authedReq, reply)
    if (!operator) return
    const parsed = memoryProfileQuerySchema.safeParse(req.query ?? {})
    if (!parsed.success) {
      return reply.code(400).send({ message: 'invalid query' })
    }
    const resolved = await resolveMemoryTarget(operator, parsed.data.profileId)
    if (!resolved.ok) {
      return reply.code(403).send({ message: resolved.reason })
    }
    const traceId = getTraceId(req)
    const filePath = buildProfileMemoryFilePath(resolved.profile.storageRoot)
    let content = ''
    try {
      content = await readFile(filePath, 'utf8')
    } catch {
      await mkdir(path.dirname(filePath), { recursive: true })
      await writeFile(filePath, '', 'utf8')
    }
    await writeAudit({
      traceId,
      userId: operator.id,
      operatorId: operator.id,
      action: 'memory.read',
      resourceType: RESOURCE_TYPE.MEMORY_PROFILE,
      resourceId: resolved.profile.profileId,
      result: 'success',
    })
    return {
      profileId: resolved.profile.profileId,
      content,
      memoryScope: {
        type: 'profile',
        profileId: resolved.profile.profileId,
      },
      policyVersion: resolved.ctx.policyVersion,
    }
  })

  // 更新当前 profile 的记忆内容（用户可编辑自己的记忆）。
  app.put('/api/v1/memory/current', { preHandler: authGuard }, async (req, reply) => {
    const authedReq = req as AuthedRequest
    const operator = await getActiveOperator(authedReq, reply)
    if (!operator) return
    const parsed = updateMemoryBodySchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ message: 'invalid request body' })
    }
    const resolved = await resolveMemoryTarget(operator, parsed.data.profileId)
    if (!resolved.ok) {
      return reply.code(403).send({ message: resolved.reason })
    }
    const traceId = getTraceId(req)
    const filePath = buildProfileMemoryFilePath(resolved.profile.storageRoot)
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, parsed.data.content, 'utf8')
    await writeAudit({
      traceId,
      userId: operator.id,
      operatorId: operator.id,
      action: 'memory.update',
      resourceType: RESOURCE_TYPE.MEMORY_PROFILE,
      resourceId: resolved.profile.profileId,
      result: 'success',
      payload: {
        contentLength: parsed.data.content.length,
      },
    })
    return {
      profileId: resolved.profile.profileId,
      contentLength: parsed.data.content.length,
      updated: true,
      policyVersion: resolved.ctx.policyVersion,
    }
  })

  app.get('/api/document/get/:documentId', { preHandler: authGuard }, async (req, reply) => {
    const authedReq = req as AuthedRequest
    const operator = await getActiveOperator(authedReq, reply)
    if (!operator) return
    const documentId = String((req.params as any)?.documentId || '').trim()
    if (!documentId) {
      return reply.code(400).send({ message: 'documentId is required' })
    }
    const base = config.RAGFLOW_BASE_URL.replace(/\/+$/, '')
    const resp = await fetch(`${base}/v1/document/get/${encodeURIComponent(documentId)}`, {
      method: 'GET',
      headers: buildRagflowHeaders(''),
    })
    if (!resp.ok) {
      const text = await resp.text()
      return reply.code(resp.status).send({ message: text || `HTTP ${resp.status}` })
    }
    const contentType = resp.headers.get('content-type') || 'application/octet-stream'
    const buf = Buffer.from(await resp.arrayBuffer())
    reply.header('content-type', contentType)
    return reply.send(buf)
  })

  app.get('/api/document/image/:imageId', { preHandler: authGuard }, async (req, reply) => {
    const authedReq = req as AuthedRequest
    const operator = await getActiveOperator(authedReq, reply)
    if (!operator) return
    const imageId = String((req.params as any)?.imageId || '').trim()
    if (!imageId) {
      return reply.code(400).send({ message: 'imageId is required' })
    }
    const base = config.RAGFLOW_BASE_URL.replace(/\/+$/, '')
    const resp = await fetch(`${base}/v1/document/image/${encodeURIComponent(imageId)}`, {
      method: 'GET',
      headers: buildRagflowHeaders(''),
    })
    if (!resp.ok) {
      const text = await resp.text()
      return reply.code(resp.status).send({ message: text || `HTTP ${resp.status}` })
    }
    const contentType = resp.headers.get('content-type') || 'image/jpeg'
    const buf = Buffer.from(await resp.arrayBuffer())
    reply.header('content-type', contentType)
    return reply.send(buf)
  })

  app.post('/api/v1/admin/permissions/dataset-owners', { preHandler: authGuard }, async (req, reply) => {
    const traceId = getTraceId(req)
    const authedReq = req as AuthedRequest
    const operator = await getActiveOperator(authedReq, reply)
    if (!operator) return
    const parsed = mutateDatasetOwnerPermissionBodySchema.safeParse(req.body)
    if (!parsed.success) {
      await writeAudit({
        traceId,
        action: 'admin.permissions.dataset_owners',
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
        action: 'admin.permissions.dataset_owners',
        result: 'fail',
      })
      return reply.code(404).send({ message: 'target user not found' })
    }
    if (!canManageTargetUser(operator, target)) {
      await writeAudit({
        traceId,
        userId: target.id,
        operatorId: operator.id,
        action: 'admin.permissions.dataset_owners',
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
      RESOURCE_TYPE.DATASET_OWNER,
      operator.id,
    )
    await bumpPolicyVersion(target.id, 'admin.permissions.dataset_owners')
    await writeAudit({
      traceId,
      userId: target.id,
      operatorId: operator.id,
      action: 'admin.permissions.dataset_owners',
      resourceType: 'DATASET_OWNER',
      resourceId: parsed.data.datasetIds.join(','),
      result: 'success',
      payload: parsed.data,
    })
    return {
      success: true,
      affected: parsed.data.datasetIds.length,
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
      RESOURCE_TYPE.DATASET,
      operator.id,
    )
    await bumpPolicyVersion(target.id, 'admin.permissions.datasets')
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
      RESOURCE_TYPE.SKILL,
      operator.id,
    )
    await bumpPolicyVersion(target.id, 'admin.permissions.skills')
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

  app.post('/api/v1/admin/permissions/memory-profiles', { preHandler: authGuard }, async (req, reply) => {
    const traceId = getTraceId(req)
    const authedReq = req as AuthedRequest
    const operator = await getActiveOperator(authedReq, reply)
    if (!operator) return
    const parsed = mutateMemoryProfilePermissionBodySchema.safeParse(req.body)
    if (!parsed.success) {
      await writeAudit({
        traceId,
        action: 'admin.permissions.memory_profiles',
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
        action: 'admin.permissions.memory_profiles',
        result: 'fail',
      })
      return reply.code(404).send({ message: 'target user not found' })
    }
    if (!canManageTargetUser(operator, target)) {
      await writeAudit({
        traceId,
        userId: target.id,
        operatorId: operator.id,
        action: 'admin.permissions.memory_profiles',
        result: 'deny',
      })
      return reply.code(403).send({ message: 'forbidden' })
    }

    const profiles = await prisma.memoryProfile.findMany({
      where: { profileId: { in: parsed.data.profileIds } },
      select: { profileId: true, userId: true },
    })
    if (profiles.length !== parsed.data.profileIds.length) {
      return reply.code(404).send({ message: 'some profileIds not found' })
    }
    // admin 授权 memory_profile 时，同样受“自己 + 直属用户”边界约束。
    for (const profile of profiles) {
      const owner = await prisma.user.findUnique({
        where: { id: profile.userId },
        select: { id: true, managerUserId: true },
      })
      if (!owner || !canManageTargetUser(operator, owner)) {
        return reply.code(403).send({ message: `forbidden profile scope: ${profile.profileId}` })
      }
    }

    await mutatePermissions(
      {
        userId: parsed.data.userId,
        action: parsed.data.action,
        resourceIds: parsed.data.profileIds,
      },
      RESOURCE_TYPE.MEMORY_PROFILE,
      operator.id,
    )
    await bumpPolicyVersion(target.id, 'admin.permissions.memory_profiles')
    await writeAudit({
      traceId,
      userId: target.id,
      operatorId: operator.id,
      action: 'admin.permissions.memory_profiles',
      resourceType: 'MEMORY_PROFILE',
      resourceId: parsed.data.profileIds.join(','),
      result: 'success',
      payload: parsed.data,
    })
    return {
      success: true,
      affected: parsed.data.profileIds.length,
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
      permissions: permissions.map((p: { resourceType: string; resourceId: string }) => ({
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
      items: items.map((item: any) => ({
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

  app.get('/api/v1/admin/audits/skills', { preHandler: authGuard }, async (req, reply) => {
    const authedReq = req as AuthedRequest
    const operator = await getActiveOperator(authedReq, reply)
    if (!operator) return
    if (operator.role === 'user') {
      return reply.code(403).send({ message: 'forbidden' })
    }

    const parsed = listToolCallAuditsQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      return reply.code(400).send({ message: 'invalid query' })
    }

    const { traceId, userId, operatorId, toolName, result, page, pageSize } = parsed.data
    const where = {
      ...(traceId ? { traceId } : {}),
      ...(userId ? { userId: BigInt(userId) } : {}),
      ...(operatorId ? { operatorId: BigInt(operatorId) } : {}),
      ...(toolName ? { toolName } : {}),
      ...(result ? { result } : {}),
    }
    const [items, total] = await Promise.all([
      prisma.toolCallAudit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.toolCallAudit.count({ where }),
    ])

    return {
      items: items.map((item: any) => ({
        id: String(item.id),
        traceId: item.traceId,
        toolCallId: item.toolCallId,
        userId: item.userId ? String(item.userId) : null,
        operatorId: item.operatorId ? String(item.operatorId) : null,
        toolName: item.toolName,
        result: item.result,
        latencyMs: item.latencyMs,
        errorMessage: item.errorMessage,
        input: item.inputJson,
        output: item.outputJson,
        createdAt: item.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    }
  })

  app.get('/api/v1/admin/audits/rag', { preHandler: authGuard }, async (req, reply) => {
    const authedReq = req as AuthedRequest
    const operator = await getActiveOperator(authedReq, reply)
    if (!operator) return
    if (operator.role === 'user') {
      return reply.code(403).send({ message: 'forbidden' })
    }

    const parsed = listRagQueryAuditsQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      return reply.code(400).send({ message: 'invalid query' })
    }

    const { traceId, userId, operatorId, datasetId, result, page, pageSize } = parsed.data
    const where = {
      ...(traceId ? { traceId } : {}),
      ...(userId ? { userId: BigInt(userId) } : {}),
      ...(operatorId ? { operatorId: BigInt(operatorId) } : {}),
      ...(datasetId ? { datasetId } : {}),
      ...(result ? { result } : {}),
    }
    const [items, total] = await Promise.all([
      prisma.ragQueryAudit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.ragQueryAudit.count({ where }),
    ])

    return {
      items: items.map((item: any) => ({
        id: String(item.id),
        traceId: item.traceId,
        userId: item.userId ? String(item.userId) : null,
        operatorId: item.operatorId ? String(item.operatorId) : null,
        datasetId: item.datasetId,
        chatId: item.chatId,
        queryText: item.queryText,
        upstreamStatus: item.upstreamStatus,
        result: item.result,
        latencyMs: item.latencyMs,
        errorMessage: item.errorMessage,
        request: item.requestJson,
        response: item.responseJson,
        createdAt: item.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    }
  })

  app.get('/api/v1/admin/files', { preHandler: authGuard }, async (req, reply) => {
    const authedReq = req as AuthedRequest
    const operator = await getActiveOperator(authedReq, reply)
    if (!operator) return
    if (operator.role === 'user') {
      return reply.code(403).send({ message: 'forbidden' })
    }

    const parsed = listFileAssetsQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      return reply.code(400).send({ message: 'invalid query' })
    }
    const { status, category, ownerUserId, page, pageSize } = parsed.data
    const manageableUserIds = await getManageableUserIds(operator)
    if (operator.role === 'admin' && ownerUserId && !manageableUserIds?.includes(BigInt(ownerUserId))) {
      return reply.code(403).send({ message: 'forbidden ownerUserId scope' })
    }

    const where = {
      ...(status ? { status } : {}),
      ...(category ? { category } : {}),
      ...(ownerUserId ? { ownerUserId: BigInt(ownerUserId) } : {}),
      ...(manageableUserIds ? { ownerUserId: { in: manageableUserIds } } : {}),
    }
    const [items, total] = await Promise.all([
      prisma.fileAsset.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.fileAsset.count({ where }),
    ])

    return {
      items: items.map((item: any) => ({
        id: item.id,
        ownerUserId: String(item.ownerUserId),
        fileName: item.fileName,
        category: item.category,
        status: item.status,
        statusReason: item.statusReason,
        statusUpdatedAt: item.statusUpdatedAt.toISOString(),
        sizeBytes: String(item.sizeBytes),
        createdAt: item.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    }
  })

  app.post('/api/v1/admin/files/:fileId/status', { preHandler: authGuard }, async (req, reply) => {
    const traceId = getTraceId(req)
    const authedReq = req as AuthedRequest
    const operator = await getActiveOperator(authedReq, reply)
    if (!operator) return
    if (operator.role === 'user') {
      return reply.code(403).send({ message: 'forbidden' })
    }

    const parsedParam = fileIdParamSchema.safeParse(req.params)
    const parsedBody = updateFileStatusBodySchema.safeParse(req.body)
    if (!parsedParam.success || !parsedBody.success) {
      return reply.code(400).send({ message: 'invalid request' })
    }

    const fileAsset = await getFileAssetById(parsedParam.data.fileId)
    if (!fileAsset) {
      return reply.code(404).send({ message: 'file not found' })
    }
    const owner = await prisma.user.findUnique({
      where: { id: fileAsset.ownerUserId },
      select: { id: true, managerUserId: true },
    })
    if (!owner || !canManageTargetUser(operator, owner)) {
      return reply.code(403).send({ message: 'forbidden file owner scope' })
    }

    const { status, reason } = parsedBody.data
    if (status === 'active') {
      // 回切 active 前做一次可读验证，避免状态与真实存储继续漂移。
      try {
        await readAssetBytes(fileAsset)
      } catch (error) {
        return reply.code(409).send({
          message: 'cannot set active: storage object is not readable',
          error: error instanceof Error ? error.message : 'unknown',
        })
      }
    }

    const updated = await prisma.fileAsset.update({
      where: { id: fileAsset.id },
      data: {
        status,
        statusReason: status === 'missing' ? reason ?? 'manual_mark_missing' : reason ?? null,
        statusUpdatedAt: new Date(),
      },
    })
    await writeAudit({
      traceId,
      userId: updated.ownerUserId,
      operatorId: operator.id,
      action: 'admin.files.status.update',
      resourceType: 'FILE_ASSET',
      resourceId: updated.id,
      result: 'success',
      payload: {
        status: updated.status,
        statusReason: updated.statusReason,
      },
    })

    return {
      fileId: updated.id,
      ownerUserId: String(updated.ownerUserId),
      status: updated.status,
      statusReason: updated.statusReason,
      statusUpdatedAt: updated.statusUpdatedAt.toISOString(),
    }
  })

  app.post('/api/v1/admin/files/status/batch', { preHandler: authGuard }, async (req, reply) => {
    const traceId = getTraceId(req)
    const authedReq = req as AuthedRequest
    const operator = await getActiveOperator(authedReq, reply)
    if (!operator) return
    if (operator.role === 'user') {
      return reply.code(403).send({ message: 'forbidden' })
    }

    const parsed = batchUpdateFileStatusBodySchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ message: 'invalid request body' })
    }
    const { fileIds, status, reason } = parsed.data
    const dedupIds = Array.from(new Set(fileIds))

    const assets: Array<{ id: string; ownerUserId: bigint; storagePath: string }> = await prisma.fileAsset.findMany({
      where: { id: { in: dedupIds } },
      select: { id: true, ownerUserId: true, storagePath: true },
      orderBy: { createdAt: 'desc' },
    })
    const assetMap = new Map(assets.map((a: { id: string; ownerUserId: bigint; storagePath: string }) => [a.id, a]))
    const ownerIds = Array.from(new Set(assets.map((a: { ownerUserId: bigint }) => a.ownerUserId.toString()))).map((id: string) => BigInt(id))
    const owners: Array<{ id: bigint; managerUserId: bigint | null }> = await prisma.user.findMany({
      where: { id: { in: ownerIds } },
      select: { id: true, managerUserId: true },
    })
    const ownerMap = new Map(owners.map((u: { id: bigint; managerUserId: bigint | null }) => [u.id.toString(), u]))

    let updated = 0
    const skipped: Array<{ fileId: string; reason: string }> = []
    const errors: Array<{ fileId: string; error: string }> = []

    for (const fileId of dedupIds) {
      const asset = assetMap.get(fileId)
      if (!asset) {
        skipped.push({ fileId, reason: 'not_found' })
        continue
      }
      const owner = ownerMap.get(asset.ownerUserId.toString())
      if (!owner || !canManageTargetUser(operator, owner)) {
        skipped.push({ fileId, reason: 'forbidden_owner_scope' })
        continue
      }

      if (status === 'active') {
        try {
          await readAssetBytes(asset)
        } catch (error) {
          errors.push({
            fileId,
            error: error instanceof Error ? error.message : 'unknown',
          })
          continue
        }
      }

      await prisma.fileAsset.update({
        where: { id: fileId },
        data: {
          status,
          statusReason: status === 'missing' ? reason ?? 'manual_mark_missing_batch' : reason ?? null,
          statusUpdatedAt: new Date(),
        },
      })
      updated += 1
    }

    await writeAudit({
      traceId,
      userId: null,
      operatorId: operator.id,
      action: 'admin.files.status.batch_update',
      resourceType: 'FILE_ASSET',
      resourceId: dedupIds.join(','),
      result: errors.length > 0 ? 'fail' : 'success',
      payload: {
        requestCount: dedupIds.length,
        updated,
        skippedCount: skipped.length,
        errorCount: errors.length,
        status,
      },
    })

    return {
      success: errors.length === 0,
      requestCount: dedupIds.length,
      updated,
      skipped,
      errors,
    }
  })

  app.get('/api/v1/admin/files/export', { preHandler: authGuard }, async (req, reply) => {
    const authedReq = req as AuthedRequest
    const operator = await getActiveOperator(authedReq, reply)
    if (!operator) return
    if (operator.role === 'user') {
      return reply.code(403).send({ message: 'forbidden' })
    }

    const parsed = exportFileAssetsQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      return reply.code(400).send({ message: 'invalid query' })
    }
    const { status, category, ownerUserId } = parsed.data
    const manageableUserIds = await getManageableUserIds(operator)
    if (operator.role === 'admin' && ownerUserId && !manageableUserIds?.includes(BigInt(ownerUserId))) {
      return reply.code(403).send({ message: 'forbidden ownerUserId scope' })
    }

    const where = {
      status,
      ...(category ? { category } : {}),
      ...(ownerUserId ? { ownerUserId: BigInt(ownerUserId) } : {}),
      ...(manageableUserIds ? { ownerUserId: { in: manageableUserIds } } : {}),
    }
    const rows: Array<{
      id: string
      ownerUserId: bigint
      fileName: string
      category: string
      status: string
      statusReason: string | null
      sizeBytes: bigint
      createdAt: Date
      statusUpdatedAt: Date
    }> = await prisma.fileAsset.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 5000,
    })

    const header = [
      'fileId',
      'ownerUserId',
      'fileName',
      'category',
      'status',
      'statusReason',
      'sizeBytes',
      'createdAt',
      'statusUpdatedAt',
    ].join(',')
    const csvRows = rows.map((row: {
      id: string
      ownerUserId: bigint
      fileName: string
      category: string
      status: string
      statusReason: string | null
      sizeBytes: bigint
      createdAt: Date
      statusUpdatedAt: Date
    }) =>
      [
        row.id,
        row.ownerUserId.toString(),
        JSON.stringify(row.fileName),
        row.category,
        row.status,
        JSON.stringify(row.statusReason ?? ''),
        row.sizeBytes.toString(),
        row.createdAt.toISOString(),
        row.statusUpdatedAt.toISOString(),
      ].join(','),
    )
    const csv = [header, ...csvRows].join('\n')
    const filename = `file-assets-${status}-${new Date().toISOString().slice(0, 10)}.csv`
    reply.header('Content-Disposition', `attachment; filename="${filename}"`)
    reply.type('text/csv; charset=utf-8')
    return reply.send(csv)
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

  app.post('/api/v1/rag/query/stream', { preHandler: authGuard }, async (req, reply) => {
    const authedReq = req as AuthedRequest
    const operator = await getActiveOperator(authedReq, reply)
    if (!operator) return

    const parsed = ragQueryBodySchema.safeParse(req.body)
    if (!parsed.success) {
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })
      reply.raw.write(`event: error\ndata: invalid request body\n\n`)
      reply.raw.write('data: [DONE]\n\n')
      reply.raw.end()
      return
    }

    const { query, datasetId, chatId, skillId } = parsed.data
    const traceId = getTraceId(req)
    if (operator.role !== 'super_admin' && skillId) {
      const hasSkillPerm = await prisma.permission.findFirst({
        where: {
          userId: operator.id,
          resourceType: RESOURCE_TYPE.SKILL,
          resourceId: skillId,
        },
        select: { id: true },
      })
      if (!hasSkillPerm) {
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        })
        reply.raw.write(`event: error\ndata: skill permission denied\n\n`)
        reply.raw.write('data: [DONE]\n\n')
        reply.raw.end()
        await writeRagQueryAudit({
          traceId,
          userId: operator.id,
          operatorId: operator.id,
          datasetId: datasetId ?? null,
          chatId: chatId ?? null,
          queryText: query,
          result: 'deny',
          latencyMs: 0,
          errorMessage: 'skill_permission_denied',
          request: parsed.data,
        })
        return
      }
    }
    let resolvedDatasetId: string | null = datasetId ?? null
    let allowedDatasetIds: string[] = []
    if (operator.role !== 'super_admin') {
      const allowedResources = await prisma.permission.findMany({
        where: {
          userId: operator.id,
          resourceType: { in: [RESOURCE_TYPE.DATASET, RESOURCE_TYPE.DATASET_OWNER] },
        },
        select: { resourceId: true },
        orderBy: { createdAt: 'desc' },
      })
      if (!resolvedDatasetId) {
        resolvedDatasetId = allowedResources[0]?.resourceId ?? null
      }
      allowedDatasetIds = Array.from(
        new Set(allowedResources.map((item: { resourceId: string }) => item.resourceId)),
      )
      const allowedSet = new Set(allowedResources.map((item: { resourceId: string }) => item.resourceId))
      if (resolvedDatasetId && !allowedSet.has(resolvedDatasetId)) {
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        })
        reply.raw.write(`event: error\ndata: dataset permission denied\n\n`)
        reply.raw.write('data: [DONE]\n\n')
        reply.raw.end()
        return
      }
    }
    const base = config.RAGFLOW_BASE_URL.replace(/\/+$/, '')
    const headers = buildRagflowHeaders('application/json')
    let resolvedChatId =
      chatId ??
      (operator.role !== 'super_admin'
        ? await getOrCreateUserRagflowChatId(
            base,
            headers,
            operator.id,
            resolvedDatasetId
              ? [resolvedDatasetId, ...allowedDatasetIds.filter((id) => id !== resolvedDatasetId)]
              : allowedDatasetIds,
          )
        : config.RAGFLOW_CHAT_ID ??
          (config.RAGFLOW_QUERY_PATH.includes('{chatId}')
            ? await discoverRagflowChatId(base, headers)
            : undefined))

    const pathRaw = config.RAGFLOW_QUERY_PATH.replace('{chatId}', resolvedChatId ?? '')
    const path = pathRaw.startsWith('/') ? pathRaw : `/${pathRaw}`
    const upstreamResp = await fetch(`${base}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.RAGFLOW_MODEL,
        messages: [{ role: 'user', content: query }],
        stream: true,
        extra_body: {
          reference: true,
        },
      }),
    })

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })

    if (!upstreamResp.ok || !upstreamResp.body) {
      const errText = await upstreamResp.text()
      reply.raw.write(`event: error\ndata: ${errText || `HTTP ${upstreamResp.status}`}\n\n`)
      reply.raw.write('data: [DONE]\n\n')
      reply.raw.end()
      return
    }

    const reader = upstreamResp.body.getReader()
    const decoder = new TextDecoder()
    let buffered = ''
    let answer = ''
    let references: unknown[] = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        buffered += decoder.decode()
      } else if (value) {
        buffered += decoder.decode(value, { stream: true })
      }
      const lines = buffered.split('\n')
      buffered = lines.pop() || ''
      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line.startsWith('data:')) continue
        const payloadText = line.slice(5).trim()
        if (!payloadText) continue
        if (payloadText === '[DONE]') {
          continue
        }
        try {
          const payload = JSON.parse(payloadText) as any
          const delta = payload?.choices?.[0]?.delta?.content || ''
          const deltaRef = payload?.choices?.[0]?.delta?.reference
          if (delta) {
            answer += delta
            reply.raw.write(`event: token\ndata: ${delta}\n\n`)
          }
          if (Array.isArray(deltaRef) && deltaRef.length > 0) {
            references = deltaRef
            reply.raw.write(
              `event: message\ndata: ${JSON.stringify({
                answer: '',
                data: { answer: '', references },
                references,
                source: 'RAG检索',
              })}\n\n`,
            )
          }
        } catch {
          // ignore malformed chunks
        }
      }
      if (done) break
    }
    reply.raw.write(
      `event: message\ndata: ${JSON.stringify({
        answer,
        data: { answer, references },
        references,
        source: 'RAG检索',
      })}\n\n`,
    )
    await writeRagQueryAudit({
      traceId,
      userId: operator.id,
      operatorId: operator.id,
      datasetId: resolvedDatasetId ?? null,
      chatId: resolvedChatId ?? null,
      queryText: query,
      upstreamStatus: upstreamResp.status,
      result: upstreamResp.ok ? 'success' : 'fail',
      latencyMs: 0,
      request: { query, mode: 'stream' },
      response: { answerLength: answer.length, references: Array.isArray(references) ? references.length : 0 },
    })
    await writeAudit({
      traceId,
      userId: operator.id,
      operatorId: operator.id,
      action: 'rag.query.proxy.stream',
      result: upstreamResp.ok ? 'success' : 'fail',
      resourceType: resolvedDatasetId ? 'DATASET' : null,
      resourceId: resolvedDatasetId ?? null,
      payload: { chatId: resolvedChatId ?? null },
    })
    reply.raw.write('data: [DONE]\n\n')
    reply.raw.end()
  })

  app.post('/api/v1/rag/query', { preHandler: authGuard }, async (req, reply) => {
    const traceId = getTraceId(req)
    const ragStartedAt = Date.now()
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
      await writeRagQueryAudit({
        traceId,
        userId: operator.id,
        operatorId: operator.id,
        queryText: '',
        result: 'fail',
        latencyMs: Date.now() - ragStartedAt,
        errorMessage: 'invalid_request_body',
        request: req.body ?? null,
      })
      return reply.code(400).send({ message: 'invalid request body' })
    }

    const { query, datasetId, topK, chatId, extra, skillId } = parsed.data
    if (operator.role !== 'super_admin' && skillId) {
      const hasSkillPerm = await prisma.permission.findFirst({
        where: {
          userId: operator.id,
          resourceType: RESOURCE_TYPE.SKILL,
          resourceId: skillId,
        },
        select: { id: true },
      })
      if (!hasSkillPerm) {
        await writeAudit({
          traceId,
          userId: operator.id,
          operatorId: operator.id,
          action: 'rag.query.proxy',
          result: 'deny',
          resourceType: 'SKILL',
          resourceId: skillId,
        })
        await writeRagQueryAudit({
          traceId,
          userId: operator.id,
          operatorId: operator.id,
          datasetId: datasetId ?? null,
          chatId: chatId ?? null,
          queryText: query,
          result: 'deny',
          latencyMs: Date.now() - ragStartedAt,
          errorMessage: 'skill_permission_denied',
          request: parsed.data,
        })
        return reply.code(403).send({
          message: 'skill permission denied',
        })
      }
    }
    let resolvedDatasetId: string | null = datasetId ?? null
    let allowedDatasetIds: string[] = []
    const allowedResources = await prisma.permission.findMany({
      where: {
        userId: operator.id,
        resourceType: { in: [RESOURCE_TYPE.DATASET, RESOURCE_TYPE.DATASET_OWNER] },
      },
      select: { resourceId: true },
      orderBy: { createdAt: 'desc' },
    })
    // server 自主决策：前端未指定 datasetId 时，自动选最近授权的数据集。
    if (!resolvedDatasetId) {
      resolvedDatasetId = allowedResources[0]?.resourceId ?? null
    }
    allowedDatasetIds = Array.from(
      new Set(allowedResources.map((item: { resourceId: string }) => item.resourceId)),
    )
    // 非 super_admin 用户需要校验数据集权限
    if (operator.role !== 'super_admin' && resolvedDatasetId) {
      const allowedSet = new Set(allowedDatasetIds)
      if (!allowedSet.has(resolvedDatasetId)) {
        await writeAudit({
          traceId,
          userId: operator.id,
          operatorId: operator.id,
          action: 'rag.query.proxy',
          result: 'deny',
          resourceType: 'DATASET',
          resourceId: resolvedDatasetId,
        })
        await writeRagQueryAudit({
          traceId,
          userId: operator.id,
          operatorId: operator.id,
          datasetId: resolvedDatasetId,
          chatId: chatId ?? null,
          queryText: query,
          result: 'deny',
          latencyMs: Date.now() - ragStartedAt,
          errorMessage: 'dataset_permission_denied',
          request: parsed.data,
        })
        return reply.code(403).send({
          message: 'dataset permission denied',
        })
      }
    }

    const base = config.RAGFLOW_BASE_URL.replace(/\/+$/, '')
    const headers = buildRagflowHeaders('application/json')
    // 修复：所有用户都走自己的chatId流程，不再区分super_admin
    let resolvedChatId =
      chatId ??
      config.RAGFLOW_CHAT_ID ??
      (await getOrCreateUserRagflowChatId(
        base,
        headers,
        operator.id,
        resolvedDatasetId
          ? [resolvedDatasetId, ...allowedDatasetIds.filter((id) => id !== resolvedDatasetId)]
          : allowedDatasetIds,
      ))

    async function sendRagflowRequest(chatIdToUse?: string) {
      const pathRaw = config.RAGFLOW_QUERY_PATH.replace('{chatId}', chatIdToUse ?? '')
      const path = pathRaw.startsWith('/') ? pathRaw : `/${pathRaw}`
      const url = `${base}${path}`
      const isOpenAIChatPath = path.includes('/chats_openai/')
      const bodyToUse = isOpenAIChatPath
        ? {
            model: config.RAGFLOW_MODEL,
            messages: [{ role: 'user', content: query }],
            stream: false,
            extra_body: {
              reference: true,
            },
            ...(extra ?? {}),
          }
        : {
            question: query,
            query,
            ...(resolvedDatasetId ? { datasetId: resolvedDatasetId } : {}),
            ...(topK ? { topK } : {}),
            ...(extra ?? {}),
          }
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(bodyToUse),
      })
      const raw = await response.text()
      let parsedBody: unknown = raw
      try {
        parsedBody = JSON.parse(raw)
      } catch {
        parsedBody = raw
      }
      return {
        url,
        bodyToUse,
        response,
        parsedBody,
      }
    }

    try {
      let requestResult = await sendRagflowRequest(resolvedChatId)
      // 若 chat owner 失配，自动重建该用户 chat 并重试一次。
      if (
        operator.role !== 'super_admin' &&
        requestResult.response.ok &&
        typeof requestResult.parsedBody === 'object' &&
        requestResult.parsedBody !== null &&
        (requestResult.parsedBody as any).code === 102 &&
        String((requestResult.parsedBody as any).message || '')
          .toLowerCase()
          .includes("don't own the chat")
      ) {
        const recreated = await createRagflowChat(
          base,
          headers,
          `brain_user_${String(operator.id)}_${Date.now()}`,
          resolvedDatasetId
            ? [resolvedDatasetId, ...allowedDatasetIds.filter((id) => id !== resolvedDatasetId)]
            : allowedDatasetIds,
        )
        await redis.set(`${ragChatKeyPrefix}${String(operator.id)}`, recreated)
        resolvedChatId = recreated
        requestResult = await sendRagflowRequest(resolvedChatId)
      }

      const upstreamResp = requestResult.response
      const parsedBody = requestResult.parsedBody
      const ragRequestPayload = {
        url: requestResult.url,
        chatId: resolvedChatId ?? null,
        body: requestResult.bodyToUse,
      }

      await writeAudit({
        traceId,
        userId: operator.id,
        operatorId: operator.id,
        action: 'rag.query.proxy',
        result: upstreamResp.ok ? 'success' : 'fail',
        resourceType: resolvedDatasetId ? 'DATASET' : null,
        resourceId: resolvedDatasetId ?? null,
        payload: {
          url: requestResult.url,
          chatId: resolvedChatId ?? null,
          status: upstreamResp.status,
          query,
        },
      })
      await writeRagQueryAudit({
        traceId,
        userId: operator.id,
        operatorId: operator.id,
        datasetId: resolvedDatasetId ?? null,
        chatId: resolvedChatId ?? null,
        queryText: query,
        upstreamStatus: upstreamResp.status,
        result: upstreamResp.ok ? 'success' : 'fail',
        latencyMs: Date.now() - ragStartedAt,
        request: ragRequestPayload,
        response: parsedBody,
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
        resourceType: resolvedDatasetId ? 'DATASET' : null,
        resourceId: resolvedDatasetId ?? null,
        payload: {
          error: error instanceof Error ? error.message : 'unknown',
        },
      })
      await writeRagQueryAudit({
        traceId,
        userId: operator.id,
        operatorId: operator.id,
        datasetId: resolvedDatasetId ?? null,
        chatId: chatId ?? null,
        queryText: query,
        result: 'fail',
        latencyMs: Date.now() - ragStartedAt,
        errorMessage: error instanceof Error ? error.message : 'unknown',
        request: parsed.data,
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
    if (meta.status === 'missing') {
      return reply.code(410).send({ message: 'file asset is marked missing' })
    }
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
    const toolCallStartedAt = Date.now()
    const toolCallId = randomUUID()
    const toolName = 'indicator-verification'
    const authedReq = req as AuthedRequest
    const operator = await getActiveOperator(authedReq, reply)
    if (!operator) return
    const parsed = indicatorRunBodySchema.safeParse(req.body)
    if (!parsed.success) {
      await writeToolCallAudit({
        traceId,
        toolCallId,
        userId: operator.id,
        operatorId: operator.id,
        toolName,
        result: 'fail',
        latencyMs: Date.now() - toolCallStartedAt,
        errorMessage: 'invalid_request_body',
        input: req.body ?? null,
      })
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
        await writeToolCallAudit({
          traceId,
          toolCallId,
          userId: operator.id,
          operatorId: operator.id,
          toolName,
          result: 'fail',
          latencyMs: Date.now() - toolCallStartedAt,
          errorMessage: `input_file_not_found:${inputFileId}`,
          input: parsed.data,
        })
        return reply.code(404).send({ message: `input file not found: ${inputFileId}` })
      }
      if (meta.status === 'missing') {
        await writeToolCallAudit({
          traceId,
          toolCallId,
          userId: operator.id,
          operatorId: operator.id,
          toolName,
          result: 'fail',
          latencyMs: Date.now() - toolCallStartedAt,
          errorMessage: `input_file_missing:${inputFileId}`,
          input: parsed.data,
        })
        return reply.code(410).send({ message: `input file is marked missing: ${inputFileId}` })
      }
      if (operator.role !== 'super_admin' && meta.ownerUserId !== operator.id) {
        await writeToolCallAudit({
          traceId,
          toolCallId,
          userId: operator.id,
          operatorId: operator.id,
          toolName,
          result: 'deny',
          latencyMs: Date.now() - toolCallStartedAt,
          errorMessage: `forbidden_file_access:${inputFileId}`,
          input: parsed.data,
        })
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

    try {
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
      await writeToolCallAudit({
        traceId,
        toolCallId,
        userId: operator.id,
        operatorId: operator.id,
        toolName,
        result: 'success',
        latencyMs: Date.now() - toolCallStartedAt,
        input: parsed.data,
        output: {
          jobId,
          outputCount: registeredOutputs.length,
          outputFileIds: registeredOutputs.map((item: { fileId: string }) => item.fileId),
        },
      })

      return {
        jobId,
        outputFiles: registeredOutputs,
        downloadEndpoint: '/api/v1/files/{fileId}/download',
      }
    } catch (error) {
      await writeAudit({
        traceId,
        userId: operator.id,
        operatorId: operator.id,
        action: 'skills.indicator_verification.run',
        result: 'fail',
        payload: {
          jobId,
          inputFileIds,
          error: error instanceof Error ? error.message : 'unknown',
        },
      })
      await writeToolCallAudit({
        traceId,
        toolCallId,
        userId: operator.id,
        operatorId: operator.id,
        toolName,
        result: 'fail',
        latencyMs: Date.now() - toolCallStartedAt,
        errorMessage: error instanceof Error ? error.message : 'unknown',
        input: parsed.data,
      })
      return reply.code(500).send({
        message: 'indicator-verification execution failed',
        error: error instanceof Error ? error.message : 'unknown',
      })
    }
  })

  return app
}
