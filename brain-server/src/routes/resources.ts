import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { z } from 'zod'

type Operator = {
  id: bigint
  role: 'super_admin' | 'admin' | 'user'
}

type AuthDeps = {
  authGuard: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
  getActiveOperator: (req: FastifyRequest, reply: FastifyReply) => Promise<Operator | null | undefined>
}

export async function registerResourceRoutes(app: FastifyInstance, deps: AuthDeps) {

  async function getOp(req: FastifyRequest, reply: FastifyReply): Promise<Operator | null> {
    const op = await deps.getActiveOperator(req, reply)
    if (!op) return null
    return op
  }

  // ============================================================
  // 知识库 CRUD
  // ============================================================
  const kbCreateSchema = z.object({
    ragDatasetId: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    isShared: z.boolean().default(false),
  })

  app.post('/api/v1/kb', { preHandler: deps.authGuard }, async (req: FastifyRequest, reply: FastifyReply) => {
    const op = await getOp(req, reply)
    if (!op) return
    const body = kbCreateSchema.parse(req.body)
    const kb = await prisma.knowledgeBase.create({
      data: { ...body, ownerId: op.id },
    })
    return reply.code(201).send({
      id: String(kb.id),
      ragDatasetId: kb.ragDatasetId,
      name: kb.name,
      description: kb.description,
      isShared: kb.isShared,
      ownerId: String(kb.ownerId),
      createdAt: kb.createdAt,
    })
  })

  app.get('/api/v1/kb', { preHandler: deps.authGuard }, async (req: FastifyRequest, reply: FastifyReply) => {
    const op = await getOp(req, reply)
    if (!op) return
    const where = op.role === 'super_admin'
      ? {}
      : {
          OR: [
            { ownerId: op.id },
            ...(op.role === 'admin' ? [{ isShared: true }] : []),
          ]
        }
    const items = await prisma.knowledgeBase.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { owner: { select: { id: true, username: true } } },
    })
    return {
      items: items.map(kb => ({
        id: String(kb.id),
        ragDatasetId: kb.ragDatasetId,
        name: kb.name,
        description: kb.description,
        isShared: kb.isShared,
        ownerId: String(kb.ownerId),
        ownerUsername: kb.owner?.username || '',
        createdAt: kb.createdAt,
      }))
    }
  })

  app.put('/api/v1/kb/:id', { preHandler: deps.authGuard }, async (req: FastifyRequest, reply: FastifyReply) => {
    const op = await getOp(req, reply)
    if (!op) return
    const { id } = req.params as { id: string }
    const body = z.object({
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      isShared: z.boolean().optional(),
    }).parse(req.body)
    const kb = await prisma.knowledgeBase.update({
      where: { id: BigInt(id) },
      data: body,
    })
    return {
      id: String(kb.id),
      ragDatasetId: kb.ragDatasetId,
      name: kb.name,
      description: kb.description,
      isShared: kb.isShared,
      ownerId: String(kb.ownerId),
    }
  })

  app.delete('/api/v1/kb/:id', { preHandler: deps.authGuard }, async (req: FastifyRequest, reply: FastifyReply) => {
    const op = await getOp(req, reply)
    if (!op) return
    const { id } = req.params as { id: string }
    await prisma.knowledgeBase.delete({ where: { id: BigInt(id) } })
    return { success: true }
  })

  // ============================================================
  // LLM 模型管理
  // ============================================================
  const modelCreateSchema = z.object({
    name: z.string().min(1),
    displayName: z.string().min(1),
    modelType: z.string().min(1),
    baseUrl: z.string().min(1),
    apiKey: z.string().optional(),
    maxTokens: z.number().int().positive().optional(),
  })

  app.post('/api/v1/models', { preHandler: deps.authGuard }, async (req: FastifyRequest, reply: FastifyReply) => {
    const op = await getOp(req, reply)
    if (!op) return
    const body = modelCreateSchema.parse(req.body)
    // 设为默认前先取消其他默认
    await prisma.llmModel.updateMany({
      where: { ownerId: op.id },
      data: { isDefault: false },
    })
    const model = await prisma.llmModel.create({
      data: { ...body, ownerId: op.id, isDefault: true },
    })
    return reply.code(201).send({
      id: String(model.id),
      name: model.name,
      displayName: model.displayName,
      modelType: model.modelType,
      baseUrl: model.baseUrl,
      apiKey: model.apiKey ? '******' : '',
      maxTokens: model.maxTokens,
      isActive: model.isActive,
      isDefault: model.isDefault,
      lastCheckAt: model.lastCheckAt,
      lastCheckOk: model.lastCheckOk,
    })
  })

  app.get('/api/v1/models', { preHandler: deps.authGuard }, async (req: FastifyRequest, reply: FastifyReply) => {
    const op = await getOp(req, reply)
    if (!op) return
    const models = await prisma.llmModel.findMany({
      where: { ownerId: op.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    })
    return {
      items: models.map(m => ({
        id: String(m.id),
        name: m.name,
        displayName: m.displayName,
        modelType: m.modelType,
        baseUrl: m.baseUrl,
        apiKey: m.apiKey ? '******' : '',
        maxTokens: m.maxTokens,
        isActive: m.isActive,
        isDefault: m.isDefault,
        lastCheckAt: m.lastCheckAt,
        lastCheckOk: m.lastCheckOk,
      }))
    }
  })

  app.put('/api/v1/models/:id', { preHandler: deps.authGuard }, async (req: FastifyRequest, reply: FastifyReply) => {
    const op = await getOp(req, reply)
    if (!op) return
    const { id } = req.params as { id: string }
    const body = z.object({
      name: z.string().min(1).optional(),
      displayName: z.string().min(1).optional(),
      modelType: z.string().min(1).optional(),
      baseUrl: z.string().min(1).optional(),
      apiKey: z.string().optional(),
      maxTokens: z.number().int().positive().optional(),
      isActive: z.boolean().optional(),
      isDefault: z.boolean().optional(),
    }).parse(req.body)
    if (body.isDefault) {
      await prisma.llmModel.updateMany({
        where: { ownerId: op.id, id: { not: BigInt(id) } },
        data: { isDefault: false },
      })
    }
    const model = await prisma.llmModel.update({
      where: { id: BigInt(id) },
      data: body,
    })
    return {
      id: String(model.id),
      name: model.name,
      displayName: model.displayName,
      modelType: model.modelType,
      baseUrl: model.baseUrl,
      apiKey: model.apiKey ? '******' : '',
      maxTokens: model.maxTokens,
      isActive: model.isActive,
      isDefault: model.isDefault,
      lastCheckAt: model.lastCheckAt,
      lastCheckOk: model.lastCheckOk,
    }
  })

  app.delete('/api/v1/models/:id', { preHandler: deps.authGuard }, async (req: FastifyRequest, reply: FastifyReply) => {
    const op = await getOp(req, reply)
    if (!op) return
    const { id } = req.params as { id: string }
    await prisma.llmModel.delete({ where: { id: BigInt(id) } })
    return { success: true }
  })

  app.post('/api/v1/models/:id/test', { preHandler: deps.authGuard }, async (req: FastifyRequest, reply: FastifyReply) => {
    const op = await getOp(req, reply)
    if (!op) return
    const { id } = req.params as { id: string }
    const model = await prisma.llmModel.findUnique({ where: { id: BigInt(id) } })
    if (!model) return reply.code(404).send({ message: 'Model not found' })
    let ok = false
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (model.apiKey) headers['Authorization'] = `Bearer ${model.apiKey}`
      const reqBody: Record<string, unknown> = { model: model.name }
      if (model.modelType === 'ollama') {
        reqBody.options = { num_predict: 10 }
      } else {
        reqBody.max_tokens = 10
      }
      const res = await fetch(`${model.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], ...reqBody }),
        signal: AbortSignal.timeout(8000),
      })
      ok = res.ok
    } catch {
      ok = false
    }
    await prisma.llmModel.update({
      where: { id: BigInt(id) },
      data: { lastCheckAt: new Date(), lastCheckOk: ok },
    })
    return { ok }
  })

  app.get('/api/v1/models/default', { preHandler: deps.authGuard }, async (req: FastifyRequest, reply: FastifyReply) => {
    const op = await getOp(req, reply)
    if (!op) return
    const model = await prisma.llmModel.findFirst({
      where: { ownerId: op.id, isDefault: true },
    })
    if (!model) return { model: null }
    return {
      model: {
        id: String(model.id),
        name: model.name,
        displayName: model.displayName,
        modelType: model.modelType,
        baseUrl: model.baseUrl,
        apiKey: model.apiKey ? '******' : '',
      }
    }
  })

  app.put('/api/v1/models/:id/set-default', { preHandler: deps.authGuard }, async (req: FastifyRequest, reply: FastifyReply) => {
    const op = await getOp(req, reply)
    if (!op) return
    const { id } = req.params as { id: string }
    await prisma.llmModel.updateMany({
      where: { ownerId: op.id },
      data: { isDefault: false },
    })
    await prisma.llmModel.update({
      where: { id: BigInt(id) },
      data: { isDefault: true },
    })
    return { success: true }
  })

  // ============================================================
  // 数据库连接管理
  // ============================================================
  const dbConnCreateSchema = z.object({
    name: z.string().min(1),
    dbType: z.string().min(1),
    host: z.string().min(1),
    port: z.number().int().positive(),
    databaseName: z.string().min(1),
    username: z.string().min(1),
    password: z.string(),
  })

  app.post('/api/v1/db-connections', { preHandler: deps.authGuard }, async (req: FastifyRequest, reply: FastifyReply) => {
    const op = await getOp(req, reply)
    if (!op) return
    const body = dbConnCreateSchema.parse(req.body)
    const conn = await prisma.databaseConnection.create({
      data: { ...body, ownerId: op.id },
    })
    return reply.code(201).send({
      id: String(conn.id),
      name: conn.name,
      dbType: conn.dbType,
      host: conn.host,
      port: conn.port,
      databaseName: conn.databaseName,
      username: conn.username,
    })
  })

  app.get('/api/v1/db-connections', { preHandler: deps.authGuard }, async (req: FastifyRequest, reply: FastifyReply) => {
    const op = await getOp(req, reply)
    if (!op) return
    const where = op.role === 'super_admin' ? {} : { ownerId: op.id }
    const items = await prisma.databaseConnection.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })
    return {
      items: items.map(c => ({
        id: String(c.id),
        name: c.name,
        dbType: c.dbType,
        host: c.host,
        port: c.port,
        databaseName: c.databaseName,
        username: c.username,
        createdAt: c.createdAt,
      }))
    }
  })

  app.delete('/api/v1/db-connections/:id', { preHandler: deps.authGuard }, async (req: FastifyRequest, reply: FastifyReply) => {
    const op = await getOp(req, reply)
    if (!op) return
    const { id } = req.params as { id: string }
    await prisma.databaseConnection.delete({ where: { id: BigInt(id) } })
    return { success: true }
  })

  // ============================================================
  // 技能库列表（当前用户可用的技能）
  // ============================================================
  app.get('/api/v1/skill-catalog', { preHandler: deps.authGuard }, async (req: FastifyRequest, reply: FastifyReply) => {
    const op = await getOp(req, reply)
    if (!op) return
    const skills = await prisma.skill.findMany({
      where: {
        status: 'active',
        OR: [
          { allowedRoles: { has: op.role } },
          { ownerId: op.id },
        ],
      },
      orderBy: { createdAt: 'desc' },
    })
    return {
      items: skills.map(s => ({
        name: s.name,
        displayName: s.displayName || s.name,
        allowedRoles: s.allowedRoles,
      }))
    }
  })
}
