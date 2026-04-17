type PreContextResponse = {
  allowedSkills?: string[]
  allowedDatasets?: string[]
  profileId?: string
  policyVersion?: string
}

type AuthorizeResponse = {
  allow: boolean
  reason?: string
  policyVersion?: string
  context?: {
    datasetId?: string | null
    skillId?: string | null
    allowedSkills?: string[]
    allowedDatasets?: string[]
    profileId?: string
  }
}

type AuthorizeRequest = {
  toolName: string
  skillId?: string
  datasetId?: string
  memoryProfileId?: string
  action?: string
}

type CurrentMemoryResponse = {
  profileId: string
  content: string
  memoryScope?: {
    type: string
    profileId?: string
  }
  policyVersion?: string
}

function getBrainBaseUrl() {
  const base = process.env.BRAIN_SERVER_BASE_URL?.trim()
  return base ? base.replace(/\/+$/, '') : ''
}

// Dynamic token storage - can be set per-request to avoid circular HTTP calls
let dynamicBrainToken: string | null = null

export function getBrainToken() {
  // Use dynamic token if set (e.g., by brainService for user's JWT token)
  if (dynamicBrainToken !== null) {
    return dynamicBrainToken
  }
  return process.env.BRAIN_SERVER_ACCESS_TOKEN?.trim() || ''
}

/**
 * Set the brain token dynamically (e.g., user's JWT token from request)
 * This is used by brainService to pass the user's token to SkillTool.checkPermissions
 * Call this before running query, then call clearBrainToken() after
 */
export function setBrainToken(token: string): void {
  dynamicBrainToken = token
  // Also update env var so child processes (like forked skills) inherit the token
  process.env.BRAIN_SERVER_ACCESS_TOKEN = token
}

/**
 * Clear the dynamic brain token
 */
export function clearBrainToken(): void {
  dynamicBrainToken = null
  // Clear env var as well
  delete process.env.BRAIN_SERVER_ACCESS_TOKEN
}

function isEnabled() {
  return Boolean(getBrainBaseUrl() && getBrainToken())
}

function getHeaders() {
  const token = getBrainToken()
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
}

export async function fetchPreContext(): Promise<PreContextResponse | null> {
  if (!isEnabled()) return null
  const resp = await fetch(`${getBrainBaseUrl()}/api/v1/pre/context`, {
    method: 'GET',
    headers: getHeaders(),
  })
  if (!resp.ok) return null
  return (await resp.json()) as PreContextResponse
}

export async function authorizeToolCall(
  payload: AuthorizeRequest,
): Promise<AuthorizeResponse | null> {
  if (!isEnabled()) return null
  const resp = await fetch(`${getBrainBaseUrl()}/api/v1/post/toolcall/authorize`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  })
  if (resp.status === 403) {
    const denied = (await resp.json()) as { reason?: string; policyVersion?: string }
    return {
      allow: false,
      reason: denied.reason || 'permission_denied',
      policyVersion: denied.policyVersion,
    }
  }
  if (!resp.ok) return null
  return (await resp.json()) as AuthorizeResponse
}

export async function fetchCurrentMemory(profileId?: string): Promise<CurrentMemoryResponse | null> {
  if (!isEnabled()) return null
  const q = profileId || process.env.BRAIN_MEMORY_PROFILE_ID
  const suffix = q ? `?profileId=${encodeURIComponent(q)}` : ''
  const resp = await fetch(`${getBrainBaseUrl()}/api/v1/memory/current${suffix}`, {
    method: 'GET',
    headers: getHeaders(),
  })
  if (!resp.ok) return null
  return (await resp.json()) as CurrentMemoryResponse
}
