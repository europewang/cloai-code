import { FastifyInstance } from 'fastify'
import { z } from 'zod'

const getSettingsSchema = z.object({
  type: z.enum(['conversations', 'knowledge', 'databases', 'skills', 'models']).optional(),
})

const saveSettingsSchema = z.object({
  conversations: z.object({
    order: z.array(z.string()),
    pinned: z.array(z.string()),
    expanded: z.boolean().optional(),
  }).optional(),
  groups: z.record(z.array(z.object({
    id: z.string(),
    label: z.string(),
    order: z.array(z.string()),
  }))).optional(),
})

export function registerUserSettingsRoutes(app: FastifyInstance, deps: {
  authGuard: any
  getActiveOperator: (req: any, reply: any) => Promise<any>
}) {
  const { prisma } = require('../lib/prisma.js')

  // GET /api/v1/user/settings — 获取当前用户设置
  app.get('/api/v1/user/settings', { preHandler: deps.authGuard }, async (req, reply) => {
    const operator = await deps.getActiveOperator(req, reply)
    if (!operator) return

    const parsed = getSettingsSchema.safeParse(req.query)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid query', details: parsed.error.issues })
    }

    const user = await prisma.user.findUnique({
      where: { id: operator.id },
      select: { settings: true },
    })

    const settings = (user?.settings as any) || {}
    const { type } = parsed.data

    if (type) {
      return settings[type] ?? {}
    }

    return settings
  })

  // PATCH /api/v1/user/settings — 保存用户设置
  app.patch('/api/v1/user/settings', { preHandler: deps.authGuard }, async (req, reply) => {
    const operator = await deps.getActiveOperator(req, reply)
    if (!operator) return

    const parsed = saveSettingsSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request body', details: parsed.error.issues })
    }

    const user = await prisma.user.findUnique({
      where: { id: operator.id },
      select: { settings: true },
    })

    const currentSettings = ((user?.settings as any) || {}) as Record<string, any>
    const incoming = parsed.data as Record<string, any>

    const newSettings: Record<string, any> = {}
    for (const key of Object.keys(incoming)) {
      newSettings[key] = incoming[key]
    }

    const merged = { ...currentSettings, ...newSettings }

    await prisma.user.update({
      where: { id: operator.id },
      data: { settings: merged },
    })

    return { success: true, settings: merged }
  })
}
