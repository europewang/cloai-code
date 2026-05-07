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

export function registerConversationRoutes(app: FastifyInstance, deps: AuthDeps) {
  const { prisma } = require('../lib/prisma.js')

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
  app.get('/api/v1/admin/conversations/stats', { preHandler: deps.authGuard }, async (req, reply) => {
    const operator = await deps.getActiveOperator(req, reply)
    if (!operator) return

    if (operator.role === 'user') {
      return reply.code(403).send({ error: 'Access denied' })
    }

    // Build user filter based on role
    const userWhereClause = operator.role === 'super_admin'
      ? {}
      : { managerUserId: operator.id }

    // Get all users with their conversation stats
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

    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const stats = users.map((user: any) => {
      const totalMessages = user.conversations.reduce((sum: number, c: any) => sum + c.messageCount, 0)
      const conv30d = user.conversations.filter((c: any) => new Date(c.createdAt) >= thirtyDaysAgo).length
      const conv7d = user.conversations.filter((c: any) => new Date(c.lastMessageAt || c.updatedAt) >= sevenDaysAgo).length
      const messages30d = user.conversations
        .filter((c: any) => {
          const recentMessages = c.messageCount // Simplified: count all messages in recent conversations
          return new Date(c.updatedAt) >= thirtyDaysAgo
        })
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

    return {
      stats,
      generatedAt: now.toISOString(),
      period: {
        last7Days: sevenDaysAgo.toISOString(),
        last30Days: thirtyDaysAgo.toISOString(),
      },
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
  app.get('/api/v1/internal/conversations/:id/context', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { limit = 20 } = req.query as { limit?: number }

    const messages = await prisma.message.findMany({
      where: { conversationId: BigInt(id) },
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, Math.max(1, Number(limit) || 20)),
      select: {
        role: true,
        content: true,
        createdAt: true,
      },
    })

    // Return in chronological order (oldest first)
    return {
      messages: messages.reverse().map((m: any) => ({
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      })),
      totalInConversation: messages.length,
    }
  })
}
