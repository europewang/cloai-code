const API_BASE = '/api'
const AUTH_SESSION_KEY = 'ai4kb_auth_session'

export function loadAuthSession() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(AUTH_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.token || !parsed?.user?.role || !parsed?.user?.username) return null
    return parsed
  } catch {
    return null
  }
}

function saveAuthSession(session) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session))
}

function getRefreshToken() {
  return loadAuthSession()?.refreshToken || ''
}

function getAuthToken() {
  return loadAuthSession()?.token || ''
}

export function appendAuthToken(url) {
  const token = getAuthToken()
  if (!token) return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}token=${encodeURIComponent(token)}`
}

export async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {})
  const token = getAuthToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  })

  if (res.status === 401) {
    const refreshToken = getRefreshToken()
    if (refreshToken) {
      try {
        const refreshRes = await fetch(`${API_BASE}/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        })
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json()
          if (refreshData.accessToken) {
            const session = loadAuthSession()
            if (session) saveAuthSession({ ...session, token: refreshData.accessToken })
            const newHeaders = new Headers(options.headers || {})
            newHeaders.set('Authorization', `Bearer ${refreshData.accessToken}`)
            return fetch(`${API_BASE}${path}`, {
              ...options,
              headers: newHeaders,
            })
          }
        }
      } catch {
        // ignore and fall through to auth-expired flow
      }
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ai4kb-auth-expired'))
    }
    throw new Error('登录已过期，请重新登录')
  }

  if (res.status === 403) {
    throw new Error('当前账号无权限执行该操作')
  }

  return res
}

export async function fetchToolCatalog() {
  const res = await apiFetch('/v1/agent/tool/catalog')
  if (!res.ok) throw new Error('加载技能目录失败')
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

export async function createToolDraft(conversationId, toolCode, query = '') {
  const res = await apiFetch('/v1/agent/tool/draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId, toolCode, query }),
  })
  if (!res.ok) throw new Error('创建技能草稿失败')
  return res.json()
}

export async function createConversation(title = '') {
  const res = await apiFetch('/v1/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
  if (res.status === 409) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.message || '会话数量已达上限')
  }
  if (!res.ok) throw new Error('创建会话失败')
  return res.json()
}

export async function fetchDatasets() {
  try {
    const res = await apiFetch('/v1/admin/datasets')
    if (res.ok) {
      const data = await res.json()
      return Array.isArray(data) ? data : []
    }
  } catch (error) {
    console.warn('Failed to fetch datasets:', error)
  }

  const users = await fetchUsers()
  const datasetSet = new Set()
  for (const user of users) {
    try {
      const permsRes = await apiFetch(`/v1/admin/users/${user.id}/permissions`)
      if (!permsRes.ok) continue
      const permsJson = await permsRes.json()
      const perms = Array.isArray(permsJson) ? permsJson : (permsJson?.permissions || [])
      if (!Array.isArray(perms)) continue
      perms.forEach((item) => {
        if ((item?.resourceType === 'DATASET' || item?.resourceType === 'DATASET_OWNER') && item?.resourceId) {
          datasetSet.add(String(item.resourceId))
        }
      })
    } catch {
      // ignore individual user permission failures
    }
  }
  return Array.from(datasetSet).map((id) => ({ id, name: id }))
}

export async function createDataset(name, isShared = false) {
  const res = await apiFetch('/v1/admin/datasets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, isShared }),
  })
  if (!res.ok) throw new Error('Failed to create dataset')
  return res.json()
}

export async function updateDatasetShare(id, isShared, allowedUserIds) {
  const res = await apiFetch(`/v1/admin/datasets/${id}/share`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isShared, allowedUserIds }),
  })
  if (!res.ok) throw new Error('更新共享设置失败')
  return res.json()
}

