import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { z } from 'zod'

type Operator = {
  id: bigint
  role: 'super_admin' | 'admin' | 'user'
}

type PermissionContext = {
  role: 'super_admin' | 'admin' | 'user'
  profileId: string
  allowedDatasets: string[]
  allowedDatasetOwners: string[]
  allowedSkills: string[]
  allowedMemoryProfiles: string[]
  policyVersion: string
}

type ToolAuthorizeBody = {
  toolName: string
  skillId?: string
  datasetId?: string
  memoryProfileId?: string
  action?: string
}

type PostServerDeps = {
  authGuard: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
  getActiveOperator: (req: FastifyRequest, reply: FastifyReply) => Promise<Operator | null | undefined>
  loadUserPermissionContext: (
    userId: bigint,
    role: 'super_admin' | 'admin' | 'user',
  ) => Promise<PermissionContext>
  toolAuthorizeBodySchema: z.ZodType<ToolAuthorizeBody>
}

export function registerPostServerRoutes(app: FastifyInstance, deps: PostServerDeps) {
  app.post('/api/v1/post/toolcall/authorize', { preHandler: deps.authGuard }, async (req, reply) => {
    const operator = await deps.getActiveOperator(req, reply)
    if (!operator) return
    const parsed = deps.toolAuthorizeBodySchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ message: 'invalid request body' })
    }
    const ctx = await deps.loadUserPermissionContext(operator.id, operator.role)
    const { toolName, skillId, datasetId, memoryProfileId, action } = parsed.data

    if (operator.role !== 'super_admin') {
      if (skillId && !ctx.allowedSkills.includes(skillId)) {
        return reply.code(403).send({
          allow: false,
          reason: 'skill_permission_denied',
          policyVersion: ctx.policyVersion,
        })
      }
      if (datasetId && !ctx.allowedDatasets.includes(datasetId)) {
        return reply.code(403).send({
          allow: false,
          reason: 'dataset_permission_denied',
          policyVersion: ctx.policyVersion,
        })
      }
      if (memoryProfileId && !ctx.allowedMemoryProfiles.includes(memoryProfileId)) {
        return reply.code(403).send({
          allow: false,
          reason: 'memory_profile_permission_denied',
          policyVersion: ctx.policyVersion,
        })
      }
    }

    const resolvedDatasetId = datasetId ?? ctx.allowedDatasets[0] ?? null
    return {
      allow: true,
      policyVersion: ctx.policyVersion,
      context: {
        toolName,
        action: action ?? null,
        skillId: skillId ?? null,
        datasetId: resolvedDatasetId,
        allowedSkills: ctx.allowedSkills,
        allowedDatasets: ctx.allowedDatasets,
        profileId: ctx.profileId,
        memoryScope: { type: 'profile', profileId: ctx.profileId },
      },
    }
  })
}
