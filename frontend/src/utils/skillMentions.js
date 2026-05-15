const SKILL_USAGE_KEY_PREFIX = 'ai4kb_skill_usage_'

function getStorageKey(username) {
  return `${SKILL_USAGE_KEY_PREFIX}${String(username || '').trim()}`
}

function normalizeToolName(toolName) {
  return String(toolName || '').trim().toLowerCase()
}

function readUsageMap(username) {
  if (typeof window === 'undefined' || !username) {
    return {}
  }
  try {
    const raw = window.localStorage.getItem(getStorageKey(username))
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeUsageMap(username, usageMap) {
  if (typeof window === 'undefined' || !username) {
    return
  }
  try {
    window.localStorage.setItem(getStorageKey(username), JSON.stringify(usageMap))
  } catch {
    // 忽略本地存储失败，避免影响主流程。
  }
}

export function recordSkillUsage(username, toolNames) {
  const safeNames = Array.isArray(toolNames) ? toolNames : [toolNames]
  const usageMap = readUsageMap(username)
  const now = Date.now()

  safeNames.forEach((toolName) => {
    const key = normalizeToolName(toolName)
    if (!key) return
    const current = usageMap[key] || { count: 0, lastUsedAt: 0 }
    usageMap[key] = {
      count: Number(current.count || 0) + 1,
      lastUsedAt: now,
    }
  })

  writeUsageMap(username, usageMap)
}

export function getSkillUsageScore(username, toolName) {
  const key = normalizeToolName(toolName)
  if (!key) return 0
  const record = readUsageMap(username)[key]
  if (!record) return 0

  const count = Number(record.count || 0)
  const lastUsedAt = Number(record.lastUsedAt || 0)
  const ageHours = Math.max(0, (Date.now() - lastUsedAt) / (1000 * 60 * 60))
  const freshness = Math.max(0, 72 - ageHours)

  return count * 1000 + freshness
}