export async function deleteDataset(id) {
  const res = await apiFetch(`/v1/admin/datasets/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete dataset')
  return res.json()
}

export async function deleteDatasets(ids) {
  const res = await apiFetch('/v1/admin/datasets', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
  if (!res.ok) throw new Error('Failed to delete datasets')
  return res.json()
}

export async function updateDataset(id, name, description, language, permission, parserConfig) {
  const body = { name, description }
  if (language) body.language = language
  if (permission) body.permission = permission
  if (parserConfig) body.parser_config = parserConfig

  const res = await apiFetch(`/v1/admin/datasets/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('Failed to update dataset')
  return res.json()
}

export async function updateDocument(datasetId, docId, name) {
  const res = await apiFetch(`/admin/datasets/${datasetId}/documents/${docId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) throw new Error('Failed to update document')
  return res.json()
}

export async function fetchConversations({ page = 1, pageSize = 50 } = {}) {
  const safePage = Math.max(1, Number.parseInt(String(page), 10) || 1)
  const safePageSize = Math.max(1, Math.min(100, Number.parseInt(String(pageSize), 10) || 50))
  const res = await apiFetch(`/v1/conversations?page=${safePage}&pageSize=${safePageSize}`)
  if (!res.ok) throw new Error('加载会话列表失败')
  const data = await res.json()
  return {
    items: Array.isArray(data?.items) ? data.items : [],
    total: Number(data?.total || 0),
    page: Number(data?.page || safePage),
    pageSize: Number(data?.pageSize || safePageSize),
    hasMore: Boolean(data?.has_more),
    maxConversations: Number(data?.max_conversations || 20),
  }
}

export async function fetchDocuments(datasetId, page = 1, pageSize = 100) {
  const res = await apiFetch(`/v1/admin/datasets/${datasetId}/documents?page=${page}&page_size=${pageSize}&t=${Date.now()}`)
  if (!res.ok) throw new Error('Failed to fetch documents')
  const json = await res.json()
  if (json.data && Array.isArray(json.data.docs)) {
    return json.data.docs
  }
  return Array.isArray(json.data) ? json.data : []
}

export async function uploadDocument(datasetId, file) {
  const formData = new FormData()
  formData.append('file', file)

  const res = await apiFetch(`/v1/admin/datasets/${datasetId}/documents`, {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) throw new Error('Failed to upload document')
  return res.json()
}

export async function deleteDocuments(datasetId, ids) {
  const res = await apiFetch(`/v1/admin/datasets/${datasetId}/documents`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
  if (!res.ok) throw new Error('Failed to delete documents')
  return res.json()
}

export async function runDocuments(datasetId, docIds) {
  const res = await apiFetch(`/v1/admin/datasets/${datasetId}/documents/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ document_ids: docIds }),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`HTTP ${res.status}: ${errText}`)
  }
  return res.json()
}

export async function getDocumentFile(datasetId, docId) {
  const res = await apiFetch(`/v1/admin/datasets/${datasetId}/documents/${docId}/file`)
  if (!res.ok) throw new Error('Failed to fetch document file')
  return res.blob()
}

export async function fetchChunks(datasetId, docId, page = 1, pageSize = 10000) {
  const res = await apiFetch(`/v1/admin/datasets/${datasetId}/documents/${docId}/chunks?page=${page}&page_size=${pageSize}`)
  if (!res.ok) throw new Error('Failed to fetch chunks')
  const json = await res.json()
  return json.data || []
}

export async function fetchConversationMessages(conversationId, { beforeId, limit = 50 } = {}) {
  const params = new URLSearchParams()
  const safeLimit = Math.max(1, Math.min(100, Number.parseInt(String(limit), 10) || 50))
  params.set('pageSize', String(safeLimit))
  if (beforeId !== undefined && beforeId !== null && Number(beforeId) > 0) {
    params.set('beforeId', String(beforeId))
  }
  const res = await apiFetch(`/v1/conversations/${encodeURIComponent(conversationId)}/messages?${params.toString()}`)
  if (!res.ok) throw new Error('加载会话消息失败')
  const data = await res.json()
  return {
    items: Array.isArray(data?.items) ? data.items : [],
    hasMore: Boolean(data?.hasMore),
    nextBeforeId: data?.items?.length > 0 ? data.items[0]?.id : null,
  }
}

export async function saveConversationMessage(conversationId, role, content, conversationTitle = '', messagePayload = '') {
  const res = await apiFetch(`/v1/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role,
      content,
      metadata: messagePayload ? { payload: messagePayload } : undefined,
    }),
  })
  if (!res.ok) throw new Error('保存会话消息失败')
  return res.json()
}

export async function startAgentStream(conversationId, query, options = {}) {
  const formData = new FormData()
  formData.append('conversationId', conversationId)
  formData.append('query', query)
  formData.append('adjustmentInstruction', options.adjustmentInstruction || '')
  formData.append('editedSteps', JSON.stringify(Array.isArray(options.editedSteps) ? options.editedSteps : []))
  formData.append('rerunMode', options.rerunMode || 'AUTO')
  formData.append('restartFromStep', String(Number.isFinite(Number(options.restartFromStep)) ? Number(options.restartFromStep) : 1))
  formData.append('replanOnly', String(!!options.replanOnly))
  formData.append('memoryProfileId', options.memoryProfileId || '')

  if (options.files && options.files.length > 0) {
    for (const fileData of options.files) {
      formData.append('files', fileData.file)
    }
  }

  const res = await apiFetch('/v1/brain/query', {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return { response: res, uploaded: [] }
}

export async function uploadToolInputFile(toolCallId, file) {
  const formData = new FormData()
  formData.append('file', file)
  const res = await apiFetch(`/v1/agent/tool/upload?toolCallId=${encodeURIComponent(toolCallId)}`, {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) throw new Error(`上传失败: HTTP ${res.status}`)
  return res.json()
}

export async function approveToolCall(conversationId, toolCallId, reviewedArgs) {
  const res = await apiFetch('/v1/agent/tool/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId, toolCallId, reviewedArgs }),
  })
  if (!res.ok) throw new Error(`审批失败: HTTP ${res.status}`)
  return res
}

async function fetchUsers() {
  const res = await apiFetch('/v1/admin/users')
  if (!res.ok) throw new Error('Failed to fetch users')
  return res.json()
}
