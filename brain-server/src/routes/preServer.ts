import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

type PermissionContext = {
  role: 'super_admin' | 'admin' | 'user'
  profileId: string
  allowedDatasets: string[]
  allowedDatasetOwners: string[]
  allowedSkills: string[]
  allowedMemoryProfiles: string[]
  policyVersion: string
}

type Operator = {
  id: bigint
  role: 'super_admin' | 'admin' | 'user'
}

type PreServerDeps = {
  authGuard: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
  getActiveOperator: (req: FastifyRequest, reply: FastifyReply) => Promise<Operator | null | undefined>
  loadUserPermissionContext: (
    userId: bigint,
    role: 'super_admin' | 'admin' | 'user',
  ) => Promise<PermissionContext>
}

export function registerPreServerRoutes(app: FastifyInstance, deps: PreServerDeps) {
  app.get('/api/v1/brain/context', { preHandler: deps.authGuard }, async (req, reply) => {
    const operator = await deps.getActiveOperator(req, reply)
    if (!operator) return
    return deps.loadUserPermissionContext(operator.id, operator.role)
  })

  app.get('/api/v1/pre/context', { preHandler: deps.authGuard }, async (req, reply) => {
    const operator = await deps.getActiveOperator(req, reply)
    if (!operator) return
    const ctx = await deps.loadUserPermissionContext(operator.id, operator.role)
    return {
      ...ctx,
      memoryScope: {
        type: 'profile',
        profileId: ctx.profileId,
      },
    }
  })
}
