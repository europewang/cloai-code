import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

const MAX_MESSAGES_PER_CONVERSATION = 1000

type Operator = {
  id: bigint
  role: 'super_admin' | 'admin' | 'user'
}

type AuthDeps = {
  authGuard: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
  getActiveOperator: (req: FastifyRequest, reply: FastifyReply) => Promise<Operator | null | undefined>
}

const createConversationSchema = z.object({
  title: z.string().min(1).max(256).optional().default('新会话'),
})

const updateConversationSchema = z.object({
  title: z.string().min(1).max(256),
})

const sendMessageSchema = z.object({
  conversationId: z.number().int().positive(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
})

const listMessagesSchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(50),
  beforeId: z.coerce.number().int().positive().optional(),
})

const conversationContextSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
})

export function registerConversationRoutes(app: FastifyInstance, deps: AuthDeps) {
  const { prisma } = require('../lib/prisma.js')

  async function loadConversationWithAccessCheck(
    operator: Operator,
    conversationId: string,
  ) {
    const conversation = await prisma.conversation.findUnique({
      where: { id: BigInt(conversationId) },
    })

    if (!conversation) {
      return {
        ok: false as const,
        status: 404,
        error: 'Conversation not found',
      }
    }

    if (conversation.userId !== operator.id && operator.role === 'user') {
      return {
        ok: false as const,
        status: 403,
        error: 'Access denied',
      }
    }

    return {
      ok: true as const,
      conversation,
    }
  }

  // ==================== Conversation CRUD ====================

  // List conversations for current user
  app.get('/api/v1/conversations', { preHandler: deps.authGuard }, async (req, reply) => {
    const operator = await deps.getActiveOperator(req, reply)
    if (!operator) return

    const { page = 1, pageSize = 20 } = req.query as { page?: number, pageSize?: number }

    const skip = (Math.max(1, page) - 1) * Math.min(100, Math.max(1, pageSize))

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where: { userId: operator.id },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: Math.min(100, Math.max(1, pageSize)),
        select: {
          id: true,
          title: true,
          messageCount: true,
          lastMessageAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.conversation.count({ where: { userId: operator.id } }),
    ])

    return {
      items: conversations.map((c: any) => ({
        id: String(c.id),
        title: c.title,
        messageCount: c.messageCount,
        lastMessageAt: c.lastMessageAt,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
      total,
      page: Math.max(1, page),
      pageSize: Math.min(100, Math.max(1, pageSize)),
      hasMore: skip + conversations.length < total,
    }
  })

  // Create a new conversation
  app.post('/api/v1/conversations', { preHandler: deps.authGuard }, async (req, reply) => {
    const operator = await deps.getActiveOperator(req, reply)
    if (!operator) return

    const parsed = createConversationSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request body', details: parsed.error.issues })
    }

    const conversation = await prisma.conversation.create({
      data: {
        userId: operator.id,
        title: parsed.data.title,
      },
    })

    return reply.code(201).send({
      id: String(conversation.id),
      title: conversation.title,
      messageCount: conversation.messageCount,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    })
  })

  // Get single conversation
  app.get('/api/v1/conversations/:id', { preHandler: deps.authGuard }, async (req, reply) => {
    const operator = await deps.getActiveOperator(req, reply)
    if (!operator) return

    const { id } = req.params as { id: string }

    const conversation = await prisma.conversation.findUnique({
      where: { id: BigInt(id) },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: MAX_MESSAGES_PER_CONVERSATION,
          select: {
            id: true,
            role: true,
            content: true,
            metadata: true,
            createdAt: true,
          },
        },
      },
    })

    if (!conversation) {
      return reply.code(404).send({ error: 'Conversation not found' })
    }

    // Check ownership or admin access
    if (conversation.userId !== operator.id && operator.role === 'user') {
      return reply.code(403).send({ error: 'Access denied' })
    }

    return {
      id: String(conversation.id),
      title: conversation.title,
      messageCount: conversation.messageCount,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messages: conversation.messages.map((m: any) => ({
        id: String(m.id),
        role: m.role,
        content: m.content,
        metadata: m.metadata,
        createdAt: m.createdAt,
      })),
    }
  })

  // Update conversation title
  app.patch('/api/v1/conversations/:id', { preHandler: deps.authGuard }, async (req, reply) => {
    const operator = await deps.getActiveOperator(req, reply)
    if (!operator) return

    const { id } = req.params as { id: string }
    const parsed = updateConversationSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request body', details: parsed.error.issues })
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: BigInt(id) },
    })

    if (!conversation) {
      return reply.code(404).send({ error: 'Conversation not found' })
    }

    if (conversation.userId !== operator.id && operator.role === 'user') {
      return reply.code(403).send({ error: 'Access denied' })
    }

    const updated = await prisma.conversation.update({
      where: { id: BigInt(id) },
      data: { title: parsed.data.title },
    })

    return {
      id: String(updated.id),
      title: updated.title,
      messageCount: updated.messageCount,
      updatedAt: updated.updatedAt,
    }
  })

  // Delete conversation
  app.delete('/api/v1/conversations/:id', { preHandler: deps.authGuard }, async (req, reply) => {
    const operator = await deps.getActiveOperator(req, reply)
    if (!operator) return

    const { id } = req.params as { id: string }

    const conversation = await prisma.conversation.findUnique({
      where: { id: BigInt(id) },
    })

    if (!conversation) {
      return reply.code(404).send({ error: 'Conversation not found' })
    }

    if (conversation.userId !== operator.id && operator.role === 'user') {
      return reply.code(403).send({ error: 'Access denied' })
    }

    await prisma.conversation.delete({
      where: { id: BigInt(id) },
    })

    return { success: true }
  })

  // ==================== Message Management ====================

  // Send a message (append to conversation)
  app.post('/api/v1/conversations/:id/messages', { preHandler: deps.authGuard }, async (req, reply) => {
    const operator = await deps.getActiveOperator(req, reply)
    if (!operator) return

    const { id } = req.params as { id: string }
    const body = req.body as Record<string, unknown>
    const parsed = sendMessageSchema.safeParse({
      ...body,
      conversationId: parseInt(id, 10),
    })
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request body', details: parsed.error.issues })
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: BigInt(id) },
    })

    if (!conversation) {
      return reply.code(404).send({ error: 'Conversation not found' })
    }

    if (conversation.userId !== operator.id && operator.role === 'user') {
      return reply.code(403).send({ error: 'Access denied' })
    }

    // Check message count limit
    if (conversation.messageCount >= MAX_MESSAGES_PER_CONVERSATION) {
      return reply.code(400).send({
        error: 'Message limit reached',
        message: `Conversation has reached maximum of ${MAX_MESSAGES_PER_CONVERSATION} messages`,
      })
    }

    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: parsed.data.role,
        content: parsed.data.content,
        metadata: parsed.data.metadata,
      },
    })

    // Update conversation stats
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        messageCount: { increment: 1 },
        lastMessageAt: new Date(),
      },
    })

    return reply.code(201).send({
      id: String(message.id),
      role: message.role,
      content: message.content,
      metadata: message.metadata,
      createdAt: message.createdAt,
    })
  })

  // List messages in a conversation (with pagination for loading older messages)
  app.get('/api/v1/conversations/:id/messages', { preHandler: deps.authGuard }, async (req, reply) => {
    const operator = await deps.getActiveOperator(req, reply)
    if (!operator) return

    const { id } = req.params as { id: string }
    const { page = 1, pageSize = 50, beforeId } = req.query as { page?: number, pageSize?: number, beforeId?: number }

    const conversation = await prisma.conversation.findUnique({
      where: { id: BigInt(id) },
    })

    if (!conversation) {
      return reply.code(404).send({ error: 'Conversation not found' })
    }

    if (conversation.userId !== operator.id && operator.role === 'user') {
      return reply.code(403).send({ error: 'Access denied' })
    }

    const whereClause: any = { conversationId: BigInt(id) }
    if (beforeId) {
      whereClause.id = { lt: BigInt(beforeId) }
    }

    const skip = beforeId ? 0 : (Math.max(1, page) - 1) * Math.min(100, Math.max(1, pageSize))

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where: whereClause,
        orderBy: beforeId ? { id: 'desc' } : { createdAt: 'asc' },
        skip,
        take: Math.min(100, Math.max(1, pageSize)),
        select: {
          id: true,
          role: true,
          content: true,
          metadata: true,
          createdAt: true,
        },
      }),
      beforeId ? 0 : prisma.message.count({ where: { conversationId: BigInt(id) } }),
    ])

    // For paginated load (beforeId), reverse to get chronological order
    const orderedMessages = beforeId ? messages.reverse() : messages

    return {
      items: orderedMessages.map((m: any) => ({
        id: String(m.id),
        role: m.role,
        content: m.content,
        metadata: m.metadata,
        createdAt: m.createdAt,
      })),
      total,
      page: Math.max(1, page),
      pageSize: Math.min(100, Math.max(1, pageSize)),
      hasMore: beforeId ? messages.length === Math.min(100, Math.max(1, pageSize)) : skip + messages.length < total,
    }
  })

  // Get recent conversation context for the current operator.
  app.get('/api/v1/conversations/:id/context', { preHandler: deps.authGuard }, async (req, reply) => {
    const operator = await deps.getActiveOperator(req, reply)
    if (!operator) return

    const { id } = req.params as { id: string }
    const parsed = conversationContextSchema.safeParse(req.query ?? {})
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid query', details: parsed.error.issues })
    }

    const resolved = await loadConversationWithAccessCheck(operator, id)
    if (!resolved.ok) {
      return reply.code(resolved.status).send({ error: resolved.error })
    }

    const messages = await prisma.message.findMany({
      where: { conversationId: BigInt(id) },
      orderBy: { createdAt: 'desc' },
      take: parsed.data.limit,
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true,
      },
    })

    const orderedMessages = messages.reverse()
    return {
      conversationId: String(resolved.conversation.id),
      messages: orderedMessages.map((m: any) => ({
        id: String(m.id),
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      })),
      fetchedCount: orderedMessages.length,
    }
  })

  // ==================== Admin: View User Conversations ====================

  // Admin: List all conversations for a specific user
  app.get('/api/v1/admin/users/:userId/conversations', { preHandler: deps.authGuard }, async (req, reply) => {
    const operator = await deps.getActiveOperator(req, reply)
    if (!operator) return

    if (operator.role === 'user') {
      return reply.code(403).send({ error: 'Access denied' })
    }

    const { userId } = req.params as { userId: string }
    const { page = 1, pageSize = 20 } = req.query as { page?: number, pageSize?: number }

    // Check if operator can view this user's data
    const targetUser = await prisma.user.findUnique({
      where: { id: BigInt(userId) },
    })

    if (!targetUser) {
      return reply.code(404).send({ error: 'User not found' })
    }

    if (operator.role === 'admin') {
      // Admin can only view their subordinates
      if (targetUser.managerUserId !== operator.id) {
        return reply.code(403).send({ error: 'Access denied' })
      }
    }

    const skip = (Math.max(1, page) - 1) * Math.min(100, Math.max(1, pageSize))

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where: { userId: BigInt(userId) },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: Math.min(100, Math.max(1, pageSize)),
        select: {
          id: true,
          title: true,
          messageCount: true,
          lastMessageAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.conversation.count({ where: { userId: BigInt(userId) } }),
    ])

    return {
      items: conversations.map((c: any) => ({
        id: String(c.id),
        title: c.title,
        messageCount: c.messageCount,
        lastMessageAt: c.lastMessageAt,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        userId: userId,
        username: targetUser.username,
      })),
      total,
      page: Math.max(1, page),
      pageSize: Math.min(100, Math.max(1, pageSize)),
      hasMore: skip + conversations.length < total,
    }
  })

  // Admin: Get conversation details with messages
  app.get('/api/v1/admin/conversations/:id', { preHandler: deps.authGuard }, async (req, reply) => {
    const operator = await deps.getActiveOperator(req, reply)
    if (!operator) return

    if (operator.role === 'user') {
      return reply.code(403).send({ error: 'Access denied' })
    }

    const { id } = req.params as { id: string }

    const conversation = await prisma.conversation.findUnique({
      where: { id: BigInt(id) },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            role: true,
            content: true,
            metadata: true,
            createdAt: true,
          },
        },
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    })

    if (!conversation) {
      return reply.code(404).send({ error: 'Conversation not found' })
    }

    // Admin permission check
    if (operator.role === 'admin' && conversation.user.managerUserId !== operator.id) {
      return reply.code(403).send({ error: 'Access denied' })
    }

    return {
      id: String(conversation.id),
      title: conversation.title,
      messageCount: conversation.messageCount,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      user: {
        id: String(conversation.user.id),
        username: conversation.user.username,
      },
      messages: conversation.messages.map((m: any) => ({
        id: String(m.id),
        role: m.role,
        content: m.content,
        metadata: m.metadata,
        createdAt: m.createdAt,
      })),
    }
  })

  // Admin: Get conversation statistics for all managed users
  // Query params:
  //   mode = 'month' | 'week' | 'day'  (default: 'month')
  //   date = YYYY-MM-DD                   (default: today)
  //   top = number (default: 20)
  app.get('/api/v1/admin/conversations/stats', { preHandler: deps.authGuard }, async (req, reply) => {
    const operator = await deps.getActiveOperator(req, reply)
    if (!operator) return

    if (operator.role === 'user') {
      return reply.code(403).send({ error: 'Access denied' })
    }

    // Parse query params
    const { mode = 'month', date, top = '20' } = req.query as {
      mode?: string; date?: string; top?: string
    }
    const validMode = ['month', 'week', 'day'].includes(mode) ? mode : 'month'
    const topN = Math.min(100, Math.max(1, parseInt(top, 10) || 20))

    // Resolve target date
    const now = new Date()
    let targetDate: Date
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      targetDate = new Date(date + 'T00:00:00.000Z')
      if (Number.isNaN(targetDate.getTime())) targetDate = now
    } else {
      targetDate = now
    }

    // Compute period boundaries
    const year = targetDate.getFullYear()
    const month = targetDate.getMonth() // 0-based

    // Month: 1st of month to last day of month
    const monthStart = new Date(Date.UTC(year, month, 1))
    const monthEnd = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999))

    // Week: Monday to Sunday of the week containing targetDate
    const dow = targetDate.getUTCDay() || 7 // 1=Mon ... 7=Sun
    const weekStart = new Date(targetDate)
    weekStart.setUTCDate(targetDate.getUTCDate() - dow + 1)
    weekStart.setUTCHours(0, 0, 0, 0)
    const weekEnd = new Date(weekStart)
    weekEnd.setUTCDate(weekStart.getUTCDate() + 6)
    weekEnd.setUTCHours(23, 59, 59, 999)

    // Day: midnight to midnight UTC
    const dayStart = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate()))
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1)

    let periodStart: Date, periodEnd: Date
    if (validMode === 'month') { periodStart = monthStart; periodEnd = monthEnd }
    else if (validMode === 'week') { periodStart = weekStart; periodEnd = weekEnd }
    else { periodStart = dayStart; periodEnd = dayEnd }

    // Build user filter based on role
    const userWhereClause = operator.role === 'super_admin'
      ? {}
      : { managerUserId: operator.id }

    // Get all users
    const users = await prisma.user.findMany({
      where: userWhereClause,
      select: {
        id: true,
        username: true,
        role: true,
        createdAt: true,
        conversations: {
          select: {
            id: true,
            messageCount: true,
            createdAt: true,
            updatedAt: true,
            lastMessageAt: true,
          },
        },
      },
    })

    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    // ---- Aggregate overall stats ----
    const stats = users.map((user: any) => {
      const totalMessages = user.conversations.reduce((sum: number, c: any) => sum + c.messageCount, 0)
      const conv30d = user.conversations.filter((c: any) => new Date(c.createdAt) >= thirtyDaysAgo).length
      const conv7d = user.conversations.filter((c: any) => new Date(c.lastMessageAt || c.updatedAt) >= sevenDaysAgo).length
      const messages30d = user.conversations
        .filter((c: any) => new Date(c.updatedAt) >= thirtyDaysAgo)
        .reduce((sum: number, c: any) => sum + c.messageCount, 0)

      return {
        userId: String(user.id),
        username: user.username,
        role: user.role,
        userCreatedAt: user.createdAt,
        totalConversations: user.conversations.length,
        totalMessages,
        conversationsLast30Days: conv30d,
        conversationsLast7Days: conv7d,
        messagesLast30Days: messages30d,
      }
    })

    // ---- Top N users by messages in selected period ----
    const periodMessages = await prisma.message.findMany({
      where: {
        createdAt: { gte: periodStart, lte: periodEnd },
        ...(operator.role !== 'super_admin' ? { conversation: { userId: operator.id } } : {}),
      },
      select: { conversation: { select: { userId: true } }, createdAt: true },
    })
    const msgCountByUser: Record<string, number> = {}
    periodMessages.forEach((m: any) => {
      const uid = String(m.conversation.userId)
      msgCountByUser[uid] = (msgCountByUser[uid] || 0) + 1
    })
    const userMap: Record<string, { username: string; role: string }> = {}
    users.forEach((u: any) => { userMap[String(u.id)] = { username: u.username, role: u.role } })
    const topUsers = Object.entries(msgCountByUser)
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([uid, count]) => ({
        userId: uid,
        username: userMap[uid]?.username || uid,
        role: userMap[uid]?.role || 'user',
        totalMessages: count,
        totalConversations: 0,
      }))

    // ---- 7-day bar chart: always the week around targetDate ----
    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart)
      d.setUTCDate(weekStart.getUTCDate() + i)
      const dayStr = d.toISOString().split('T')[0]
      return {
        date: dayStr,
        label: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`,
        count: 0,
        isSelected: dayStr === targetDate.toISOString().split('T')[0],
      }
    })
    const weekMsgs = await prisma.message.findMany({
      where: {
        createdAt: { gte: weekStart, lte: weekEnd },
        ...(operator.role !== 'super_admin' ? { conversation: { userId: operator.id } } : {}),
      },
      select: { createdAt: true },
    })
    weekDays.forEach((day) => {
      day.count = weekMsgs.filter((m: any) => {
        return m.createdAt.toISOString().split('T')[0] === day.date
      }).length
    })

    // ---- Hourly distribution: scoped to selected period ----
    const hourlyDist = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      label: `${String(h).padStart(2, '0')}:00`,
      count: 0,
    }))
    periodMessages.forEach((m: any) => {
      // Convert UTC to China local time (UTC+8)
      const localHour = (new Date(m.createdAt).getUTCHours() + 8) % 24
      hourlyDist[localHour].count++
    })

    // ---- Per-user daily frequency (7-day week around targetDate) ----
    const userDailyFreq: Record<string, { date: string; label: string; count: number; isSelected: boolean }[]> = {}
    for (const user of users) {
      const uid = String(user.id)
      const uMsgs = await prisma.message.findMany({
        where: {
          createdAt: { gte: weekStart, lte: weekEnd },
          conversation: { userId: user.id },
        },
        select: { createdAt: true },
      })
      userDailyFreq[uid] = weekDays.map((day) => ({
        date: day.date,
        label: day.label,
        count: uMsgs.filter((m: any) => m.createdAt.toISOString().split('T')[0] === day.date).length,
        isSelected: day.isSelected,
      }))
    }

    // ---- Per-user hourly distribution (scoped to selected period) ----
    const userHourlyDist: Record<string, { hour: number; label: string; count: number }[]> = {}
    for (const user of users) {
      const uid = String(user.id)
      const uMsgs = periodMessages.filter((m: any) => String(m.conversation.userId) === uid)
      userHourlyDist[uid] = hourlyDist.map((h) => ({
        hour: h.hour,
        label: h.label,
        count: uMsgs.filter((m: any) => (new Date(m.createdAt).getUTCHours() + 8) % 24 === h.hour).length,
      }))
    }

    return {
      stats,
      generatedAt: now.toISOString(),
      mode: validMode,
      date: targetDate.toISOString().split('T')[0],
      period: {
        start: periodStart.toISOString(),
        end: periodEnd.toISOString(),
        weekStart: weekStart.toISOString(),
      },
      weekDays,
      hourlyDistribution: hourlyDist,
      topUsers,
      userDailyFrequency: userDailyFreq,
      userHourlyDistribution: userHourlyDist,
    }
  })

  // ==================== Brain Service Integration ====================

  // Save message from brain query (internal endpoint)
  app.post('/api/v1/internal/conversations/:id/messages', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { role, content, metadata } = req.body as {
      role: string
      content: string
      metadata?: Record<string, unknown>
    }

    if (!role || !content) {
      return reply.code(400).send({ error: 'Missing required fields' })
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: BigInt(id) },
    })

    if (!conversation) {
      return reply.code(404).send({ error: 'Conversation not found' })
    }

    if (conversation.messageCount >= MAX_MESSAGES_PER_CONVERSATION) {
      return reply.code(400).send({ error: 'Message limit reached' })
    }

    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role,
        content,
        metadata,
      },
    })

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        messageCount: { increment: 1 },
        lastMessageAt: new Date(),
      },
    })

    return reply.code(201).send({
      id: String(message.id),
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
    })
  })

  // Get conversation context for brain service (last N messages)
  app.get('/api/v1/internal/conversations/:id/context', { preHandler: deps.authGuard }, async (req, reply) => {
    const operator = await deps.getActiveOperator(req, reply)
    if (!operator) return

    const { id } = req.params as { id: string }
    const parsed = conversationContextSchema.safeParse(req.query ?? {})
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid query', details: parsed.error.issues })
    }

    const resolved = await loadConversationWithAccessCheck(operator, id)
    if (!resolved.ok) {
      return reply.code(resolved.status).send({ error: resolved.error })
    }

    const messages = await prisma.message.findMany({
      where: { conversationId: BigInt(id) },
      orderBy: { createdAt: 'desc' },
      take: parsed.data.limit,
      select: {
        role: true,
        content: true,
        createdAt: true,
      },
    })

    return {
      messages: messages.reverse().map((m: any) => ({
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      })),
      fetchedCount: messages.length,
    }
  })
}
