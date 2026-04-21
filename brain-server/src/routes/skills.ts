import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { getSkillDocByName, upsertSkillDoc, getAllSkillDocs, deleteSkillDoc } from '../lib/mongodb.js'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Prisma } from '@prisma/client'

const SKILL_INPUT_BASE_DIR = process.env.SKILL_INPUT_BASE_DIR || '/tmp/brain-skill-files/inputs'

type Operator = {
  id: bigint
  role: 'super_admin' | 'admin' | 'user'
}

// Request/Response schemas
const createSkillSchema = z.object({
  name: z.string().min(1).max(128),
  displayName: z.string().max(256).optional(),
  rawMarkdown: z.string().min(1),
  status: z.enum(['active', 'inactive']).default('active'),
  allowedRoles: z.array(z.string()).default(['user']),
  scriptPath: z.string().max(512).optional(),
})

const updateSkillSchema = z.object({
  displayName: z.string().max(256).optional(),
  rawMarkdown: z.string().min(1).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  allowedRoles: z.array(z.string()).optional(),
  scriptPath: z.string().max(512).optional(),
})

const createShortcutSchema = z.object({
  skillId: z.number().int().positive(),
  name: z.string().min(1).max(128),
  displayName: z.string().max(256).optional(),
  fixedParams: z.record(z.unknown()).optional(),
  description: z.string().optional(),
})

const updateShortcutSchema = z.object({
  displayName: z.string().max(256).optional(),
  fixedParams: z.record(z.unknown()).optional(),
  description: z.string().optional(),
})

// Auth guard type
type AuthDeps = {
  authGuard: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
  getActiveOperator: (req: FastifyRequest, reply: FastifyReply) => Promise<Operator | null | undefined>
}

export function registerSkillRoutes(app: FastifyInstance, deps: AuthDeps) {
  // ==================== Skills CRUD ====================

  // List all skills (with optional status filter)
  // NOTE: This endpoint is public for internal service communication
  app.get('/api/v1/skills', async (req, reply) => {
    // Skip auth for internal services, but allow user auth if provided
    const authHeader = req.headers.authorization
    if (authHeader && authHeader.startsWith('Bearer ')) {
      await deps.authGuard(req, reply)
    }
    
    const { status } = req.query as { status?: string }
    
    const skills = await prisma.skill.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
    })

    // Return simplified format for internal use
    return skills.map(s => ({
      name: s.name,
      displayName: s.displayName,
      status: s.status,
      scriptPath: s.scriptPath,
    }))
  })

  // Get single skill with markdown content
  // NOTE: This endpoint is public for internal service communication
  app.get('/api/v1/skills/:name', async (req, reply) => {
    // Skip auth for internal services
    const authHeader = req.headers.authorization
    if (authHeader && authHeader.startsWith('Bearer ')) {
      await deps.authGuard(req, reply)
    }
    
    const { name } = req.params as { name: string }
    
    const skill = await prisma.skill.findUnique({
      where: { name },
      include: { shortcuts: true }
    })

    if (!skill) {
      return reply.code(404).send({ error: 'Skill not found' })
    }

    // Get markdown content from MongoDB
    const mongoDoc = await getSkillDocByName(name)
    const rawMarkdown = mongoDoc?.rawMarkdown || ''

    // Return simplified format without BigInt fields
    return {
      name: skill.name,
      displayName: skill.displayName,
      status: skill.status,
      allowedRoles: skill.allowedRoles,
      scriptPath: skill.scriptPath,
      rawMarkdown,
    }
  })

  // Create a new skill
  app.post('/api/v1/skills', async (req, reply) => {
    await deps.authGuard(req, reply)
    const operator = await deps.getActiveOperator(req, reply)
    if (!operator) return

    if (operator.role === 'user') {
      return reply.code(403).send({ error: 'Only admin can create skills' })
    }

    const parsed = createSkillSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request body', details: parsed.error.issues })
    }

    const { name, displayName, rawMarkdown, status, allowedRoles, scriptPath } = parsed.data

    try {
      // Check if skill already exists
      const existing = await prisma.skill.findUnique({ where: { name } })
      if (existing) {
        return reply.code(409).send({ error: 'Skill already exists' })
      }

      // Store markdown in MongoDB
      const mongoId = await upsertSkillDoc(name, rawMarkdown)

      // Create skill in PostgreSQL
      const skill = await prisma.skill.create({
        data: {
          name,
          displayName: displayName || name,
          mongoDocId: mongoId.toString(),
          status,
          allowedRoles,
          scriptPath,
        }
      })

      return reply.code(201).send(skill)
    } catch (err) {
      console.error('Failed to create skill:', err)
      return reply.code(500).send({ error: 'Failed to create skill' })
    }
  })

  // Update a skill
  app.put('/api/v1/skills/:name', async (req, reply) => {
    await deps.authGuard(req, reply)
    const operator = await deps.getActiveOperator(req, reply)
    if (!operator) return

    if (operator.role === 'user') {
      return reply.code(403).send({ error: 'Only admin can update skills' })
    }

    const { name } = req.params as { name: string }
    const parsed = updateSkillSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request body', details: parsed.error.issues })
    }

    const { displayName, rawMarkdown, status, allowedRoles, scriptPath } = parsed.data

    try {
      const existing = await prisma.skill.findUnique({ where: { name } })
      if (!existing) {
        return reply.code(404).send({ error: 'Skill not found' })
      }

      // Update markdown in MongoDB if provided
      if (rawMarkdown !== undefined) {
        await upsertSkillDoc(name, rawMarkdown)
      }

      // Update skill in PostgreSQL
      const skill = await prisma.skill.update({
        where: { name },
        data: {
          displayName,
          status,
          allowedRoles,
          scriptPath,
        }
      })

      return skill
    } catch (err) {
      console.error('Failed to update skill:', err)
      return reply.code(500).send({ error: 'Failed to update skill' })
    }
  })

  // Delete a skill
  app.delete('/api/v1/skills/:name', async (req, reply) => {
    await deps.authGuard(req, reply)
    const operator = await deps.getActiveOperator(req, reply)
    if (!operator) return

    if (operator.role !== 'super_admin') {
      return reply.code(403).send({ error: 'Only super_admin can delete skills' })
    }

    const { name } = req.params as { name: string }

    try {
      const existing = await prisma.skill.findUnique({ where: { name } })
      if (!existing) {
        return reply.code(404).send({ error: 'Skill not found' })
      }

      // Delete from PostgreSQL (cascades to shortcuts)
      await prisma.skill.delete({ where: { name } })

      // Delete from MongoDB
      await deleteSkillDoc(name)

      return { success: true }
    } catch (err) {
      console.error('Failed to delete skill:', err)
      return reply.code(500).send({ error: 'Failed to delete skill' })
    }
  })

  // ==================== Skill Shortcuts CRUD ====================

  // List shortcuts for a skill
  app.get('/api/v1/skills/:name/shortcuts', async (req, reply) => {
    await deps.authGuard(req, reply)
    const operator = await deps.getActiveOperator(req, reply)
    if (!operator) return

    const { name } = req.params as { name: string }
    
    const skill = await prisma.skill.findUnique({ where: { name } })
    if (!skill) {
      return reply.code(404).send({ error: 'Skill not found' })
    }

    const shortcuts = await prisma.skillShortcut.findMany({
      where: { skillId: skill.id },
      orderBy: { createdAt: 'asc' }
    })

    return shortcuts
  })

  // Create a shortcut
  app.post('/api/v1/skills/:name/shortcuts', async (req, reply) => {
    await deps.authGuard(req, reply)
    const operator = await deps.getActiveOperator(req, reply)
    if (!operator) return

    if (operator.role === 'user') {
      return reply.code(403).send({ error: 'Only admin can create shortcuts' })
    }

    const { name } = req.params as { name: string }
    const parsed = createShortcutSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request body', details: parsed.error.issues })
    }

    const skill = await prisma.skill.findUnique({ where: { name } })
    if (!skill) {
      return reply.code(404).send({ error: 'Skill not found' })
    }

    try {
      const shortcut = await prisma.skillShortcut.create({
        data: {
          skillId: skill.id,
          name: parsed.data.name,
          displayName: parsed.data.displayName,
          fixedParams: (parsed.data.fixedParams as Prisma.JsonObject) ?? undefined,
          description: parsed.data.description,
        }
      })

      return reply.code(201).send(shortcut)
    } catch (err) {
      console.error('Failed to create shortcut:', err)
      return reply.code(500).send({ error: 'Failed to create shortcut' })
    }
  })

  // Update a shortcut
  app.put('/api/v1/skills/:skillName/shortcuts/:shortcutId', async (req, reply) => {
    await deps.authGuard(req, reply)
    const operator = await deps.getActiveOperator(req, reply)
    if (!operator) return

    if (operator.role === 'user') {
      return reply.code(403).send({ error: 'Only admin can update shortcuts' })
    }

    const { shortcutId } = req.params as { shortcutId: string }
    const parsed = updateShortcutSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request body', details: parsed.error.issues })
    }

    try {
      const shortcut = await prisma.skillShortcut.update({
        where: { id: BigInt(shortcutId) },
        data: {
          displayName: parsed.data.displayName,
          fixedParams: (parsed.data.fixedParams as Prisma.JsonObject) ?? undefined,
          description: parsed.data.description,
        }
      })

      return shortcut
    } catch (err) {
      console.error('Failed to update shortcut:', err)
      return reply.code(500).send({ error: 'Failed to update shortcut' })
    }
  })

  // Delete a shortcut
  app.delete('/api/v1/skills/:skillName/shortcuts/:shortcutId', async (req, reply) => {
    await deps.authGuard(req, reply)
    const operator = await deps.getActiveOperator(req, reply)
    if (!operator) return

    if (operator.role === 'user') {
      return reply.code(403).send({ error: 'Only admin can delete shortcuts' })
    }

    const { shortcutId } = req.params as { shortcutId: string }

    try {
      await prisma.skillShortcut.delete({
        where: { id: BigInt(shortcutId) }
      })

      return { success: true }
    } catch (err) {
      console.error('Failed to delete shortcut:', err)
      return reply.code(500).send({ error: 'Failed to delete shortcut' })
    }
  })

  // ==================== Agent Tool APIs (for frontend) ====================

  // Get tool catalog for frontend (converts skills to tool format)
  app.get('/api/v1/agent/tool/catalog', async (req, reply) => {
    await deps.authGuard(req, reply)
    const operator = await deps.getActiveOperator(req, reply)
    if (!operator) return

    const skills = await prisma.skill.findMany({
      where: {
        status: 'active',
        allowedRoles: { has: operator.role }
      }
    })

    // Convert skills to tool catalog format
    const catalog = await Promise.all(
      skills.map(async (skill) => {
        const mongoDoc = await getSkillDocByName(skill.name)
        const rawMarkdown = mongoDoc?.rawMarkdown || ''
        
        // Parse frontmatter from markdown
        const frontmatterMatch = rawMarkdown.match(/^---\n([\s\S]*?)\n---/)
        let frontmatter: Record<string, unknown> = {}
        if (frontmatterMatch) {
          try {
            // Simple YAML-like parsing
            const lines = frontmatterMatch[1].split('\n')
            for (const line of lines) {
              const [key, ...valueParts] = line.split(':')
              if (key && valueParts.length > 0) {
                const value = valueParts.join(':').trim()
                if (value.startsWith('"') && value.endsWith('"')) {
                  frontmatter[key.trim()] = value.slice(1, -1)
                } else if (value.startsWith('[') && value.endsWith(']')) {
                  frontmatter[key.trim()] = value.slice(1, -1).split(',').map(s => s.trim().replace(/"/g, ''))
                } else {
                  frontmatter[key.trim()] = value
                }
              }
            }
          } catch {
            // Ignore parsing errors
          }
        }

        return {
          tool_code: skill.name,
          tool_name: skill.name,
          displayName: skill.displayName || skill.name,
          description: frontmatter.description || skill.displayName || skill.name,
          upload_required: false,
          parameters_schema: {
            type: 'object',
            properties: {},
            required: []
          },
          accepted_file_types: [],
          max_files: 0
        }
      })
    )

    return catalog
  })

  // Create tool draft (for manual skill invocation)
  const createDraftSchema = z.object({
    conversationId: z.string().optional(),
    toolCode: z.string().min(1),
    query: z.string().optional(),
  })

  app.post('/api/v1/agent/tool/draft', async (req, reply) => {
    await deps.authGuard(req, reply)
    const operator = await deps.getActiveOperator(req, reply)
    if (!operator) return

    const parsed = createDraftSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request body', details: parsed.error.issues })
    }

    const { conversationId, toolCode, query } = parsed.data

    // Verify skill exists
    const skill = await prisma.skill.findUnique({
      where: { name: toolCode }
    })

    if (!skill) {
      return reply.code(404).send({ error: 'Skill not found' })
    }

    // Get skill markdown
    const mongoDoc = await getSkillDocByName(toolCode)
    const rawMarkdown = mongoDoc?.rawMarkdown || ''

    const toolCallId = `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`

    return {
      toolCallId,
      toolCode,
      toolName: skill.displayName || skill.name,
      toolSpec: {
        description: skill.displayName || skill.name,
        upload_required: false,
        parameters_schema: { type: 'object', properties: {} }
      },
      draftArgs: {},
      query: query || '',
      markdown: rawMarkdown
    }
  })

  // Upload file for tool call
  const toolUploadQuerySchema = z.object({
    toolCallId: z.string().min(1),
  })

  app.post('/api/v1/agent/tool/upload', { preHandler: deps.authGuard }, async (req, reply) => {
    const operator = await deps.getActiveOperator(req, reply)
    if (!operator) return

    const parsed = toolUploadQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid query params' })
    }

    const { toolCallId } = parsed.data

    // Get uploaded file
    const data = await req.file()
    if (!data) {
      return reply.code(400).send({ error: 'No file uploaded' })
    }

    const fileName = data.filename || 'upload.bin'
    const buffer = await data.toBuffer()

    // Store file in skill inputs directory
    const skillInputDir = path.join(SKILL_INPUT_BASE_DIR, toolCallId)
    await mkdir(skillInputDir, { recursive: true })
    
    const filePath = path.join(skillInputDir, fileName)
    await writeFile(filePath, buffer)

    return {
      success: true,
      toolCallId,
      fileId: `file-${Date.now()}`,
      fileName,
      fileSize: buffer.length,
      filePath
    }
  })

  // Approve tool call
  const approveToolSchema = z.object({
    conversationId: z.string().optional(),
    toolCallId: z.string().min(1),
    reviewedArgs: z.record(z.unknown()).optional(),
  })

  app.post('/api/v1/agent/tool/approve', async (req, reply) => {
    await deps.authGuard(req, reply)
    const operator = await deps.getActiveOperator(req, reply)
    if (!operator) return

    const parsed = approveToolSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request body' })
    }

    const { toolCallId, reviewedArgs } = parsed.data

    // This would trigger actual skill execution
    // For now, return a placeholder result
    return {
      success: true,
      toolCallId,
      summary: 'Skill execution placeholder - implement actual skill execution here',
      output: reviewedArgs || {}
    }
  })

  // ==================== Internal: Get skill markdown for brain ====================

  // Internal endpoint for brain service to get skill markdown
  app.get('/api/v1/internal/skills/:name/markdown', async (req, reply) => {
    const { name } = req.params as { name: string }
    
    const skill = await prisma.skill.findUnique({ where: { name } })
    if (!skill || skill.status !== 'active') {
      return reply.code(404).send({ error: 'Skill not found or inactive' })
    }

    const mongoDoc = await getSkillDocByName(name)
    if (!mongoDoc) {
      return reply.code(404).send({ error: 'Skill markdown not found' })
    }

    return { name, rawMarkdown: mongoDoc.rawMarkdown }
  })
}
