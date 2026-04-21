import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { MessageSquare, Database, Send, User, Bot, Layers, CheckSquare, Loader2, LogOut, Shield, Users, Lock, BookOpen, FileText, X, ChevronLeft, ChevronDown, ZoomIn, ZoomOut, Image as ImageIcon, Upload, Trash2, Clock, Search, RefreshCw, Brain, Edit, Settings, Download, Plus, Paperclip, FolderOpen } from 'lucide-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

// Set PDF worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

function cn(...inputs) {
  return twMerge(clsx(inputs))
}

// --- API Helpers ---
const API_BASE = '/api'
const AUTH_SESSION_KEY = 'ai4kb_auth_session'

function loadAuthSession() {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    const raw = window.localStorage.getItem(AUTH_SESSION_KEY)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw)
    if (!parsed?.token || !parsed?.user?.role || !parsed?.user?.username) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function saveAuthSession(session) {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session))
}

function clearAuthSession() {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.removeItem(AUTH_SESSION_KEY)
}

function getRefreshToken() {
  return loadAuthSession()?.refreshToken || ''
}

function isAdminLikeRole(role) {
  const normalizedRole = String(role || '').toLowerCase()
  return normalizedRole === 'admin' || normalizedRole === 'super_admin'
}

function isSuperAdminRole(role) {
  return String(role || '').toLowerCase() === 'super_admin'
}

function getAuthToken() {
  return loadAuthSession()?.token || ''
}

async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {})
  const token = getAuthToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  })
  if (res.status === 401) {
    // Try to refresh token
    const refreshToken = getRefreshToken()
    if (refreshToken) {
      try {
        const refreshRes = await fetch(`${API_BASE}/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken })
        })
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json()
          if (refreshData.accessToken) {
            // Update session with new token
            const session = loadAuthSession()
            if (session) {
              saveAuthSession({ ...session, token: refreshData.accessToken })
            }
            // Retry with new token
            const newToken = refreshData.accessToken
            const newHeaders = new Headers(options.headers || {})
            newHeaders.set('Authorization', `Bearer ${newToken}`)
            const retryRes = await fetch(`${API_BASE}${path}`, {
              ...options,
              headers: newHeaders
            })
            return retryRes
          }
        }
      } catch {
        // Refresh failed, continue to logout
      }
    }
    // Token expired or refresh failed
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

async function loginByPassword(username, password) {
  // 兼容 brain-server 鉴权接口：旧路径 /user/auth/login -> /v1/auth/login
  const res = await fetch(`${API_BASE}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
  if (!res.ok) {
    let message = '登录失败'
    try {
      const payload = await res.json()
      if (payload?.message) {
        message = payload.message
      }
    } catch (error) {
      if (error) {
        message = '登录失败'
      }
    }
    throw new Error(message)
  }
  const payload = await res.json()
  return {
    token: payload?.accessToken,
    user: payload?.user,
    refreshToken: payload?.refreshToken
  }
}

async function fetchDatasets() {
  // 兼容 brain-server：从权限快照反推可选数据集列表（只读视图）。
  const users = await fetchUsers()
  const datasetSet = new Set()
  for (const user of users) {
    const perms = await apiFetch(`/v1/admin/users/${user.id}/permissions`).then(async (r) => (r.ok ? r.json() : []))
    ;(Array.isArray(perms) ? perms : []).forEach((p) => {
      if ((p?.resourceType === 'DATASET' || p?.resourceType === 'DATASET_OWNER') && p?.resourceId) {
        datasetSet.add(String(p.resourceId))
      }
    })
  }
  return Array.from(datasetSet).map((id) => ({ id, name: id }))
}

async function createDataset(name) {
  const res = await apiFetch('/admin/datasets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  })
  if (!res.ok) throw new Error('Failed to create dataset')
  return res.json()
}

async function deleteDataset(id) {
  const res = await apiFetch(`/admin/datasets/${id}`, {
    method: 'DELETE'
  })
  if (!res.ok) throw new Error('Failed to delete dataset')
  return res.json()
}

async function deleteDatasets(ids) {
  const res = await apiFetch('/admin/datasets', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids })
  })
  if (!res.ok) throw new Error('Failed to delete datasets')
  return res.json()
}

async function updateDataset(id, name, description, language, permission, parser_config) {
  const body = { name, description }
  if (language) body.language = language
  if (permission) body.permission = permission
  if (parser_config) body.parser_config = parser_config

  const res = await apiFetch(`/admin/datasets/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error('Failed to update dataset')
  return res.json()
}

async function updateDocument(datasetId, docId, name) {
  const res = await apiFetch(`/admin/datasets/${datasetId}/documents/${docId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  })
  if (!res.ok) throw new Error('Failed to update document')
  return res.json()
}

async function fetchUsers() {
  // 兼容 brain-server：统一用户列表接口
  const res = await apiFetch('/v1/admin/users')
  if (!res.ok) throw new Error('Failed to fetch users')
  return res.json()
}

async function createAdminUser({ username, password }) {
  // 兼容 brain-server：通过统一创建接口 + role=admin
  const res = await apiFetch('/v1/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, role: 'admin' })
  })
  if (!res.ok) throw new Error('创建管理员失败')
  return res.json()
}

async function createNormalUser({ username, password, managerUserId }) {
  // 兼容 brain-server：通过统一创建接口 + role=user
  const body = { username, password, role: 'user' }
  if (managerUserId !== undefined && managerUserId !== null && String(managerUserId).trim()) {
    body.managerUserId = Number(managerUserId)
  }
  const res = await apiFetch('/v1/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error('创建普通用户失败')
  return res.json()
}

async function promoteUserToAdmin(userId) {
  // 兼容 brain-server：旧“提升管理员”改为 PATCH role
  const res = await apiFetch(`/v1/admin/users/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'admin' })
  })
  if (!res.ok) throw new Error('升级为管理员失败')
  return res.json()
}

async function deleteManagedUser(userId) {
  const res = await apiFetch(`/v1/admin/users/${userId}`, {
    method: 'DELETE'
  })
  if (!res.ok) throw new Error('删除用户失败')
  return res.json()
}

async function updateManagedUser(userId, { username, password }) {
  const body = {}
  // brain-server 当前不支持修改 username，保留参数以兼容现有前端调用签名。
  if (username !== undefined && String(username).trim()) {}
  if (password !== undefined) {
    body.password = password
  }
  const res = await apiFetch(`/v1/admin/users/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error('修改用户失败')
  return res.json()
}

async function fetchUserPermissions(username) {
  // 兼容 brain-server：旧 username 维度查询改为 userId 维度查询。
  const users = await fetchUsers()
  const target = users.find((u) => u.username === username)
  if (!target?.id) return []
  const res = await apiFetch(`/v1/admin/users/${target.id}/permissions`)
  if (!res.ok) throw new Error('Failed to fetch permissions')
  return res.json()
}

async function fetchRouteSamples({ page = 1, pageSize = 20, username, source, chosenRoute, startTime, endTime, queryKeyword } = {}) {
  const params = new URLSearchParams()
  params.set('page', String(Math.max(1, Number.parseInt(String(page), 10) || 1)))
  params.set('pageSize', String(Math.max(1, Math.min(100, Number.parseInt(String(pageSize), 10) || 20))))
  // 兼容 brain-server：旧 route-samples 映射到 rag 审计查询
  if (username && String(username).trim()) {
    params.set('operatorId', String(username).trim())
  }
  if (queryKeyword && String(queryKeyword).trim()) {
    params.set('queryKeyword', String(queryKeyword).trim())
  }
  const res = await apiFetch(`/v1/admin/audits/rag?${params.toString()}`)
  if (!res.ok) throw new Error('Failed to fetch route samples')
  const data = await res.json()
  const rows = Array.isArray(data?.items) ? data.items : []
  const normalized = rows.map((item) => ({
    id: item.id,
    createdAt: item.createdAt,
    conversationId: item.chatId || '',
    username: item.operatorId || item.userId || '',
    source: 'RAG_PROXY',
    chosenRoute: 'RAG',
    chosenConfidence: '',
    chosenTool: '',
    localRoute: '',
    localConfidence: '',
    plannerRoute: '',
    plannerConfidence: '',
    queryText: item.queryText || ''
  }))
  return {
    items: normalized,
    total: Number(data?.total || 0),
    page: Number(data?.page || 1),
    pageSize: Number(data?.pageSize || pageSize),
    hasMore: Number(data?.page || 1) * Number(data?.pageSize || pageSize) < Number(data?.total || 0)
  }
}

async function fetchRouteSampleSources() {
  const data = {
    sources: ['RAG_PROXY'],
    routes: ['RAG']
  }
  return {
    sources: Array.isArray(data?.sources) ? data.sources : [],
    routes: Array.isArray(data?.routes) ? data.routes : []
  }
}

async function fetchSuperAdminOverview() {
  // 兼容 brain-server：汇总 users + permissions 生成简版总览结构。
  const users = await fetchUsers()
  const now = new Date().toISOString()
  const enrichOne = async (user) => {
    const perms = await apiFetch(`/v1/admin/users/${user.id}/permissions`).then(async (r) => (r.ok ? r.json() : []))
    const datasetIds = Array.from(
      new Set((Array.isArray(perms) ? perms : [])
        .filter((p) => p?.resourceType === 'DATASET' || p?.resourceType === 'DATASET_OWNER')
        .map((p) => String(p.resourceId)))
    )
    return {
      userId: user.id,
      username: user.username,
      role: user.role,
      ownedDatasetCount: datasetIds.length,
      totalGrantedPermissionCount: Array.isArray(perms) ? perms.length : 0,
      userOverviewCount: 0,
      conversationOverviewCount: 0,
      conversationRecordCount: 0,
      ownedDatasets: datasetIds.map((id) => ({
        datasetId: id,
        datasetName: id,
        datasetCreatedAt: now,
        documentCount: 0,
        grantedUsers: []
      })),
      conversations: []
    }
  }
  const admins = await Promise.all(users.filter((u) => u.role === 'admin').map(enrichOne))
  const normalUsers = await Promise.all(users.filter((u) => u.role === 'user').map(enrichOne))
  return {
    admins,
    users: normalUsers,
    generatedAt: now
  }
}

async function fetchAdminSkills(onlineOnly = false) {
  // 兼容 brain-server：基于 skills 审计与已知技能生成展示列表。
  const res = await apiFetch('/v1/admin/audits/skills?page=1&pageSize=200')
  const data = res.ok ? await res.json() : { items: [] }
  const fromAudit = Array.from(new Set((data?.items || []).map((i) => i.toolName).filter(Boolean)))
  const defaults = ['indicator-verification', 'rag-query']
  const names = Array.from(new Set([...defaults, ...fromAudit]))
  const rows = names.map((name) => ({
    tool_code: name,
    tool_name: name,
    description: `来自 brain-server 的技能视图：${name}`,
    status: 'ONLINE',
    version: 'n/a',
    updated_at: new Date().toISOString()
  }))
  return onlineOnly ? rows.filter((r) => String(r.status).toUpperCase() === 'ONLINE') : rows
}

async function registerAdminSkill(payload) {
  const res = await apiFetch('/admin/skills/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  })
  if (!res.ok) throw new Error('新增技能失败')
  return res.json()
}

async function deleteAdminSkill(toolCode) {
  const res = await apiFetch(`/admin/skills/${encodeURIComponent(toolCode)}`, {
    method: 'DELETE'
  })
  if (!res.ok) throw new Error('删除技能失败')
  return res.json()
}

async function onlineSkill(toolCode) {
  const res = await apiFetch(`/admin/skills/${encodeURIComponent(toolCode)}/online`, {
    method: 'POST'
  })
  if (!res.ok) throw new Error('上线技能失败')
  return res.json()
}

async function fetchSkillAudit({
  page = 1,
  pageSize = 20,
  startTime,
  endTime,
  username,
  status,
  toolCode
} = {}) {
  const params = new URLSearchParams()
  params.set('page', String(Math.max(1, Number.parseInt(String(page), 10) || 1)))
  params.set('pageSize', String(Math.max(1, Math.min(100, Number.parseInt(String(pageSize), 10) || 20))))
  if (toolCode && String(toolCode).trim()) params.set('toolName', String(toolCode).trim())
  if (status && String(status).trim()) {
    const lowered = String(status).trim().toLowerCase()
    if (lowered === 'success') params.set('result', 'success')
    if (lowered === 'failed') params.set('result', 'fail')
    if (lowered === 'denied') params.set('result', 'deny')
  }
  const res = await apiFetch(`/v1/admin/audits/skills?${params.toString()}`)
  if (!res.ok) throw new Error('加载技能审计失败')
  const data = await res.json()
  const items = Array.isArray(data?.items) ? data.items : []
  const normalized = items.map((row) => ({
    ...row,
    toolCode: row.toolName || '',
    tool_code: row.toolName || '',
    status: String(row.result || '').toUpperCase() === 'FAIL' ? 'FAILED' : (String(row.result || '').toUpperCase() === 'DENY' ? 'DENIED' : 'SUCCESS'),
    created_at: row.createdAt,
    latency_ms: row.latencyMs,
    error_message: row.errorMessage,
    username: row.operatorId || row.userId || ''
  }))
  return {
    items: normalized,
    total: Number(data?.total || 0),
    page: Number(data?.page || 1),
    pageSize: Number(data?.pageSize || pageSize),
    hasMore: Number(data?.page || 1) * Number(data?.pageSize || pageSize) < Number(data?.total || 0)
  }
}

async function fetchSkillAuditOptions() {
  const users = await fetchUsers().catch(() => [])
  const audits = await fetchSkillAudit({ page: 1, pageSize: 200 }).catch(() => ({ items: [] }))
  const toolCodes = Array.from(new Set((audits.items || []).map((x) => x.toolCode || x.tool_code).filter(Boolean)))
  const usernames = Array.from(new Set((users || []).map((x) => x.username).filter(Boolean)))
  const data = {
    statuses: ['SUCCESS', 'FAILED', 'DENIED'],
    usernames,
    tool_codes: toolCodes
  }
  return {
    statuses: Array.isArray(data?.statuses) ? data.statuses : [],
    usernames: Array.isArray(data?.usernames) ? data.usernames : [],
    toolCodes: Array.isArray(data?.tool_codes) ? data.tool_codes : []
  }
}

async function offlineSkill(toolCode) {
  const res = await apiFetch(`/admin/skills/${encodeURIComponent(toolCode)}/offline`, {
    method: 'POST'
  })
  if (!res.ok) throw new Error('下线技能失败')
  return res.json()
}

async function fetchToolCatalog() {
  const res = await apiFetch('/v1/agent/tool/catalog')
  if (!res.ok) throw new Error('加载技能目录失败')
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

async function createToolDraft(conversationId, toolCode, query = '') {
  const res = await apiFetch('/v1/agent/tool/draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId, toolCode, query })
  })
  if (!res.ok) throw new Error('创建技能草稿失败')
  return res.json()
}

async function createConversation(title = '') {
  const res = await apiFetch('/user/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title })
  })
  if (!res.ok) throw new Error('创建会话失败')
  return res.json()
}

async function fetchConversations({ page = 1, pageSize = 50 } = {}) {
  const safePage = Math.max(1, Number.parseInt(String(page), 10) || 1)
  const safePageSize = Math.max(1, Math.min(100, Number.parseInt(String(pageSize), 10) || 50))
  const res = await apiFetch(`/user/conversations?page=${safePage}&pageSize=${safePageSize}`)
  if (!res.ok) throw new Error('加载会话列表失败')
  const data = await res.json()
  return {
    items: Array.isArray(data?.items) ? data.items : [],
    total: Number(data?.total || 0),
    page: Number(data?.page || safePage),
    pageSize: Number(data?.page_size || safePageSize),
    hasMore: Boolean(data?.has_more),
    retentionDays: Number(data?.retention_days || 90)
  }
}

async function renameConversation(conversationId, title) {
  const res = await apiFetch(`/user/conversations/${encodeURIComponent(conversationId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title })
  })
  if (!res.ok) throw new Error('重命名会话失败')
  return res.json()
}

async function deleteConversation(conversationId) {
  const res = await apiFetch(`/user/conversations/${encodeURIComponent(conversationId)}`, {
    method: 'DELETE'
  })
  if (!res.ok) throw new Error('删除会话失败')
  return res.json()
}

async function fetchConversationMessages(conversationId, { beforeId, limit = 50 } = {}) {
  const params = new URLSearchParams()
  const safeLimit = Math.max(1, Math.min(100, Number.parseInt(String(limit), 10) || 50))
  params.set('limit', String(safeLimit))
  if (beforeId !== undefined && beforeId !== null && Number(beforeId) > 0) {
    params.set('beforeId', String(beforeId))
  }
  const res = await apiFetch(`/user/conversations/${encodeURIComponent(conversationId)}/messages?${params.toString()}`)
  if (!res.ok) throw new Error('加载会话消息失败')
  const data = await res.json()
  return {
    items: Array.isArray(data?.items) ? data.items : [],
    hasMore: Boolean(data?.has_more),
    nextBeforeId: data?.next_before_id ?? null
  }
}

async function saveConversationMessage(conversationId, role, content, conversationTitle = '', messagePayload = '') {
  const res = await apiFetch(`/user/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role,
      content,
      conversationTitle,
      messagePayload
    })
  })
  if (!res.ok) throw new Error('保存会话消息失败')
  return res.json()
}

async function syncPermissions(username, datasetIds) {
  // 兼容 brain-server：前端在本地计算差异并拆分为 grant/revoke 调用。
  const users = await fetchUsers()
  const target = users.find((u) => u.username === username)
  if (!target?.id) throw new Error('用户不存在')

  const current = await fetchUserPermissions(username)
  const currentDatasetIds = new Set(
    current.filter((p) => p.resourceType === 'DATASET').map((p) => String(p.resourceId))
  )
  const nextDatasetIds = new Set((datasetIds || []).map((id) => String(id)))
  const needGrant = Array.from(nextDatasetIds).filter((id) => !currentDatasetIds.has(id))
  const needRevoke = Array.from(currentDatasetIds).filter((id) => !nextDatasetIds.has(id))

  if (needGrant.length > 0) {
    const grantRes = await apiFetch('/v1/admin/permissions/datasets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: Number(target.id),
        action: 'grant',
        datasetIds: needGrant
      })
    })
    if (!grantRes.ok) throw new Error('Failed to grant permissions')
  }

  if (needRevoke.length > 0) {
    const revokeRes = await apiFetch('/v1/admin/permissions/datasets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: Number(target.id),
        action: 'revoke',
        datasetIds: needRevoke
      })
    })
    if (!revokeRes.ok) throw new Error('Failed to revoke permissions')
  }

  return { success: true }
}

async function fetchDocuments(datasetId, page = 1, pageSize = 100) {
  const res = await apiFetch(`/admin/datasets/${datasetId}/documents?page=${page}&page_size=${pageSize}&t=${Date.now()}`)
  if (!res.ok) throw new Error('Failed to fetch documents')
  const json = await res.json()
  // Handle both array and object response (RAGFlow returns { data: { docs: [...] } })
  if (json.data && Array.isArray(json.data.docs)) {
    return json.data.docs
  }
  return Array.isArray(json.data) ? json.data : []
}

async function uploadDocument(datasetId, file) {
  const formData = new FormData()
  formData.append('file', file)
  
  const res = await apiFetch(`/admin/datasets/${datasetId}/documents`, {
    method: 'POST',
    body: formData
  })
  if (!res.ok) throw new Error('Failed to upload document')
  return res.json()
}

async function deleteDocuments(datasetId, ids) {
  const res = await apiFetch(`/admin/datasets/${datasetId}/documents`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids })
  })
  if (!res.ok) throw new Error('Failed to delete documents')
  return res.json()
}

async function runDocuments(datasetId, docIds) {
  const res = await apiFetch(`/admin/datasets/${datasetId}/documents/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ doc_ids: docIds })
  })
  if (!res.ok) throw new Error('Failed to run documents')
  return res.json()
}

async function getDocumentFile(datasetId, docId) {
  const res = await apiFetch(`/admin/datasets/${datasetId}/documents/${docId}/file`)
  if (!res.ok) throw new Error('Failed to fetch document file')
  return res.blob()
}

async function fetchChunks(datasetId, docId, page = 1, pageSize = 10000) {
  const res = await apiFetch(`/admin/datasets/${datasetId}/documents/${docId}/chunks?page=${page}&page_size=${pageSize}`)
  if (!res.ok) throw new Error('Failed to fetch chunks')
  const json = await res.json()
  return json.data || []
}

async function startAgentStream(conversationId, query, options = {}) {
  const payload = {
    conversationId,
    query,
    adjustmentInstruction: options.adjustmentInstruction || '',
    editedSteps: Array.isArray(options.editedSteps) ? options.editedSteps : [],
    rerunMode: options.rerunMode || 'AUTO',
    restartFromStep: Number.isFinite(Number(options.restartFromStep)) ? Number(options.restartFromStep) : 1,
    replanOnly: !!options.replanOnly,
    memoryProfileId: options.memoryProfileId || ''
  }

  // 如果有文件，先上传
  let uploadedFiles = []
  if (options.files && options.files.length > 0) {
    for (const fileData of options.files) {
      try {
        const result = await uploadFileToChat(fileData.file, conversationId)
        if (result) {
          uploadedFiles.push({
            fileId: result.fileId || result.file_id || '',
            fileName: fileData.file.name,
            fileSize: result.size || 0,
            filePath: result.filePath || result.file_path || ''
          })
        }
      } catch (err) {
        console.error('上传文件失败:', err)
      }
    }
    if (uploadedFiles.length > 0) {
      payload.fileIds = uploadedFiles.map(f => f.fileId)
    }
  }

  const res = await apiFetch('/v1/agent/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return { response: res, uploaded: uploadedFiles }
}

// 上传文件到聊天
async function uploadFileToChat(file, conversationId) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('conversationId', conversationId)
  const res = await apiFetch('/v1/files/upload', {
    method: 'POST',
    body: formData
  })
  if (!res.ok) throw new Error(`上传失败: HTTP ${res.status}`)
  const data = await res.json()
  return data // 返回完整对象
}

async function uploadToolInputFile(toolCallId, file) {
  const formData = new FormData()
  formData.append('file', file)
  const res = await apiFetch(`/v1/agent/tool/upload?toolCallId=${encodeURIComponent(toolCallId)}`, {
    method: 'POST',
    body: formData
  })
  if (!res.ok) throw new Error(`上传失败: HTTP ${res.status}`)
  return res.json()
}

async function approveToolCall(conversationId, toolCallId, reviewedArgs) {
  const res = await apiFetch('/v1/agent/tool/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId, toolCallId, reviewedArgs })
  })
  if (!res.ok) throw new Error(`审批失败: HTTP ${res.status}`)
  return res
}

async function fetchMemoryProfiles() {
  const res = await apiFetch('/v1/memory/profiles')
  if (!res.ok) throw new Error('Failed to fetch memory profiles')
  return res.json()
}

async function fetchCurrentMemory(profileId) {
  const q = profileId ? `?profileId=${encodeURIComponent(profileId)}` : ''
  const res = await apiFetch(`/v1/memory/current${q}`)
  if (!res.ok) throw new Error('Failed to fetch current memory')
  return res.json()
}

async function updateCurrentMemory(profileId, content) {
  const res = await apiFetch('/v1/memory/current', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profileId, content })
  })
  if (!res.ok) throw new Error('Failed to update memory')
  return res.json()
}

// --- Components ---

function ChunkHighlights({ chunk, scale, pageNumber }) {
  if (!chunk || !chunk.positions || chunk.positions.length === 0) return null

  // Debug log
  console.log('Rendering highlights for chunk:', chunk.id, 'Page:', pageNumber, 'Scale:', scale)
  console.log('Positions:', chunk.positions)

  // RAGFlow positions format: [page_num, x_min, x_max, y_min, y_max]
  // We need to filter for current page
  const rects = chunk.positions
    .filter(pos => pos[0] === pageNumber)
    .map((pos, i) => {
      const [, x1, x2, y1, y2] = pos
      // Calculate width and height
      const width = (x2 - x1) * scale
      const height = (y2 - y1) * scale
      
      console.log(`Rect ${i}:`, { left: x1 * scale, top: y1 * scale, width, height })

      return (
        <div
          key={i}
          className="absolute bg-yellow-400/50 border-2 border-yellow-600 transition-all duration-300 z-[100]"
          style={{
            left: x1 * scale,
            top: y1 * scale,
            width: width,
            height: height,
          }}
        />
      )
    })

  if (rects.length === 0) {
      console.log('No rects for this page')
      return null
  }

  return <div className="absolute inset-0 pointer-events-none z-[100]">{rects}</div>
}

function DocumentViewer({ doc, datasetId, onClose }) {
  const [chunks, setChunks] = useState([])
  const [loadingChunks, setLoadingChunks] = useState(false)
  const [numPages, setNumPages] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [scale, setScale] = useState(1.0)
  const [pdfError, setPdfError] = useState(null)
  const [activeChunk, setActiveChunk] = useState(null)

  useEffect(() => {
    // Check status using 'run' or 'run_status'
    // run: 'DONE', '0' (not run?), 'RUNNING'? 
    // run_status: '1' (parsed), '0' (not parsed)
    // We should treat '0' as not parsed.
    const isParsed = doc.run === 'DONE' || doc.run_status === '1'
    if (isParsed) {
      setLoadingChunks(true)
      fetchChunks(datasetId, doc.id)
        .then(data => {
            console.log('Fetched chunks data:', data);
            if (Array.isArray(data)) setChunks(data)
            else if (data && Array.isArray(data.chunks)) setChunks(data.chunks)
            else setChunks([])
        })
        .catch(error => {
            console.error('Fetch chunks error:', error);
            setChunks([]);
        })
        .finally(() => setLoadingChunks(false))
    }
  }, [datasetId, doc.id, doc.run, doc.run_status])

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages)
    setPdfError(null)
  }

  const onDocumentLoadError = (error) => {
    console.error('PDF Load Error:', error)
    setPdfError(error.message)
  }

  const filteredChunks = chunks.filter(c => {
    const content = c.content_with_weight || c.content || '';
    return content.toLowerCase().includes(searchTerm.toLowerCase());
  })

  const handleChunkClick = (chunk) => {
    setActiveChunk(chunk)
    // Scroll to page logic handled in useEffect
  }

  // Scroll to chunk page when activeChunk changes
  useEffect(() => {
    if (activeChunk) {
        let targetPage = 1;
        if (activeChunk.positions && activeChunk.positions.length > 0) {
            targetPage = activeChunk.positions[0][0];
        } else if (activeChunk.page_num && activeChunk.page_num.length > 0) {
            targetPage = activeChunk.page_num[0];
        }
        
        // Find page element and scroll
        setTimeout(() => {
            const pageEl = document.getElementById(`pdf-page-${targetPage}`);
            if (pageEl) {
                pageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
    }
  }, [activeChunk]);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full h-full max-w-[95vw] flex flex-col overflow-hidden relative shadow-2xl">
         {/* Header */}
         <div className="p-4 border-b flex items-center justify-between bg-slate-50">
           <div className="flex items-center gap-3">
             <div className="p-2 bg-blue-100 rounded-lg">
                <FileText className="text-blue-600" size={20} />
             </div>
             <div>
                <h3 className="font-bold text-slate-800">{doc.name}</h3>
                <p className="text-xs text-slate-500">
                    {numPages ? `${numPages} 页` : '加载中...'} · {chunks.length} 个切片
                </p>
             </div>
           </div>
           <div className="flex items-center gap-2">
             <button onClick={() => setScale(s => Math.max(0.5, s - 0.1))} className="p-2 hover:bg-slate-200 rounded-lg"><ZoomOut size={18} /></button>
             <span className="text-sm font-mono w-12 text-center">{Math.round(scale * 100)}%</span>
             <button onClick={() => setScale(s => Math.min(2.5, s + 0.1))} className="p-2 hover:bg-slate-200 rounded-lg"><ZoomIn size={18} /></button>
             <div className="w-px h-6 bg-slate-300 mx-2" />
             <button 
               onClick={onClose}
               className="p-2 bg-slate-200 hover:bg-slate-300 rounded-full transition-colors"
             >
               <X size={20} />
             </button>
           </div>
         </div>

         {/* Body */}
         <div className="flex-1 flex overflow-hidden">
           {/* Left: PDF Viewer */}
           <div className="flex-1 bg-slate-100 overflow-auto flex justify-center p-8 relative scroll-smooth">
             {doc.type === 'pdf' ? (
                 <div className="relative w-full flex flex-col items-center">
                    <Document 
                        file={doc.url} 
                        className="flex flex-col items-center"
                        onLoadSuccess={onDocumentLoadSuccess}
                        onLoadError={onDocumentLoadError}
                        loading={<div className="flex items-center gap-2 p-4"><Loader2 className="animate-spin"/> 加载PDF中...</div>}
                    >
                        {Array.from(new Array(numPages), (el, index) => {
                            const currentPage = index + 1;
                            return (
                                <div key={`page_${currentPage}`} id={`pdf-page-${currentPage}`} className="relative inline-block border border-slate-200 shadow-lg mb-6">
                                    <Page 
                                        pageNumber={currentPage} 
                                        scale={scale} 
                                        renderTextLayer={true} 
                                        renderAnnotationLayer={true}
                                        className="bg-white"
                                    />
                                    <ChunkHighlights 
                                        chunk={activeChunk} 
                                        scale={scale} 
                                        pageNumber={currentPage} 
                                    />
                                </div>
                            );
                        })}
                    </Document>
                    {pdfError && <div className="text-red-500 p-4 bg-white rounded shadow">无法加载PDF: {pdfError}</div>}
                    
                    {/* Debug Info */}
                    {activeChunk && (
                        <div className="absolute bottom-0 right-0 p-2 bg-black/70 text-white text-xs z-50 pointer-events-none">
                            Chunk: {activeChunk.id} <br/>
                            Positions: {activeChunk.positions ? activeChunk.positions.length : '0'}
                        </div>
                    )}
                 </div>
             ) : (
                 <iframe src={doc.url} className="w-full h-full bg-white rounded-lg border p-4 font-mono whitespace-pre-wrap" />
             )}
           </div>

           {/* Right: Chunks & Search */}
           <div className="w-96 bg-white border-l flex flex-col shrink-0">
             <div className="p-4 border-b">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                        type="text" 
                        placeholder="搜索切片内容..." 
                        className="w-full pl-9 pr-4 py-2 bg-slate-50 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
             </div>
             
             <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
                {loadingChunks ? (
                    <div className="text-center py-8 text-slate-500 flex flex-col items-center gap-2">
                        <Loader2 className="animate-spin" />
                        <span className="text-xs">加载切片中...</span>
                    </div>
                ) : filteredChunks.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 text-sm">
                        {searchTerm ? '未找到匹配的切片' : '暂无切片数据'}
                    </div>
                ) : (
                    filteredChunks.map((chunk, idx) => (
                        <div 
                            key={chunk.id || idx}
                            onClick={() => handleChunkClick(chunk)}
                            className={`bg-white p-3 rounded-lg border hover:border-blue-400 hover:shadow-md cursor-pointer transition-all group ${activeChunk && activeChunk.id === chunk.id ? 'border-blue-500 ring-2 ring-blue-200' : ''}`}
                        >
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-xs font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                                    Page {chunk.page_num && chunk.page_num[0]}
                                </span>
                                <span className="text-xs text-slate-300 group-hover:text-blue-400">
                                    #{idx + 1}
                                </span>
                            </div>
                            <p className="text-sm text-slate-700 line-clamp-4 leading-relaxed">
                                {chunk.content_with_weight ? (
                                   <span dangerouslySetInnerHTML={{ __html: chunk.content_with_weight }} />
                                ) : (
                                   chunk.content
                                )}
                            </p>
                        </div>
                    ))
                )}
             </div>
           </div>
         </div>
      </div>
    </div>
  )
}


function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!username.trim() || !password.trim() || submitting) {
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await onLogin({
        username: username.trim(),
        password
      })
    } catch (loginError) {
      setError(loginError?.message || '登录失败，请检查账号密码')
      setSubmitting(false)
    }
  }

  const fillDemoAccount = (name) => {
    setUsername(name)
    setPassword('ChangeMe123!')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100">
      <div className="w-full max-w-md p-8 bg-white rounded-xl shadow-lg">
        <div className="flex justify-center mb-6">
          <div className="p-3 bg-blue-100 rounded-full">
            <Layers className="w-8 h-8 text-blue-600" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-center text-slate-800 mb-2">AI4KB 知识库系统</h2>
        <p className="text-center text-slate-500 mb-6">请输入账号密码登录</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">用户名</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white transition-colors"
              placeholder="请输入用户名"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white transition-colors"
              placeholder="请输入密码"
              autoComplete="current-password"
            />
          </div>
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={submitting || !username.trim() || !password.trim()}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? <Loader2 className="animate-spin" size={16} /> : <Shield size={16} />}
            登录
          </button>
        </form>
        <div className="mt-5 border-t pt-4">
          <p className="text-xs text-slate-500 mb-2">快捷填充测试账号（默认密码 ChangeMe123!）</p>
          <div className="grid grid-cols-4 gap-2">
            <button onClick={() => fillDemoAccount('superadmin')} className="text-xs px-2 py-1.5 rounded border border-slate-200 hover:bg-slate-100 transition-colors">superadmin</button>
            <button onClick={() => fillDemoAccount('admin')} className="text-xs px-2 py-1.5 rounded border border-slate-200 hover:bg-slate-100 transition-colors">admin</button>
            <button onClick={() => fillDemoAccount('zhangsan')} className="text-xs px-2 py-1.5 rounded border border-slate-200 hover:bg-slate-100 transition-colors">zhangsan</button>
            <button onClick={() => fillDemoAccount('lisi')} className="text-xs px-2 py-1.5 rounded border border-slate-200 hover:bg-slate-100 transition-colors">lisi</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Sidebar({ role, username, activeTab, setActiveTab, onLogout }) {
  const menuItems = isSuperAdminRole(role) ? [
    { id: 'super_overview', label: '管理员总览', icon: Users },
    { id: 'datasets', label: '知识库管理', icon: Database },
    { id: 'user_management', label: '用户管理', icon: User },
    { id: 'permissions', label: '权限分配', icon: Lock },
    { id: 'skills', label: '技能管理', icon: Settings },
    { id: 'memory', label: '记忆管理', icon: Brain },
    { id: 'route_samples', label: '审计查询', icon: Brain },
    { id: 'chat', label: '调试对话', icon: MessageSquare },
  ] : (isAdminLikeRole(role) ? [
    { id: 'super_overview', label: '管理员总览', icon: Users },
    { id: 'datasets', label: '知识库管理', icon: Database },
    { id: 'user_management', label: '用户管理', icon: User },
    { id: 'permissions', label: '权限分配', icon: Lock },
    { id: 'skills', label: '技能管理', icon: Settings },
    { id: 'memory', label: '记忆管理', icon: Brain },
    { id: 'chat', label: '调试对话', icon: MessageSquare },
  ] : [
    { id: 'memory', label: '我的记忆', icon: Brain },
    { id: 'chat', label: '智能问答', icon: MessageSquare },
  ])

  return (
    <div className="w-64 bg-slate-900 text-white flex flex-col h-screen shrink-0">
      <div className="p-6 border-b border-slate-800">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Layers className="text-blue-400" />
          AI4KB
        </h1>
        <p className="text-xs text-slate-500 mt-1">Local Knowledge Base</p>
      </div>
      
      <nav className="flex-1 p-4 space-y-2">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
              activeTab === item.id 
                ? "bg-blue-600 text-white" 
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            )}
          >
            <item.icon size={20} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center gap-3 px-4 py-2 mb-4">
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
            isAdminLikeRole(role) ? "bg-purple-500" : "bg-emerald-500"
          )}>
            {isAdminLikeRole(role) ? 'AD' : 'US'}
          </div>
          <div className="overflow-hidden">
            <p className="text-sm font-medium truncate">{username}</p>
            <p className="text-xs text-slate-500 uppercase">{role}</p>
          </div>
        </div>
        <button 
          onClick={onLogout}
          className="w-full flex items-center gap-2 text-slate-400 hover:text-white px-4 py-2 text-sm transition-colors"
        >
          <LogOut size={16} />
          退出登录
        </button>
      </div>
    </div>
  )
}

function RenameModal({ isOpen, onClose, onConfirm, initialValue, initialDescription, title, isSubmitting }) {
  const [value, setValue] = useState(initialValue)
  const [description, setDescription] = useState(initialDescription || '')

  useEffect(() => {
    setValue(initialValue)
    setDescription(initialDescription || '')
  }, [initialValue, initialDescription])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-4 border-b flex items-center justify-between bg-slate-50">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Edit size={18} className="text-blue-500" />
            {title}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full transition-colors">
            <X size={20} className="text-slate-500" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">名称</label>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white transition-colors"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && value.trim() && initialDescription === undefined) {
                  onConfirm(value)
                }
              }}
            />
          </div>
          
          {initialDescription !== undefined && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">描述 (可选)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white transition-colors min-h-[100px] resize-none"
                placeholder="请输入知识库描述..."
              />
            </div>
          )}
        </div>
        <div className="p-4 border-t bg-slate-50 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors font-medium text-sm"
          >
            取消
          </button>
          <button
            onClick={() => onConfirm(value, description)}
            disabled={!value.trim() || isSubmitting}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium text-sm transition-colors"
          >
            {isSubmitting && <Loader2 className="animate-spin" size={16} />}
            确定
          </button>
        </div>
      </div>
    </div>
  )
}

function SettingsModal({ isOpen, dataset, isSubmitting, onClose, onConfirm }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [language, setLanguage] = useState('English')
  const [permission, setPermission] = useState('me')
  const [layoutRecognize, setLayoutRecognize] = useState('DeepDOC')
  const [chunkTokenNum, setChunkTokenNum] = useState(128)
  const [useRaptor, setUseRaptor] = useState(false)
  const [raptorPrompt, setRaptorPrompt] = useState('')
  const [autoKeywords, setAutoKeywords] = useState(0)
  const [autoQuestions, setAutoQuestions] = useState(0)
  const [pagerank, setPagerank] = useState(0)

  // Default Chinese prompt for RAPTOR
  const DEFAULT_RAPTOR_PROMPT = "请总结以下段落。注意数字，不要编造。段落如下：\n      {cluster_content}\n以上是你需要总结的内容。"

  useEffect(() => {
    if (isOpen && dataset) {
      setName(dataset.name || '')
      setDescription(dataset.description || '')
      setLanguage(dataset.language || 'Chinese')
      setPermission(dataset.permission || 'me')
      
      const config = dataset.parser_config || {}
      setLayoutRecognize(config.layout_recognize || 'DeepDOC')
      setChunkTokenNum(config.chunk_token_num || 128)
      setAutoKeywords(config.auto_keywords || 0)
      setAutoQuestions(config.auto_questions || 0)
      setPagerank(dataset.pagerank || 0)

      const raptor = config.raptor || {}
      setUseRaptor(raptor.use_raptor || false)
      setRaptorPrompt(raptor.prompt || DEFAULT_RAPTOR_PROMPT)
    }
  }, [isOpen, dataset])

  if (!isOpen) return null

  const handleConfirm = () => {
    const parser_config = {
      ...dataset.parser_config,
      chunk_token_num: parseInt(chunkTokenNum),
      layout_recognize: layoutRecognize,
      auto_keywords: parseInt(autoKeywords),
      auto_questions: parseInt(autoQuestions),
      raptor: {
        ...dataset.parser_config?.raptor,
        use_raptor: useRaptor,
        prompt: raptorPrompt
      }
    }
    onConfirm({ name, description, language, permission, pagerank, parser_config })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-bold text-lg text-slate-800">知识库设置</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full transition-colors">
            <X size={20} className="text-slate-500" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <h4 className="font-semibold text-slate-900 border-b pb-2">基本信息</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">名称</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-slate-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">语言</label>
                <select 
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-slate-50"
                >
                  <option value="Chinese">Chinese</option>
                  <option value="English">English</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">描述</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-slate-50 h-20 resize-none"
              />
            </div>
            <div>
               <label className="block text-sm font-medium text-slate-700 mb-1">权限</label>
               <select 
                  value={permission}
                  onChange={(e) => setPermission(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-slate-50"
                >
                  <option value="me">仅自己 (Me)</option>
                  <option value="team">团队 (Team)</option>
                </select>
            </div>
          </div>

          {/* Parser Config */}
          <div className="space-y-4">
            <h4 className="font-semibold text-slate-900 border-b pb-2">解析配置</h4>
            <div className="grid grid-cols-2 gap-4">
               <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Layout Recognize</label>
                <select 
                  value={layoutRecognize}
                  onChange={(e) => setLayoutRecognize(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-slate-50"
                >
                  <option value="DeepDOC">DeepDOC</option>
                  <option value="Naive">Naive</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Chunk Token Number</label>
                <input
                  type="number"
                  value={chunkTokenNum}
                  onChange={(e) => setChunkTokenNum(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-slate-50"
                />
              </div>
            </div>
            
            <div className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  id="useRaptor"
                  checked={useRaptor} 
                  onChange={(e) => setUseRaptor(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <label htmlFor="useRaptor" className="text-sm font-medium text-slate-700">启用 RAPTOR (递归摘要)</label>
            </div>
            
            {useRaptor && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">RAPTOR Prompt</label>
                  <textarea
                    value={raptorPrompt}
                    onChange={(e) => setRaptorPrompt(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-slate-50 h-32 resize-none text-xs font-mono"
                  />
                  <p className="text-xs text-slate-500 mt-1">请保持 `{'{cluster_content}'}` 占位符。</p>
                </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t bg-slate-50 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors font-medium text-sm"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 font-medium text-sm transition-colors"
          >
            {isSubmitting && <Loader2 className="animate-spin" size={16} />}
            保存配置
          </button>
        </div>
      </div>
    </div>
  )
}

function DatasetDetail({ dataset, onBack, onUpdate }) {
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [parsingId, setParsingId] = useState(null)
  const [viewingDoc, setViewingDoc] = useState(null)
  const [selectedDocs, setSelectedDocs] = useState([])
  const [batchDeleting, setBatchDeleting] = useState(false)
  const [renameModal, setRenameModal] = useState({
    isOpen: false,
    doc: null,
    initialValue: '',
    isSubmitting: false
  })
  const [settingsModal, setSettingsModal] = useState({
    isOpen: false,
    isSubmitting: false
  })

  const loadDocs = useCallback(() => {
    // Only set loading on initial load to avoid flickering during polling
    if (docs.length === 0) setLoading(true)
    setSelectedDocs([]) // Reset selection on reload
    fetchDocuments(dataset.id)
      .then(data => setDocs(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [dataset.id, docs.length])

  useEffect(() => {
    loadDocs()
    // Poll for status updates if there are parsing documents
      const interval = setInterval(() => {
          // Simple check: if any doc is not parsed (run != 'DONE'), poll. 
          // Or if we just triggered parsing.
          // For now, poll every 5s to keep UI fresh
          fetchDocuments(dataset.id).then(data => {
              if (Array.isArray(data)) setDocs(data)
          }).catch(console.error)
      }, 5000)
    return () => clearInterval(interval)
  }, [dataset.id, loadDocs])

  const handleUpdateSettings = async (newSettings) => {
    setSettingsModal(prev => ({ ...prev, isSubmitting: true }))
    try {
        await updateDataset(
            dataset.id, 
            newSettings.name, 
            newSettings.description, 
            newSettings.language, 
            newSettings.permission, 
            newSettings.parser_config
        )
        if (onUpdate) onUpdate() // Refresh parent list
        alert('配置已更新')
        setSettingsModal({ isOpen: false, isSubmitting: false })
    } catch (e) {
        alert('更新失败: ' + e.message)
        setSettingsModal(prev => ({ ...prev, isSubmitting: false }))
    }
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    try {
      await uploadDocument(dataset.id, file)
      loadDocs()
    } catch (e) {
      alert('上传失败: ' + e.message)
    } finally {
      setUploading(false)
      e.target.value = null
    }
  }
  
  const handleDeleteDoc = async (docId) => {
    if (!window.confirm('确定删除此文件吗？')) return
    setDeletingId(docId)
    try {
      await deleteDocuments(dataset.id, [docId])
      loadDocs()
    } catch (e) {
      alert('删除失败: ' + e.message)
    } finally {
      setDeletingId(null)
    }
  }

  const handleParseDoc = async (docId) => {
    setParsingId(docId)
    try {
      await runDocuments(dataset.id, [docId])
      // Trigger immediate reload
      loadDocs()
    } catch (e) {
      alert('解析失败: ' + e.message)
    } finally {
      // Keep parsingId set for a moment or until status changes?
      // Actually we should rely on doc.run_status or doc.progress from now on.
      setParsingId(null)
    }
  }

  const handleBatchDeleteDocs = async () => {
    if (selectedDocs.length === 0) return
    if (!window.confirm(`确定删除选中的 ${selectedDocs.length} 个文件吗？`)) return
    
    setBatchDeleting(true)
    try {
      await deleteDocuments(dataset.id, selectedDocs)
      loadDocs()
    } catch (e) {
      alert('批量删除失败: ' + e.message)
    } finally {
      setBatchDeleting(false)
    }
  }

  const handleSelectAllDocs = (e) => {
    if (e.target.checked) {
      setSelectedDocs(docs.map(d => d.id))
    } else {
      setSelectedDocs([])
    }
  }

  const handleSelectDoc = (docId) => {
    setSelectedDocs(prev => 
      prev.includes(docId) 
        ? prev.filter(id => id !== docId)
        : [...prev, docId]
    )
  }

  const handleRenameDoc = (doc) => {
    setRenameModal({
      isOpen: true,
      doc,
      initialValue: doc.name,
      isSubmitting: false
    })
  }

  const handleConfirmRename = async (newName) => {
    if (!newName || newName === renameModal.initialValue) {
      setRenameModal(prev => ({ ...prev, isOpen: false }))
      return
    }

    setRenameModal(prev => ({ ...prev, isSubmitting: true }))
    try {
      await updateDocument(dataset.id, renameModal.doc.id, newName)
      loadDocs()
      setRenameModal(prev => ({ ...prev, isOpen: false }))
    } catch (e) {
      alert('重命名失败: ' + e.message)
      setRenameModal(prev => ({ ...prev, isSubmitting: false }))
    }
  }

  const handleViewDoc = async (doc) => {
    try {
      const blob = await getDocumentFile(dataset.id, doc.id)
      const url = URL.createObjectURL(blob)
      setViewingDoc({ 
          ...doc, 
          url, 
          type: doc.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'text' 
      })
    } catch (e) {
      alert('无法预览文件: ' + e.message)
    }
  }

  return (
    <div className="p-8 max-w-6xl mx-auto h-full overflow-y-auto relative">
      {viewingDoc && (
        <DocumentViewer 
            doc={viewingDoc} 
            datasetId={dataset.id} 
            onClose={() => {
                URL.revokeObjectURL(viewingDoc.url)
                setViewingDoc(null)
            }} 
        />
      )}

      <button onClick={onBack} className="mb-4 text-slate-500 hover:text-slate-800 flex items-center gap-1 transition-colors">
        <ChevronLeft size={16} /> 返回知识库列表
      </button>
      
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Database className="text-blue-500" size={24} />
            {dataset.name}
            <button 
                onClick={() => setSettingsModal(prev => ({ ...prev, isOpen: true }))}
                className="ml-2 p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                title="设置"
            >
                <Settings size={20} />
            </button>
          </h2>
          <p className="text-slate-500 text-sm mt-1 font-mono select-all">ID: {dataset.id}</p>
        </div>
        <div className="relative group flex gap-2">
          {selectedDocs.length > 0 && (
            <button 
              onClick={handleBatchDeleteDocs}
              disabled={batchDeleting}
              className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 flex items-center gap-2 disabled:opacity-50 transition-colors"
            >
              {batchDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              批量删除 ({selectedDocs.length})
            </button>
          )}
          <div className="relative">
            <input 
              type="file" 
              onChange={handleFileUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              disabled={uploading}
            />
            <button className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50 transition-colors shadow-sm h-full">
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              上传文件
            </button>
          </div>
        </div>
      </div>
      
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-500 font-medium border-b">
            <tr>
              <th className="px-6 py-4 w-12">
                <input 
                  type="checkbox" 
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  checked={docs.length > 0 && selectedDocs.length === docs.length}
                  onChange={handleSelectAllDocs}
                  disabled={docs.length === 0}
                />
              </th>
              <th className="px-6 py-4">文件名</th>
              <th className="px-6 py-4">上传时间</th>
              <th className="px-6 py-4">分块数</th>
              <th className="px-6 py-4">状态</th>
              <th className="px-6 py-4 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                  加载中...
                </td>
              </tr>
            ) : docs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                  暂无文档，请上传文件
                </td>
              </tr>
            ) : (
              docs.map((doc) => (
                <tr key={doc.id} className={`hover:bg-slate-50 transition-colors ${selectedDocs.includes(doc.id) ? 'bg-blue-50/50' : ''}`}>
                  <td className="px-6 py-4">
                    <input 
                      type="checkbox" 
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      checked={selectedDocs.includes(doc.id)}
                      onChange={() => handleSelectDoc(doc.id)}
                    />
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-700 flex items-center gap-2">
                    <FileText size={16} className="text-slate-400" />
                    <button onClick={() => handleViewDoc(doc)} className="hover:text-blue-600 hover:underline text-left">
                      {doc.name}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-slate-500">
                    {new Date(doc.create_time).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-slate-500 font-mono">
                    {doc.chunk_count !== undefined ? doc.chunk_count : '-'}
                  </td>
                  <td className="px-6 py-4">
                     <div className="flex flex-col gap-1">
                         <span className={cn(
                           "px-2 py-1 rounded-full text-xs font-medium w-fit",
                           (doc.run === 'DONE' || doc.run_status === '1') ? "bg-emerald-100 text-emerald-700" : 
                           (doc.progress > 0 && doc.progress < 1) ? "bg-amber-100 text-amber-700" :
                           "bg-slate-100 text-slate-500"
                         )}>
                           {(doc.run === 'DONE' || doc.run_status === '1') ? '已解析' : 
                            (doc.progress > 0 && doc.progress < 1) ? `解析中 ${Math.round(doc.progress * 100)}%` : '未解析'}
                         </span>
                         {(doc.progress > 0 && doc.progress < 1) && (
                             <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div 
                                    className="h-full bg-blue-500 animate-pulse" 
                                    style={{ width: `${(doc.progress || 0) * 100}%` }}
                                />
                             </div>
                         )}
                     </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => handleParseDoc(doc.id)}
                          disabled={parsingId === doc.id || (doc.progress > 0 && doc.progress < 1)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                          title="解析文档"
                        >
                          {parsingId === doc.id ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                        </button>
                      <button 
                        onClick={() => handleRenameDoc(doc)}
                        className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        title="重命名"
                      >
                        <Edit size={16} />
                      </button>
                      <button 
                        onClick={() => handleDeleteDoc(doc.id)}
                        disabled={deletingId === doc.id}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="删除文档"
                      >
                        {deletingId === doc.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <RenameModal 
        isOpen={renameModal.isOpen}
        title="重命名文件"
        initialValue={renameModal.initialValue}
        isSubmitting={renameModal.isSubmitting}
        onClose={() => setRenameModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={handleConfirmRename}
      />
      <SettingsModal 
        isOpen={settingsModal.isOpen}
        dataset={dataset}
        isSubmitting={settingsModal.isSubmitting}
        onClose={() => setSettingsModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={handleUpdateSettings}
      />
    </div>
  )
}

function DatasetCard({ dataset, onClick, onDelete, onRename, selected, onSelect, selectionMode }) {
  const manageable = dataset?.manageable !== false
  const canSelect = manageable
  const cardClickable = selectionMode ? canSelect : manageable
  return (
    <div 
      onClick={selectionMode ? (e) => canSelect && onSelect(dataset.id, e) : (cardClickable ? onClick : undefined)}
      className={`bg-white rounded-xl border p-6 hover:shadow-lg transition-all group relative ${cardClickable ? 'cursor-pointer' : 'cursor-not-allowed opacity-90'} ${selected ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-50/10' : 'border-slate-100 hover:border-blue-200'}`}
    >
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        {!selectionMode && manageable && (
          <>
            <button 
              onClick={(e) => onRename(dataset, e)}
              className="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-all"
              title="重命名"
            >
              <FileText size={12} />
            </button>
            <button 
              onClick={(e) => onDelete(dataset.id, e)}
              className="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
              title="删除知识库"
            >
              <Trash2 size={12} />
            </button>
          </>
        )}
        <div 
          onClick={(e) => canSelect && onSelect(dataset.id, e)}
          className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${canSelect ? '' : 'opacity-40 cursor-not-allowed'} ${selected ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white border-slate-300 hover:border-blue-400'}`}
        >
          {selected && <CheckSquare size={14} />}
        </div>
      </div>

      <div className="flex items-start justify-between mb-4">
        <div className="p-3 bg-blue-50 rounded-lg group-hover:bg-blue-100 transition-colors">
          <Database className="w-6 h-6 text-blue-500" />
        </div>
      </div>
      
      <h3 className="font-bold text-slate-800 mb-1 group-hover:text-blue-600 transition-colors line-clamp-1 pr-14">{dataset.name}</h3>
      <p className="text-sm text-slate-400 mb-4 line-clamp-2">{dataset.description || '暂无描述'}</p>
      <div className="text-xs text-slate-500 mb-3">
        创建人：{dataset.creatorUsername || dataset.creator_username || dataset.creatorUserName || dataset.owner_username || dataset.ownerUsername || dataset.created_by || '未知'}
      </div>
      {!manageable && (
        <div className="text-[11px] text-amber-600 mb-3">仅可查看该知识库存在，不可进入内部内容</div>
      )}
      
      <div className="flex items-center justify-between text-xs text-slate-500 border-t pt-4">
        <span className="flex items-center gap-1">
          <FileText size={14} />
          全部文件: {dataset.document_count || 0}
        </span>
        <span className="flex items-center gap-1">
          <Clock size={14} />
          {new Date(dataset.create_time).toLocaleDateString()}
        </span>
      </div>
    </div>
  )
}

function DatasetManager() {
  const [datasets, setDatasets] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newDatasetName, setNewDatasetName] = useState('')
  const [viewingDataset, setViewingDataset] = useState(null)
  const [selectedDatasets, setSelectedDatasets] = useState([])
  const [batchDeleting, setBatchDeleting] = useState(false)
  const [renameModal, setRenameModal] = useState({
    isOpen: false,
    dataset: null,
    initialValue: '',
    initialDescription: '',
    isSubmitting: false
  })
  const manageableDatasets = useMemo(() => datasets.filter(ds => ds?.manageable !== false), [datasets])

  const loadData = () => {
    setLoading(true)
    setSelectedDatasets([]) // Reset selection
    fetchDatasets()
      .then(setDatasets)
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleCreate = async () => {
    if (!newDatasetName.trim()) return
    setCreating(true)
    try {
      await createDataset(newDatasetName)
      setNewDatasetName('')
      loadData()
    } catch (e) {
      alert('创建失败: ' + e.message)
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id, e) => {
    e.stopPropagation()
    if (!window.confirm('确定要删除这个知识库吗？此操作不可恢复。')) return
    try {
      // Optimistic update to immediately remove from UI
      setDatasets(prev => prev.filter(d => d.id !== id))
      await deleteDataset(id)
      // Wait a bit before reloading to allow backend consistency
      setTimeout(() => loadData(), 500)
    } catch (e) {
      alert('删除失败: ' + e.message)
      loadData() // Revert if failed
    }
  }

  const handleRenameDataset = (dataset, e) => {
    e.stopPropagation()
    setRenameModal({
      isOpen: true,
      dataset,
      initialValue: dataset.name,
      initialDescription: dataset.description || '',
      isSubmitting: false
    })
  }

  const handleConfirmRename = async (newName, newDescription) => {
    if (!newName || (newName === renameModal.initialValue && newDescription === renameModal.initialDescription)) {
      setRenameModal(prev => ({ ...prev, isOpen: false }))
      return
    }

    setRenameModal(prev => ({ ...prev, isSubmitting: true }))
    try {
      await updateDataset(renameModal.dataset.id, newName, newDescription)
      loadData()
      setRenameModal(prev => ({ ...prev, isOpen: false }))
    } catch (e) {
      alert('修改失败: ' + e.message)
      setRenameModal(prev => ({ ...prev, isSubmitting: false }))
    }
  }

  const handleBatchDelete = async () => {
    if (selectedDatasets.length === 0) return
    if (!window.confirm(`确定要删除选中的 ${selectedDatasets.length} 个知识库吗？此操作不可恢复。`)) return
    
    setBatchDeleting(true)
    try {
      await deleteDatasets(selectedDatasets)
      // Optimistic update
      setDatasets(prev => prev.filter(d => !selectedDatasets.includes(d.id)))
      setSelectedDatasets([])
      // Wait a bit before reloading
      setTimeout(() => loadData(), 500)
    } catch (e) {
      alert('批量删除失败: ' + e.message)
      loadData()
    } finally {
      setBatchDeleting(false)
    }
  }

  const handleSelectDataset = (id, e) => {
    if (e) e.stopPropagation()
    setSelectedDatasets(prev => 
      prev.includes(id) 
        ? prev.filter(did => did !== id)
        : [...prev, id]
    )
  }

  const handleSelectAll = () => {
    if (selectedDatasets.length === manageableDatasets.length) {
      setSelectedDatasets([])
    } else {
      setSelectedDatasets(manageableDatasets.map(d => d.id))
    }
  }

  if (viewingDataset) {
    return <DatasetDetail dataset={viewingDataset} onBack={() => {
      setViewingDataset(null)
      loadData() // Reload list when coming back
    }} />
  }

  return (
    <div className="p-8 max-w-7xl mx-auto h-full overflow-y-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Database className="text-blue-500" size={24} />
            知识库管理
          </h2>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-slate-500 text-sm">创建和管理您的本地知识库</p>
            {manageableDatasets.length > 0 && (
              <button 
                onClick={handleSelectAll}
                className="text-xs text-blue-600 hover:underline ml-2"
              >
                {selectedDatasets.length === manageableDatasets.length ? '取消全选' : '全选'}
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {selectedDatasets.length > 0 && (
            <button 
              onClick={handleBatchDelete}
              disabled={batchDeleting}
              className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 flex items-center gap-2 disabled:opacity-50 transition-colors mr-2"
            >
              {batchDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              批量删除 ({selectedDatasets.length})
            </button>
          )}
          <input
            type="text"
            placeholder="新知识库名称"
            className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={newDatasetName}
            onChange={(e) => setNewDatasetName(e.target.value)}
          />
          <button
            onClick={handleCreate}
            disabled={creating || !newDatasetName.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {creating ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}
            新建
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {datasets.map((ds) => (
            <DatasetCard 
              key={ds.id} 
              dataset={ds} 
              onClick={() => {
                if (ds?.manageable === false) {
                  alert('该知识库不是你创建的，仅可查看存在，不可进入内部内容。')
                  return
                }
                setViewingDataset(ds)
              }} 
              onDelete={handleDelete}
              onRename={handleRenameDataset}
              selected={selectedDatasets.includes(ds.id)}
              onSelect={handleSelectDataset}
              selectionMode={selectedDatasets.length > 0}
            />
          ))}
          {datasets.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-16 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <Database size={48} className="mb-4 text-slate-300" />
              <p>暂无知识库，请点击右上角新建</p>
            </div>
          )}
        </div>
      )}
      <RenameModal 
        isOpen={renameModal.isOpen}
        title="编辑知识库"
        initialValue={renameModal.initialValue}
        initialDescription={renameModal.initialDescription}
        isSubmitting={renameModal.isSubmitting}
        onClose={() => setRenameModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={handleConfirmRename}
      />
    </div>
  )
}

function PermissionManager() {
  const [datasets, setDatasets] = useState([])
  const [users, setUsers] = useState([])
  const [selectedUser, setSelectedUser] = useState(null)
  const [selectedDatasetIds, setSelectedDatasetIds] = useState([])
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)

  // Load datasets and users on mount
  useEffect(() => {
    fetchDatasets().then(data => setDatasets(Array.isArray(data) ? data : []))
    fetchUsers().then(data => {
      setUsers(Array.isArray(data) ? data : [])
      if (data.length > 0) setSelectedUser(data[0].username)
    })
  }, [])

  // Load permissions when selectedUser changes
  useEffect(() => {
    if (!selectedUser) return
    setLoading(true)
    fetchUserPermissions(selectedUser)
      .then(perms => {
        const ids = perms.map(p => p.resourceId)
        setSelectedDatasetIds(ids)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [selectedUser])

  const handleCheckboxChange = (dsId) => {
    setSelectedDatasetIds(prev => 
      prev.includes(dsId) 
        ? prev.filter(id => id !== dsId)
        : [...prev, dsId]
    )
  }

  const handleSelectAll = () => {
    if (selectedDatasetIds.length === datasets.length) {
      setSelectedDatasetIds([])
    } else {
      setSelectedDatasetIds(datasets.map(ds => ds.id))
    }
  }

  const handleSave = async () => {
    if (!selectedUser) return
    setProcessing(true)
    try {
      await syncPermissions(selectedUser, selectedDatasetIds)
      alert('权限已保存')
    } catch (e) {
      alert('保存失败: ' + e.message)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto h-full overflow-y-auto">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">权限分配</h2>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* User Selection */}
        <div className="bg-white p-6 rounded-xl border shadow-sm h-fit">
          <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Users className="text-blue-500" size={20} />
            选择用户
          </h3>
          <div className="space-y-2">
            {users.map(u => (
              <button
                key={u.username}
                onClick={() => setSelectedUser(u.username)}
                className={cn(
                  "w-full px-4 py-3 rounded-lg border text-left transition-all flex items-center justify-between",
                  selectedUser === u.username 
                    ? "bg-blue-50 border-blue-500 text-blue-700 shadow-sm" 
                    : "hover:bg-slate-50 border-slate-200 text-slate-600"
                )}
              >
                <span className="font-medium">{u.username}</span>
                {selectedUser === u.username && <CheckSquare size={18} />}
              </button>
            ))}
          </div>
        </div>

        {/* Dataset Selection */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border shadow-sm flex flex-col h-[600px]">
          <div className="flex justify-between items-center mb-4 pb-4 border-b">
            <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <Database className="text-blue-500" size={20} />
              选择知识库
            </h3>
            <div className="flex gap-3">
              <button 
                onClick={handleSelectAll}
                className="text-sm text-blue-600 hover:underline"
              >
                {selectedDatasetIds.length === datasets.length ? '取消全选' : '全选'}
              </button>
              <span className="text-sm text-slate-400">
                已选: {selectedDatasetIds.length}
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-2">
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin text-slate-400" /></div>
            ) : datasets.map(ds => (
              <label 
                key={ds.id} 
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                  selectedDatasetIds.includes(ds.id)
                    ? "bg-blue-50 border-blue-200"
                    : "hover:bg-slate-50 border-slate-100"
                )}
              >
                <div className={cn(
                  "w-5 h-5 rounded border flex items-center justify-center transition-colors",
                  selectedDatasetIds.includes(ds.id)
                    ? "bg-blue-500 border-blue-500 text-white"
                    : "bg-white border-slate-300"
                )}>
                  {selectedDatasetIds.includes(ds.id) && <CheckSquare size={14} />}
                </div>
                <input 
                  type="checkbox" 
                  className="hidden"
                  checked={selectedDatasetIds.includes(ds.id)}
                  onChange={() => handleCheckboxChange(ds.id)}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-700 truncate">{ds.name}</div>
                  <div className="text-xs text-slate-400 font-mono">{ds.id.slice(0, 8)}</div>
                </div>
              </label>
            ))}
            {datasets.length === 0 && (
              <div className="text-center py-12 text-slate-400">
                暂无知识库，请先创建
              </div>
            )}
          </div>

          <div className="pt-4 mt-4 border-t flex justify-end">
            <button 
              onClick={handleSave}
              disabled={processing || !selectedUser}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {processing && <Loader2 size={16} className="animate-spin" />}
              保存权限
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function UserManagement({ currentRole, currentUserId }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [actionLoadingId, setActionLoadingId] = useState(null)
  const [editingUserId, setEditingUserId] = useState(null)
  const [editForm, setEditForm] = useState({ username: '', password: '' })
  const [createForm, setCreateForm] = useState({
    username: '',
    password: '',
    role: 'user',
    managerUserId: ''
  })
  const canCreateAdmin = isSuperAdminRole(currentRole)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchUsers()
      setUsers(Array.isArray(data) ? data : [])
    } catch (e) {
      alert(`加载用户失败: ${e.message}`)
      setUsers([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const handleCreateUser = async () => {
    const username = String(createForm.username || '').trim()
    const password = String(createForm.password || '').trim()
    if (!username || !password) {
      alert('请输入用户名和密码')
      return
    }
    if (canCreateAdmin && createForm.role === 'user' && !String(createForm.managerUserId || '').trim()) {
      alert('超级管理员创建普通用户时，必须指定直属管理员ID')
      return
    }
    setCreateLoading(true)
    try {
      let created = null
      // 说明：仅 super_admin 可创建管理员；admin 只能创建普通用户并自动归属自己。
      if (createForm.role === 'admin') {
        if (!canCreateAdmin) {
          throw new Error('仅超级管理员可创建管理员')
        }
        created = await createAdminUser({ username, password })
      } else {
        created = await createNormalUser({
          username,
          password,
          managerUserId: canCreateAdmin ? createForm.managerUserId : undefined
        })
      }
      await loadUsers()
      setCreateForm(prev => ({ ...prev, username: '', password: '', managerUserId: '' }))
      alert(`创建成功：ID=${created?.id ?? '-'}，用户名=${created?.username || username}，角色=${created?.role || createForm.role}`)
    } catch (e) {
      alert(`创建失败: ${e.message}`)
    } finally {
      setCreateLoading(false)
    }
  }

  const handlePromote = async (user) => {
    if (!isSuperAdminRole(currentRole)) {
      return
    }
    if (!window.confirm(`确认将用户 ${user.username} 升级为管理员？`)) {
      return
    }
    setActionLoadingId(user.id)
    try {
      await promoteUserToAdmin(user.id)
      await loadUsers()
      alert('升级成功')
    } catch (e) {
      alert(`升级失败: ${e.message}`)
    } finally {
      setActionLoadingId(null)
    }
  }

  const canEditUser = (user) => {
    if (!user || !user.id) {
      return false
    }
    if (isSuperAdminRole(currentRole)) {
      return true
    }
    if (Number(user.id) === Number(currentUserId)) {
      return true
    }
    return user.role === 'user' && Number(user.managerUserId) === Number(currentUserId)
  }

  const openEdit = (user) => {
    setEditingUserId(user.id)
    setEditForm({ username: user.username || '', password: '' })
  }

  const handleSaveEdit = async (user) => {
    const nextUsername = String(editForm.username || '').trim()
    const nextPassword = String(editForm.password || '').trim()
    if (!nextUsername && !nextPassword) {
      alert('用户名和密码不能同时为空')
      return
    }
    setActionLoadingId(user.id)
    try {
      await updateManagedUser(user.id, { username: nextUsername, password: nextPassword })
      setEditingUserId(null)
      setEditForm({ username: '', password: '' })
      await loadUsers()
      alert('修改成功')
    } catch (e) {
      alert(`修改失败: ${e.message}`)
    } finally {
      setActionLoadingId(null)
    }
  }

  const canDeleteUser = (user) => {
    if (!user || !user.id) {
      return false
    }
    if (isSuperAdminRole(currentRole)) {
      return user.role !== 'super_admin' && user.id !== currentUserId
    }
    return user.role === 'user' && Number(user.managerUserId) === Number(currentUserId)
  }

  const handleDeleteUser = async (user) => {
    if (!canDeleteUser(user)) {
      return
    }
    if (!window.confirm(`确认删除用户 ${user.username}？此操作不可恢复。`)) {
      return
    }
    setActionLoadingId(user.id)
    try {
      await deleteManagedUser(user.id)
      await loadUsers()
      alert('删除成功')
    } catch (e) {
      alert(`删除失败: ${e.message}`)
    } finally {
      setActionLoadingId(null)
    }
  }

  return (
    <div className="p-8 max-w-6xl mx-auto h-full overflow-y-auto">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">用户管理</h2>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="bg-white p-6 rounded-xl border shadow-sm h-fit">
          <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Plus className="text-blue-500" size={20} />
            创建用户
          </h3>
          <div className="space-y-3">
            <input
              value={createForm.username}
              onChange={(e) => setCreateForm(prev => ({ ...prev, username: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="新用户名"
            />
            <input
              type="password"
              value={createForm.password}
              onChange={(e) => setCreateForm(prev => ({ ...prev, password: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="新用户密码"
            />
            <select
              value={createForm.role}
              onChange={(e) => setCreateForm(prev => ({ ...prev, role: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="user">普通用户</option>
              {canCreateAdmin && <option value="admin">普通管理员</option>}
            </select>
            {canCreateAdmin && createForm.role === 'user' && (
              <input
                value={createForm.managerUserId}
                onChange={(e) => setCreateForm(prev => ({ ...prev, managerUserId: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="直属管理员ID（必填）"
              />
            )}
            <button
              onClick={handleCreateUser}
              disabled={createLoading}
              className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {createLoading && <Loader2 size={16} className="animate-spin" />}
              创建用户
            </button>
          </div>
        </div>
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <Users className="text-blue-500" size={20} />
              用户列表
            </h3>
            <button onClick={loadUsers} className="text-sm text-blue-600 hover:underline">刷新</button>
          </div>
          {loading ? (
            <div className="py-8 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>
          ) : (
            <div className="space-y-2">
              {users.map((u) => (
                <div key={u.id || u.username}>
                  <div className="border rounded-lg px-4 py-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-slate-800">{u.username}</div>
                      <div className="text-xs text-slate-500">
                        ID: {u.id} | 角色: {u.role} | 直属管理员ID: {u.managerUserId ?? '-'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {canEditUser(u) && (
                        <button
                          onClick={() => openEdit(u)}
                          disabled={actionLoadingId === u.id}
                          className="px-3 py-1.5 rounded border border-blue-300 text-blue-600 hover:bg-blue-50 text-xs disabled:opacity-50"
                        >
                          修改账号
                        </button>
                      )}
                      {isSuperAdminRole(currentRole) && u.role === 'user' && (
                        <button
                          onClick={() => handlePromote(u)}
                          disabled={actionLoadingId === u.id}
                          className="px-3 py-1.5 rounded border border-emerald-300 text-emerald-600 hover:bg-emerald-50 text-xs disabled:opacity-50"
                        >
                          升级为管理员
                        </button>
                      )}
                      {canDeleteUser(u) && (
                        <button
                          onClick={() => handleDeleteUser(u)}
                          disabled={actionLoadingId === u.id}
                          className="px-3 py-1.5 rounded border border-red-300 text-red-600 hover:bg-red-50 text-xs disabled:opacity-50"
                        >
                          删除
                        </button>
                      )}
                    </div>
                  </div>
                  {editingUserId === u.id && (
                    <div className="mt-2 p-3 border rounded-lg bg-slate-50">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <input
                          value={editForm.username}
                          onChange={(e) => setEditForm(prev => ({ ...prev, username: e.target.value }))}
                          className="w-full px-3 py-2 rounded border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="新用户名（可改）"
                        />
                        <input
                          type="password"
                          value={editForm.password}
                          onChange={(e) => setEditForm(prev => ({ ...prev, password: e.target.value }))}
                          className="w-full px-3 py-2 rounded border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="新密码（不改可留空）"
                        />
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          onClick={() => handleSaveEdit(u)}
                          disabled={actionLoadingId === u.id}
                          className="px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 text-xs disabled:opacity-50"
                        >
                          保存修改
                        </button>
                        <button
                          onClick={() => {
                            setEditingUserId(null)
                            setEditForm({ username: '', password: '' })
                          }}
                          className="px-3 py-1.5 rounded border border-slate-300 text-slate-600 hover:bg-slate-100 text-xs"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {users.length === 0 && <div className="text-center py-8 text-slate-400">暂无可管理用户</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function RouteSampleManager() {
  const [samples, setSamples] = useState([])
  const [sourceOptions, setSourceOptions] = useState([])
  const [routeOptions, setRouteOptions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({
    page: 1,
    pageSize: 20,
    username: '',
    source: '',
    chosenRoute: '',
    startTime: '',
    endTime: '',
    queryKeyword: ''
  })
  const [total, setTotal] = useState(0)

  // 路由样本查询统一入口：支持范围筛选 + 分页。
  const loadSamples = async (nextFilters = filters) => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchRouteSamples(nextFilters)
      setSamples(Array.isArray(data?.items) ? data.items : [])
      setTotal(Number(data?.total || 0))
    } catch (e) {
      setError(e.message || '加载失败')
      setSamples([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSamples(filters)
    fetchRouteSampleSources()
      .then(data => {
        setSourceOptions(Array.isArray(data?.sources) ? data.sources : [])
        setRouteOptions(Array.isArray(data?.routes) ? data.routes : [])
      })
      .catch(() => {
        setSourceOptions([])
        setRouteOptions([])
      })
  }, [])

  const handleSearch = () => {
    const next = { ...filters, page: 1 }
    setFilters(next)
    loadSamples(next)
  }

  const handleReset = () => {
    const next = {
      page: 1,
      pageSize: 20,
      username: '',
      source: '',
      chosenRoute: '',
      startTime: '',
      endTime: '',
      queryKeyword: ''
    }
    setFilters(next)
    loadSamples(next)
  }

  const handlePageChange = (nextPage) => {
    const safePage = Math.max(1, nextPage)
    const next = { ...filters, page: safePage }
    setFilters(next)
    loadSamples(next)
  }

  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, Number(filters.pageSize) || 20)))
  const pageNumbers = Array.from({ length: totalPages }, (_, idx) => idx + 1).slice(0, 200)

  const setFilterField = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const formatTime = (value) => {
    if (!value) return '-'
    const dt = new Date(value)
    if (Number.isNaN(dt.getTime())) return String(value)
    return dt.toLocaleString()
  }

  const csvEscape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`

  const handleExportCsv = () => {
    const headers = [
      'id', 'created_at', 'conversation_id', 'username', 'source',
      'chosen_route', 'chosen_confidence', 'chosen_tool',
      'local_route', 'local_confidence',
      'planner_route', 'planner_confidence', 'query_text'
    ]
    const rows = samples.map(item => ([
      item.id,
      item.createdAt,
      item.conversationId,
      item.username,
      item.source,
      item.chosenRoute,
      item.chosenConfidence,
      item.chosenTool,
      item.localRoute,
      item.localConfidence,
      item.plannerRoute,
      item.plannerConfidence,
      item.queryText
    ].map(csvEscape).join(',')))
    const content = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const stamp = new Date().toISOString().replaceAll(':', '-')
    link.href = url
    link.download = `route_samples_${stamp}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-8 h-full overflow-y-auto">
      <div className="max-w-[1400px] mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">路由样本</h2>
            <p className="text-sm text-slate-500 mt-1">查看 Planner 与本地 Router 决策样本，支持筛选与导出</p>
          </div>
          <button
            onClick={handleExportCsv}
            disabled={samples.length === 0}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Download size={16} />
            导出 CSV
          </button>
        </div>

        <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">用户名</label>
            <input
              type="text"
              value={filters.username}
              onChange={(e) => setFilterField('username', e.target.value)}
              placeholder="如 superadmin"
              className="w-36 px-3 py-2 border rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">来源</label>
            <select
              value={filters.source}
              onChange={(e) => setFilterField('source', e.target.value)}
              className="w-48 px-3 py-2 border rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部来源</option>
              {sourceOptions.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">最终路由</label>
            <select
              value={filters.chosenRoute}
              onChange={(e) => setFilterField('chosenRoute', e.target.value)}
              className="w-40 px-3 py-2 border rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部路由</option>
              {routeOptions.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">开始时间</label>
            <input
              type="date"
              value={filters.startTime}
              onChange={(e) => setFilterField('startTime', e.target.value)}
              className="w-40 px-3 py-2 border rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">结束时间</label>
            <input
              type="date"
              value={filters.endTime}
              onChange={(e) => setFilterField('endTime', e.target.value)}
              className="w-40 px-3 py-2 border rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Query关键词</label>
            <input
              type="text"
              value={filters.queryKeyword}
              onChange={(e) => setFilterField('queryKeyword', e.target.value)}
              placeholder="关键词模糊搜索"
              className="w-48 px-3 py-2 border rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            <Search size={16} />
            查询
          </button>
          <button
            onClick={handleReset}
            disabled={loading}
            className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 disabled:opacity-50 flex items-center gap-2"
          >
            <RefreshCw size={16} />
            重置
          </button>
        </div>

        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          {error && (
            <div className="px-4 py-3 text-sm text-red-600 border-b bg-red-50">
              {error}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr className="text-slate-600">
                  <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">时间</th>
                  <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">会话</th>
                  <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">用户</th>
                  <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">来源</th>
                  <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">最终</th>
                  <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">本地候选</th>
                  <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Planner候选</th>
                  <th className="px-3 py-2 text-left font-semibold">Query</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td className="px-3 py-8 text-center text-slate-400" colSpan={8}>
                      <div className="inline-flex items-center gap-2">
                        <Loader2 className="animate-spin" size={16} />
                        加载中...
                      </div>
                    </td>
                  </tr>
                )}
                {!loading && samples.length === 0 && (
                  <tr>
                    <td className="px-3 py-8 text-center text-slate-400" colSpan={8}>
                      暂无样本
                    </td>
                  </tr>
                )}
                {!loading && samples.map(item => (
                  <tr key={item.id || `${item.conversationId}-${item.createdAt}`} className="border-b last:border-b-0 hover:bg-slate-50">
                    <td className="px-3 py-2 align-top whitespace-nowrap text-slate-600">{formatTime(item.createdAt)}</td>
                    <td className="px-3 py-2 align-top font-mono text-xs text-slate-700">{item.conversationId || '-'}</td>
                    <td className="px-3 py-2 align-top text-slate-700">{item.username || '-'}</td>
                    <td className="px-3 py-2 align-top">
                      <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 text-xs font-medium">
                        {item.source || '-'}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top text-xs">
                      <div className="font-medium text-slate-800">{item.chosenRoute || '-'}</div>
                      <div className="text-slate-500">conf: {item.chosenConfidence ?? '-'}</div>
                      <div className="text-slate-500">tool: {item.chosenTool || '-'}</div>
                    </td>
                    <td className="px-3 py-2 align-top text-xs">
                      <div className="font-medium text-slate-800">{item.localRoute || '-'}</div>
                      <div className="text-slate-500">conf: {item.localConfidence ?? '-'}</div>
                    </td>
                    <td className="px-3 py-2 align-top text-xs">
                      <div className="font-medium text-slate-800">{item.plannerRoute || '-'}</div>
                      <div className="text-slate-500">conf: {item.plannerConfidence ?? '-'}</div>
                    </td>
                    <td className="px-3 py-2 align-top text-slate-700 break-all min-w-[280px]">{item.queryText || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t bg-slate-50 flex flex-wrap items-center gap-3 text-xs text-slate-600">
            <span>共 {total} 条</span>
            <span>第 {filters.page} / {totalPages} 页</span>
            <button
              onClick={() => handlePageChange(filters.page - 1)}
              disabled={loading || filters.page <= 1}
              className="px-2 py-1 border rounded hover:bg-white disabled:opacity-50"
            >
              上一页
            </button>
            <button
              onClick={() => handlePageChange(filters.page + 1)}
              disabled={loading || filters.page >= totalPages}
              className="px-2 py-1 border rounded hover:bg-white disabled:opacity-50"
            >
              下一页
            </button>
            <select
              value={String(filters.page)}
              onChange={(e) => handlePageChange(Number(e.target.value))}
              className="px-2 py-1 border rounded bg-white"
            >
              {pageNumbers.map(pageNo => (
                <option key={pageNo} value={pageNo}>{pageNo}</option>
              ))}
            </select>
            <div className="ml-auto inline-flex items-center gap-2">
              <span>每页</span>
              <select
                value={String(filters.pageSize)}
                onChange={(e) => {
                  const next = { ...filters, pageSize: Number(e.target.value), page: 1 }
                  setFilters(next)
                  loadSamples(next)
                }}
                className="px-2 py-1 border rounded bg-white"
              >
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const DEFAULT_SKILL_FORM = {
  toolCode: '',
  toolName: '',
  description: '',
  protocolType: 'HTTP',
  invokeUrl: '',
  manifestUrl: '',
  healthUrl: '',
  triggerKeywords: '',
  inputMode: 'FILE_AND_PARAMS',
  outputMode: 'MIXED',
  uploadRequired: true,
  acceptedFileTypes: '.dxf,.dwg',
  maxFiles: '200',
  parametersSchema: '{\n  "type": "object",\n  "properties": {}\n}',
  draftArgsTemplate: '{\n  "example": ""\n}',
  status: 'ONLINE'
}

function createDefaultSkillForm() {
  return { ...DEFAULT_SKILL_FORM }
}

function mapSkillItemToForm(item) {
  if (!item || typeof item !== 'object') return createDefaultSkillForm()
  return {
    toolCode: String(item.tool_code || item.toolCode || ''),
    toolName: String(item.tool_name || item.toolName || ''),
    description: String(item.description || ''),
    protocolType: String(item.protocol_type || item.protocolType || 'HTTP'),
    invokeUrl: String(item.invoke_url || item.invokeUrl || ''),
    manifestUrl: String(item.manifest_url || item.manifestUrl || ''),
    healthUrl: String(item.health_url || item.healthUrl || ''),
    triggerKeywords: String(item.trigger_keywords || item.triggerKeywords || ''),
    inputMode: String(item.input_mode || item.inputMode || 'FILE_AND_PARAMS'),
    outputMode: String(item.output_mode || item.outputMode || 'MIXED'),
    uploadRequired: Number(item.upload_required ?? item.uploadRequired ?? 1) === 1,
    acceptedFileTypes: String(item.accepted_file_types || item.acceptedFileTypes || '.dxf,.dwg'),
    maxFiles: String(item.max_files ?? item.maxFiles ?? 200),
    parametersSchema: String(item.parameters_schema || item.parametersSchema || DEFAULT_SKILL_FORM.parametersSchema),
    draftArgsTemplate: String(item.draft_args_template || item.draftArgsTemplate || DEFAULT_SKILL_FORM.draftArgsTemplate),
    status: String(item.status || 'ONLINE')
  }
}

function buildSkillRegisterPayload(form) {
  return {
    toolCode: String(form.toolCode || '').trim(),
    toolName: String(form.toolName || '').trim(),
    description: String(form.description || '').trim(),
    protocolType: String(form.protocolType || 'HTTP'),
    invokeUrl: String(form.invokeUrl || '').trim(),
    manifestUrl: String(form.manifestUrl || '').trim(),
    healthUrl: String(form.healthUrl || '').trim(),
    triggerKeywords: String(form.triggerKeywords || '').trim(),
    inputMode: String(form.inputMode || 'FILE_AND_PARAMS'),
    outputMode: String(form.outputMode || 'MIXED'),
    uploadRequired: Boolean(form.uploadRequired),
    acceptedFileTypes: String(form.acceptedFileTypes || '').trim(),
    maxFiles: Number(form.maxFiles || 0),
    parametersSchema: String(form.parametersSchema || '').trim(),
    draftArgsTemplate: String(form.draftArgsTemplate || '').trim(),
    status: String(form.status || 'ONLINE')
  }
}

function SkillFormPanel({ title, description, form, setForm, onSubmit, submitText, pending, lockToolCode = false }) {
  const setField = (key, value) => setForm(prev => ({ ...prev, [key]: value }))
  return (
    <form onSubmit={onSubmit} className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
        <p className="text-sm text-slate-500 mt-1">{description}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">tool_code（唯一编码）*</label>
          <p className="text-[11px] text-slate-500 mb-1">默认值：无，建议小写字母+下划线，例如 `cad_area_calc`</p>
          <input value={form.toolCode} disabled={lockToolCode} onChange={(e) => setField('toolCode', e.target.value)} placeholder="cad_area_calc" className="w-full px-3 py-2 border rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">tool_name（显示名称）*</label>
          <p className="text-[11px] text-slate-500 mb-1">默认值：无，例如“面积计算”</p>
          <input value={form.toolName} onChange={(e) => setField('toolName', e.target.value)} placeholder="面积计算" className="w-full px-3 py-2 border rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">invoke_url（调用地址）*</label>
          <p className="text-[11px] text-slate-500 mb-1">默认值：无，例如 `http://host:port/invoke`</p>
          <input value={form.invokeUrl} onChange={(e) => setField('invokeUrl', e.target.value)} placeholder="http://127.0.0.1:9001/invoke" className="w-full px-3 py-2 border rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">description（用途说明）</label>
          <p className="text-[11px] text-slate-500 mb-1">默认值：空，简要说明技能用于什么业务</p>
          <input value={form.description} onChange={(e) => setField('description', e.target.value)} placeholder="用于 CAD 图纸面积自动计算" className="w-full px-3 py-2 border rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">manifest_url（协议描述地址）</label>
          <p className="text-[11px] text-slate-500 mb-1">默认值：空，外部协议说明文档地址</p>
          <input value={form.manifestUrl} onChange={(e) => setField('manifestUrl', e.target.value)} placeholder="http://127.0.0.1:9001/.well-known/manifest.json" className="w-full px-3 py-2 border rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">health_url（健康检查地址）</label>
          <p className="text-[11px] text-slate-500 mb-1">默认值：空，便于平台定时探活</p>
          <input value={form.healthUrl} onChange={(e) => setField('healthUrl', e.target.value)} placeholder="http://127.0.0.1:9001/health" className="w-full px-3 py-2 border rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">trigger_keywords（触发词）</label>
          <p className="text-[11px] text-slate-500 mb-1">默认值：空，逗号分隔，如 `面积,半面积,计算`</p>
          <input value={form.triggerKeywords} onChange={(e) => setField('triggerKeywords', e.target.value)} placeholder="面积,半面积,计算" className="w-full px-3 py-2 border rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">accepted_file_types（允许文件类型）</label>
          <p className="text-[11px] text-slate-500 mb-1">默认值：`.dxf,.dwg`，英文逗号分隔</p>
          <input value={form.acceptedFileTypes} onChange={(e) => setField('acceptedFileTypes', e.target.value)} placeholder=".dxf,.dwg" className="w-full px-3 py-2 border rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">max_files（最大上传数）</label>
          <p className="text-[11px] text-slate-500 mb-1">默认值：200</p>
          <input type="number" min="1" value={form.maxFiles} onChange={(e) => setField('maxFiles', e.target.value)} placeholder="200" className="w-full px-3 py-2 border rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">protocol_type（协议类型）</label>
          <p className="text-[11px] text-slate-500 mb-1">默认值：HTTP</p>
          <select value={form.protocolType} onChange={(e) => setField('protocolType', e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="HTTP">HTTP</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">input_mode（输入模式）</label>
          <p className="text-[11px] text-slate-500 mb-1">默认值：FILE_AND_PARAMS</p>
          <select value={form.inputMode} onChange={(e) => setField('inputMode', e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="FILE_AND_PARAMS">FILE_AND_PARAMS</option>
            <option value="PARAMS_ONLY">PARAMS_ONLY</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">output_mode（输出模式）</label>
          <p className="text-[11px] text-slate-500 mb-1">默认值：MIXED</p>
          <select value={form.outputMode} onChange={(e) => setField('outputMode', e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="MIXED">MIXED</option>
            <option value="TEXT">TEXT</option>
            <option value="FILE">FILE</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">status（上线状态）</label>
          <p className="text-[11px] text-slate-500 mb-1">默认值：ONLINE</p>
          <select value={form.status} onChange={(e) => setField('status', e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="ONLINE">ONLINE</option>
            <option value="OFFLINE">OFFLINE</option>
          </select>
        </div>
        <div className="md:col-span-2 xl:col-span-3">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.uploadRequired} onChange={(e) => setField('uploadRequired', e.target.checked)} />
            <span className="font-medium">upload_required（是否必须上传文件）</span>
          </label>
          <p className="text-[11px] text-slate-500 mt-1">默认值：勾选。若取消，表示可纯参数调用。</p>
        </div>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">parameters_schema（参数 JSON Schema）</label>
          <p className="text-[11px] text-slate-500 mb-1">默认值：`type=object` 空属性，可按 JSON Schema 扩展</p>
          <textarea value={form.parametersSchema} onChange={(e) => setField('parametersSchema', e.target.value)} rows={8} className="w-full font-mono text-xs px-3 py-2 border rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">draft_args_template（草稿参数模板）</label>
          <p className="text-[11px] text-slate-500 mb-1">默认值：示例 JSON（example 字段），用于预填表单</p>
          <textarea value={form.draftArgsTemplate} onChange={(e) => setField('draftArgsTemplate', e.target.value)} rows={8} className="w-full font-mono text-xs px-3 py-2 border rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>
      <div className="flex justify-end">
        <button type="submit" disabled={pending} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">
          {pending ? '提交中...' : submitText}
        </button>
      </div>
    </form>
  )
}

function SkillManager({ role }) {
  const canManageSkills = isSuperAdminRole(role)
  const [subPage, setSubPage] = useState('overview')
  const [skills, setSkills] = useState([])
  const [auditRows, setAuditRows] = useState([])
  const [auditTotal, setAuditTotal] = useState(0)
  const [skillsLoading, setSkillsLoading] = useState(false)
  const [auditLoading, setAuditLoading] = useState(false)
  const [skillsError, setSkillsError] = useState('')
  const [auditError, setAuditError] = useState('')
  const [onlineOnly, setOnlineOnly] = useState(false)
  const [auditOptions, setAuditOptions] = useState({
    statuses: [],
    usernames: [],
    toolCodes: []
  })
  const [auditFilters, setAuditFilters] = useState({
    page: 1,
    pageSize: 20,
    startTime: '',
    endTime: '',
    username: '',
    status: '',
    toolCode: ''
  })
  const [actionPending, setActionPending] = useState({})
  const [createPending, setCreatePending] = useState(false)
  const [updatePending, setUpdatePending] = useState(false)
  const [createForm, setCreateForm] = useState(() => createDefaultSkillForm())
  const [updateForm, setUpdateForm] = useState(() => createDefaultSkillForm())

  const loadSkills = useCallback(async (nextOnlineOnly = onlineOnly) => {
    setSkillsLoading(true)
    setSkillsError('')
    try {
      const data = await fetchAdminSkills(nextOnlineOnly)
      setSkills(data)
    } catch (e) {
      setSkills([])
      setSkillsError(e?.message || '加载失败')
    } finally {
      setSkillsLoading(false)
    }
  }, [onlineOnly])

  const loadAudit = useCallback(async (nextFilters = auditFilters) => {
    setAuditLoading(true)
    setAuditError('')
    try {
      const data = await fetchSkillAudit(nextFilters)
      setAuditRows(Array.isArray(data?.items) ? data.items : [])
      setAuditTotal(Number(data?.total || 0))
    } catch (e) {
      setAuditRows([])
      setAuditTotal(0)
      setAuditError(e?.message || '加载失败')
    } finally {
      setAuditLoading(false)
    }
  }, [])

  useEffect(() => {
    if (canManageSkills) {
      loadSkills(onlineOnly)
    }
  }, [onlineOnly, loadSkills, canManageSkills])

  useEffect(() => {
    loadAudit(auditFilters)
    fetchSkillAuditOptions()
      .then(data => setAuditOptions(data))
      .catch(() => setAuditOptions({ statuses: [], usernames: [], toolCodes: [] }))
  }, [])

  const setAuditFilterField = (key, value) => {
    setAuditFilters(prev => ({ ...prev, [key]: value }))
  }

  const handleAuditSearch = () => {
    const next = { ...auditFilters, page: 1 }
    setAuditFilters(next)
    loadAudit(next)
  }

  const handleAuditReset = () => {
    const next = {
      page: 1,
      pageSize: 20,
      startTime: '',
      endTime: '',
      username: '',
      status: '',
      toolCode: ''
    }
    setAuditFilters(next)
    loadAudit(next)
  }

  const handleAuditPageChange = (nextPage) => {
    const safePage = Math.max(1, nextPage)
    const next = { ...auditFilters, page: safePage }
    setAuditFilters(next)
    loadAudit(next)
  }

  const auditTotalPages = Math.max(1, Math.ceil(auditTotal / Math.max(1, Number(auditFilters.pageSize) || 20)))
  const auditPageNumbers = Array.from({ length: auditTotalPages }, (_, idx) => idx + 1).slice(0, 200)

  const formatTime = (value) => {
    if (!value) return '-'
    const dt = new Date(value)
    if (Number.isNaN(dt.getTime())) return String(value)
    return dt.toLocaleString()
  }

  const assertFormRequired = (form) => {
    if (!String(form.toolCode || '').trim()) {
      alert('tool_code 不能为空')
      return false
    }
    if (!String(form.toolName || '').trim()) {
      alert('tool_name 不能为空')
      return false
    }
    if (!String(form.invokeUrl || '').trim()) {
      alert('invoke_url 不能为空')
      return false
    }
    return true
  }

  const handleCreateSubmit = async (e) => {
    e.preventDefault()
    if (!assertFormRequired(createForm)) return
    setCreatePending(true)
    try {
      await registerAdminSkill(buildSkillRegisterPayload(createForm))
      setCreateForm(createDefaultSkillForm())
      await loadSkills(onlineOnly)
      setSubPage('overview')
    } catch (error) {
      alert(error?.message || '新增技能失败')
    } finally {
      setCreatePending(false)
    }
  }

  const handleUpdateSubmit = async (e) => {
    e.preventDefault()
    if (!assertFormRequired(updateForm)) return
    setUpdatePending(true)
    try {
      await registerAdminSkill(buildSkillRegisterPayload(updateForm))
      await loadSkills(onlineOnly)
      setSubPage('overview')
    } catch (error) {
      alert(error?.message || '更新技能失败')
    } finally {
      setUpdatePending(false)
    }
  }

  const handleOpenUpdate = (item) => {
    setUpdateForm(mapSkillItemToForm(item))
    setSubPage('update')
  }

  const handleOffline = async (toolCode) => {
    if (!toolCode) return
    const confirmed = window.confirm(`确认下线技能 ${toolCode} 吗？`)
    if (!confirmed) return
    setActionPending(prev => ({ ...prev, [`offline:${toolCode}`]: true }))
    try {
      await offlineSkill(toolCode)
      await loadSkills(onlineOnly)
    } catch (e) {
      alert(e?.message || '下线失败')
    } finally {
      setActionPending(prev => ({ ...prev, [`offline:${toolCode}`]: false }))
    }
  }

  const handleOnline = async (toolCode) => {
    if (!toolCode) return
    const confirmed = window.confirm(`确认上线技能 ${toolCode} 吗？`)
    if (!confirmed) return
    setActionPending(prev => ({ ...prev, [`online:${toolCode}`]: true }))
    try {
      await onlineSkill(toolCode)
      await loadSkills(onlineOnly)
    } catch (e) {
      alert(e?.message || '上线失败')
    } finally {
      setActionPending(prev => ({ ...prev, [`online:${toolCode}`]: false }))
    }
  }

  const handleDelete = async (toolCode) => {
    if (!toolCode) return
    const confirmed = window.confirm(`确认删除技能 ${toolCode} 吗？此操作不可恢复。`)
    if (!confirmed) return
    setActionPending(prev => ({ ...prev, [`delete:${toolCode}`]: true }))
    try {
      await deleteAdminSkill(toolCode)
      await loadSkills(onlineOnly)
    } catch (e) {
      alert(e?.message || '删除失败')
    } finally {
      setActionPending(prev => ({ ...prev, [`delete:${toolCode}`]: false }))
    }
  }

  return (
    <div className="p-8 h-full overflow-y-auto">
      <div className="max-w-[1400px] mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">技能管理</h2>
            <p className="text-sm text-slate-500 mt-1">仅支持从列表进入“更新技能”；新增技能按钮已移动到列表工具栏。</p>
          </div>
        </div>

        {subPage === 'create' && canManageSkills && (
          <>
            <button
              onClick={() => setSubPage('overview')}
              className="px-3 py-1.5 text-xs rounded border border-slate-300 text-slate-700 hover:bg-slate-100"
            >
              返回技能列表
            </button>
            <SkillFormPanel
              title="新增技能"
              description="每个参数都带名称、简介和默认值，便于快速填写。"
              form={createForm}
              setForm={setCreateForm}
              onSubmit={handleCreateSubmit}
              submitText="新增技能"
              pending={createPending}
            />
          </>
        )}

        {subPage === 'update' && canManageSkills && (
          <>
            <button
              onClick={() => setSubPage('overview')}
              className="px-3 py-1.5 text-xs rounded border border-slate-300 text-slate-700 hover:bg-slate-100"
            >
              返回技能列表
            </button>
            <SkillFormPanel
              title="更新技能"
              description="从列表点击“修改”后会自动回填；tool_code 作为唯一标识，更新时默认锁定。"
              form={updateForm}
              setForm={setUpdateForm}
              onSubmit={handleUpdateSubmit}
              submitText="更新技能"
              pending={updatePending}
              lockToolCode
            />
          </>
        )}

        {subPage === 'overview' && (
          <>
            <div className="flex items-center gap-3">
              {canManageSkills && (
                <>
                  <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={onlineOnly}
                      onChange={(e) => setOnlineOnly(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    仅显示在线技能
                  </label>
                  <button
                    onClick={() => {
                      setCreateForm(createDefaultSkillForm())
                      setSubPage('create')
                    }}
                    className="px-4 py-2 border border-emerald-300 text-emerald-700 rounded-lg hover:bg-emerald-50 flex items-center gap-2"
                  >
                    <Plus size={16} />
                    新增技能
                  </button>
                  <button
                    onClick={() => loadSkills(onlineOnly)}
                    disabled={skillsLoading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    <RefreshCw size={16} />
                    刷新技能
                  </button>
                </>
              )}
            </div>

            {canManageSkills && (
              <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              {skillsError && (
                <div className="px-4 py-3 text-sm text-red-600 border-b bg-red-50">
                  {skillsError}
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr className="text-slate-600">
                      <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">tool_code</th>
                      <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">tool_name</th>
                      <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">状态</th>
                      <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">版本</th>
                      <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">更新时间</th>
                      <th className="px-3 py-2 text-left font-semibold">描述</th>
                      <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {skillsLoading && (
                      <tr>
                        <td className="px-3 py-8 text-center text-slate-400" colSpan={7}>
                          <div className="inline-flex items-center gap-2">
                            <Loader2 className="animate-spin" size={16} />
                            加载中...
                          </div>
                        </td>
                      </tr>
                    )}
                    {!skillsLoading && skills.length === 0 && (
                      <tr>
                        <td className="px-3 py-8 text-center text-slate-400" colSpan={7}>
                          暂无技能
                        </td>
                      </tr>
                    )}
                    {!skillsLoading && skills.map((item) => {
                      const toolCode = item.tool_code || item.toolCode
                      const status = String(item.status || '').toUpperCase()
                      return (
                        <tr key={toolCode || item.id} className="border-b last:border-b-0 hover:bg-slate-50">
                          <td className="px-3 py-2 align-top font-mono text-xs text-slate-700">{toolCode || '-'}</td>
                          <td className="px-3 py-2 align-top text-slate-800">{item.tool_name || item.toolName || '-'}</td>
                          <td className="px-3 py-2 align-top">
                            <span className={cn('px-2 py-0.5 rounded text-xs font-medium', status === 'ONLINE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700')}>
                              {item.status || '-'}
                            </span>
                          </td>
                          <td className="px-3 py-2 align-top text-slate-700">{item.version ?? '-'}</td>
                          <td className="px-3 py-2 align-top text-slate-600 whitespace-nowrap">{formatTime(item.updated_at || item.updatedAt)}</td>
                          <td className="px-3 py-2 align-top text-slate-700 min-w-[320px]">{item.description || '-'}</td>
                          <td className="px-3 py-2 align-top">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleOpenUpdate(item)}
                                className="px-3 py-1.5 rounded border border-blue-300 text-blue-600 hover:bg-blue-50 text-xs"
                              >
                                修改
                              </button>
                              <button
                                onClick={() => handleOnline(toolCode)}
                                disabled={status === 'ONLINE' || !!actionPending[`online:${toolCode}`]}
                                className="px-3 py-1.5 rounded border border-emerald-300 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-not-allowed text-xs"
                              >
                                {actionPending[`online:${toolCode}`] ? '处理中...' : '上线'}
                              </button>
                              <button
                                onClick={() => handleOffline(toolCode)}
                                disabled={status !== 'ONLINE' || !!actionPending[`offline:${toolCode}`]}
                                className="px-3 py-1.5 rounded border border-amber-300 text-amber-600 hover:bg-amber-50 disabled:opacity-50 disabled:cursor-not-allowed text-xs"
                              >
                                {actionPending[`offline:${toolCode}`] ? '处理中...' : '下线'}
                              </button>
                              <button
                                onClick={() => handleDelete(toolCode)}
                                disabled={!!actionPending[`delete:${toolCode}`]}
                                className="px-3 py-1.5 rounded border border-rose-300 text-rose-600 hover:bg-rose-50 disabled:opacity-50 disabled:cursor-not-allowed text-xs"
                              >
                                {actionPending[`delete:${toolCode}`] ? '处理中...' : '删除'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              </div>
            )}

            <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">开始时间</label>
                <input
                  type="date"
                  value={auditFilters.startTime}
                  onChange={(e) => setAuditFilterField('startTime', e.target.value)}
                  className="w-40 px-3 py-2 border rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">结束时间</label>
                <input
                  type="date"
                  value={auditFilters.endTime}
                  onChange={(e) => setAuditFilterField('endTime', e.target.value)}
                  className="w-40 px-3 py-2 border rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">用户</label>
                <input
                  list="audit-username-options"
                  value={auditFilters.username}
                  onChange={(e) => setAuditFilterField('username', e.target.value)}
                  placeholder="用户名"
                  className="w-40 px-3 py-2 border rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <datalist id="audit-username-options">
                  {auditOptions.usernames.map(option => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">状态</label>
                <select
                  value={auditFilters.status}
                  onChange={(e) => setAuditFilterField('status', e.target.value)}
                  className="w-32 px-3 py-2 border rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">全部</option>
                  {auditOptions.statuses.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">tool_code</label>
                <input
                  list="audit-tool-code-options"
                  value={auditFilters.toolCode}
                  onChange={(e) => setAuditFilterField('toolCode', e.target.value)}
                  placeholder="技能编码"
                  className="w-40 px-3 py-2 border rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <datalist id="audit-tool-code-options">
                  {auditOptions.toolCodes.map(option => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              </div>
              <button
                onClick={handleAuditSearch}
                disabled={auditLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                <Search size={16} />
                查询
              </button>
              <button
                onClick={handleAuditReset}
                disabled={auditLoading}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 disabled:opacity-50 flex items-center gap-2"
              >
                <RefreshCw size={16} />
                重置
              </button>
            </div>

            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              {auditError && (
                <div className="px-4 py-3 text-sm text-red-600 border-b bg-red-50">
                  {auditError}
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr className="text-slate-600">
                      <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">时间</th>
                      <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">tool_code</th>
                      <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">状态</th>
                      <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">耗时(ms)</th>
                      <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">用户</th>
                      <th className="px-3 py-2 text-left font-semibold">错误</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLoading && (
                      <tr>
                        <td className="px-3 py-8 text-center text-slate-400" colSpan={6}>
                          <div className="inline-flex items-center gap-2">
                            <Loader2 className="animate-spin" size={16} />
                            加载中...
                          </div>
                        </td>
                      </tr>
                    )}
                    {!auditLoading && auditRows.length === 0 && (
                      <tr>
                        <td className="px-3 py-8 text-center text-slate-400" colSpan={6}>
                          暂无审计记录
                        </td>
                      </tr>
                    )}
                    {!auditLoading && auditRows.map((row) => {
                      const status = String(row.status || '').toUpperCase()
                      return (
                        <tr key={row.id || row.tool_call_id || row.toolCallId} className="border-b last:border-b-0 hover:bg-slate-50">
                          <td className="px-3 py-2 align-top whitespace-nowrap text-slate-600">{formatTime(row.created_at || row.createdAt)}</td>
                          <td className="px-3 py-2 align-top font-mono text-xs text-slate-700">{row.tool_code || row.toolCode || '-'}</td>
                          <td className="px-3 py-2 align-top">
                            <span className={cn('px-2 py-0.5 rounded text-xs font-medium', status === 'SUCCESS' ? 'bg-emerald-100 text-emerald-700' : status === 'FAILED' ? 'bg-rose-100 text-rose-700' : 'bg-indigo-100 text-indigo-700')}>
                              {row.status || '-'}
                            </span>
                          </td>
                          <td className="px-3 py-2 align-top text-slate-700">{row.latency_ms ?? row.latencyMs ?? '-'}</td>
                          <td className="px-3 py-2 align-top text-slate-700">{row.username || '-'}</td>
                          <td className="px-3 py-2 align-top text-slate-600 min-w-[260px] break-all">{row.error_message || row.errorMessage || '-'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 border-t bg-slate-50 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                <span>共 {auditTotal} 条</span>
                <span>第 {auditFilters.page} / {auditTotalPages} 页</span>
                <button
                  onClick={() => handleAuditPageChange(auditFilters.page - 1)}
                  disabled={auditLoading || auditFilters.page <= 1}
                  className="px-2 py-1 border rounded hover:bg-white disabled:opacity-50"
                >
                  上一页
                </button>
                <button
                  onClick={() => handleAuditPageChange(auditFilters.page + 1)}
                  disabled={auditLoading || auditFilters.page >= auditTotalPages}
                  className="px-2 py-1 border rounded hover:bg-white disabled:opacity-50"
                >
                  下一页
                </button>
                <select
                  value={String(auditFilters.page)}
                  onChange={(e) => handleAuditPageChange(Number(e.target.value))}
                  className="px-2 py-1 border rounded bg-white"
                >
                  {auditPageNumbers.map(pageNo => (
                    <option key={pageNo} value={pageNo}>{pageNo}</option>
                  ))}
                </select>
                <div className="ml-auto inline-flex items-center gap-2">
                  <span>每页</span>
                  <select
                    value={String(auditFilters.pageSize)}
                    onChange={(e) => {
                      const next = { ...auditFilters, pageSize: Number(e.target.value), page: 1 }
                      setAuditFilters(next)
                      loadAudit(next)
                    }}
                    className="px-2 py-1 border rounded bg-white"
                  >
                    <option value="20">20</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                  </select>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function SuperAdminOverview({ role }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [admins, setAdmins] = useState([])
  const [users, setUsers] = useState([])
  const [generatedAt, setGeneratedAt] = useState('')
  const [expandedDatasets, setExpandedDatasets] = useState({})
  const [expandedConversations, setExpandedConversations] = useState({})
  const [expandedConversationRecords, setExpandedConversationRecords] = useState({})

  const loadOverview = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchSuperAdminOverview()
      setAdmins(Array.isArray(data?.admins) ? data.admins : [])
      setUsers(Array.isArray(data?.users) ? data.users : [])
      setGeneratedAt(data?.generatedAt || '')
    } catch (e) {
      setError(e?.message || '加载失败')
      setAdmins([])
      setUsers([])
      setGeneratedAt('')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadOverview()
  }, [])

  const formatTime = (value) => {
    if (!value) return '-'
    const dt = new Date(value)
    if (Number.isNaN(dt.getTime())) return String(value)
    return dt.toLocaleString()
  }

  const toggleDataset = (adminKey, datasetId) => {
    const key = `${adminKey}-${datasetId}`
    setExpandedDatasets(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const toggleConversation = (adminKey, conversationId) => {
    const key = `${adminKey}-${conversationId}`
    setExpandedConversations(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const toggleConversationRecords = (adminKey, conversationId) => {
    const key = `${adminKey}-${conversationId}`
    setExpandedConversationRecords(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const isSuper = isSuperAdminRole(role)
  const pageTitle = isSuper ? '超级管理员总览' : '管理员总览'
  const pageDesc = isSuper
    ? '展示管理员与普通用户的知识库、授权时间、会话与对话记录明细'
    : '仅展示你管辖的普通用户知识库、授权时间、会话与对话记录明细'

  // 统一卡片渲染，避免管理员/普通用户两套重复 JSX。
  const renderItems = (items, defaultRole) => (
    items.map((subject) => {
      const subjectId = subject.userId || subject.adminUserId || subject.username || subject.adminUsername
      const subjectName = subject.username || subject.adminUsername || '-'
      const subjectRole = subject.role || defaultRole
      return (
        <div key={subjectId} className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b bg-slate-50">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Users size={18} className="text-indigo-600" />
                <div className="font-semibold text-slate-800">{subjectName}</div>
                <span className="text-xs px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">{subjectRole}</span>
              </div>
              <div className="text-xs text-slate-600">
                知识库 {subject.ownedDatasetCount || 0} · 授权记录 {subject.totalGrantedPermissionCount || 0} · 用户总览 {subject.userOverviewCount || 0} · 会话 {subject.conversationOverviewCount || 0} · 对话记录 {subject.conversationRecordCount || 0}
              </div>
            </div>
          </div>
          <div className="p-4 space-y-3">
            {(!Array.isArray(subject.ownedDatasets) || subject.ownedDatasets.length === 0) && (
              <div className="text-sm text-slate-400 px-1">该用户暂无登记的知识库。</div>
            )}
            {Array.isArray(subject.ownedDatasets) && subject.ownedDatasets.map((dataset) => (
              <div key={`${subjectId}-${dataset.datasetId}`} className="rounded-lg border border-slate-200">
                <div className="px-4 py-3 bg-slate-50 border-b flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-slate-800 font-medium">
                    <Database size={16} className="text-blue-600" />
                    <span>{dataset.datasetName || dataset.datasetId}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-slate-600">
                      文档数 {dataset.documentCount ?? 0}
                    </div>
                    <button
                      onClick={() => toggleDataset(subjectId, dataset.datasetId)}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      {expandedDatasets[`${subjectId}-${dataset.datasetId}`] ? '收起' : '展开'}
                    </button>
                  </div>
                </div>
                {expandedDatasets[`${subjectId}-${dataset.datasetId}`] && (
                  <div className="px-4 py-3 space-y-2">
                    <div className="text-xs text-slate-600">
                      知识库创建时间：{formatTime(dataset.datasetCreatedAt)}
                    </div>
                    <div className="text-xs text-slate-500">已授权用户</div>
                    {(!Array.isArray(dataset.grantedUsers) || dataset.grantedUsers.length === 0) ? (
                      <div className="text-sm text-slate-400">暂无授权用户</div>
                    ) : (
                      <div className="space-y-1">
                        {dataset.grantedUsers.map((u) => (
                          <div key={`${dataset.datasetId}-${u.userId}`} className="text-xs text-slate-700">
                            {u.username} ({u.role}) · 授权时间 {formatTime(u.authorizedAt)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div className="rounded-lg border border-slate-200">
              <div className="px-4 py-3 bg-slate-50 border-b text-sm font-medium text-slate-800">
                用户会话总览
              </div>
              <div className="px-4 py-3 space-y-2">
                {(!Array.isArray(subject.conversations) || subject.conversations.length === 0) ? (
                  <div className="text-sm text-slate-400">暂无会话记录</div>
                ) : (
                  subject.conversations.map((conversation) => {
                    const conversationKey = `${subjectId}-${conversation.conversationId}`
                    const expanded = !!expandedConversations[conversationKey]
                    const recordExpanded = !!expandedConversationRecords[conversationKey]
                    return (
                      <div key={conversationKey} className="rounded border border-slate-200">
                        <div className="px-3 py-2 flex items-center justify-between bg-white">
                          <div className="text-xs text-slate-800">
                            {conversation.title || conversation.conversationId} · 消息 {conversation.messageCount || 0}
                          </div>
                          <button
                            onClick={() => toggleConversation(subjectId, conversation.conversationId)}
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            {expanded ? '收起' : '展开'}
                          </button>
                        </div>
                        {expanded && (
                          <div className="px-3 py-2 border-t bg-slate-50 space-y-2">
                            <div className="text-xs text-slate-600">
                              创建时间：{formatTime(conversation.createdAt)} · 更新时间：{formatTime(conversation.updatedAt)}
                            </div>
                            <button
                              onClick={() => toggleConversationRecords(subjectId, conversation.conversationId)}
                              className="text-xs text-indigo-600 hover:text-indigo-800"
                            >
                              {recordExpanded ? '收起对话细节' : '展开对话细节'}
                            </button>
                            {recordExpanded && (
                              <div className="space-y-1">
                                {(!Array.isArray(conversation.records) || conversation.records.length === 0) ? (
                                  <div className="text-xs text-slate-400">暂无对话明细</div>
                                ) : (
                                  conversation.records.map((record) => (
                                    <div key={`${conversationKey}-${record.id}`} className="text-xs text-slate-700 bg-white border border-slate-200 rounded px-2 py-1.5">
                                      [{record.role}] {record.content} · {formatTime(record.recordTime)}
                                    </div>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )
    })
  )

  return (
    <div className="p-8 h-full overflow-y-auto">
      <div className="max-w-[1400px] mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">{pageTitle}</h2>
            <p className="text-sm text-slate-500 mt-1">
              {pageDesc}
            </p>
          </div>
          <button
            onClick={loadOverview}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            <RefreshCw size={16} />
            刷新
          </button>
        </div>

        <div className="bg-white rounded-xl border shadow-sm px-4 py-3 text-sm text-slate-600">
          最近生成时间：{formatTime(generatedAt)}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading && (
          <div className="bg-white rounded-xl border shadow-sm px-4 py-10 text-slate-500 flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin" />
            加载中...
          </div>
        )}

        {!loading && isSuper && (
          <div className="space-y-3">
            <div className="text-sm font-medium text-slate-700">管理员总览</div>
            {admins.length === 0 ? (
              <div className="bg-white rounded-xl border shadow-sm px-4 py-10 text-center text-slate-400">暂无管理员资产数据</div>
            ) : renderItems(admins, 'admin')}
          </div>
        )}
        {!loading && (
          <div className="space-y-3">
            <div className="text-sm font-medium text-slate-700">{isSuper ? '普通用户总览' : '我的管辖普通用户总览'}</div>
            {users.length === 0 ? (
              <div className="bg-white rounded-xl border shadow-sm px-4 py-10 text-center text-slate-400">
                {isSuper ? '暂无普通用户资产数据' : '暂无你管辖的普通用户数据'}
              </div>
            ) : renderItems(users, 'user')}
          </div>
        )}
      </div>
    </div>
  )
}

function SourceViewer({ reference, onClose }) {
  const [activeTab, setActiveTab] = useState('summary') // 'summary' | 'pdf'
  const [numPages, setNumPages] = useState(null)
  const [scale, setScale] = useState(1.0)
  const [imageError, setImageError] = useState(false)
  const [pdfUrl, setPdfUrl] = useState('')
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfLoadError, setPdfLoadError] = useState('')
  const pdfUrlRef = useRef('')

  useEffect(() => {
    setActiveTab('summary')
    setImageError(false)
    setScale(1.0)
    setNumPages(null)
    setPdfLoadError('')
    if (pdfUrlRef.current) {
      URL.revokeObjectURL(pdfUrlRef.current)
      pdfUrlRef.current = ''
    }
    setPdfUrl('')
  }, [reference])

  useEffect(() => {
    if (activeTab !== 'pdf' || !reference?.document_id) {
      return
    }
    let disposed = false
    let nextPdfUrl = ''
    setPdfLoading(true)
    setPdfLoadError('')
    ;(async () => {
      try {
        const res = await apiFetch(`/document/get/${encodeURIComponent(reference.document_id)}`)
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }
        const blob = await res.blob()
        if (!blob || blob.size === 0) {
          throw new Error('EMPTY_BLOB')
        }
        nextPdfUrl = URL.createObjectURL(blob)
        if (disposed) {
          URL.revokeObjectURL(nextPdfUrl)
          return
        }
        if (pdfUrlRef.current) {
          URL.revokeObjectURL(pdfUrlRef.current)
        }
        pdfUrlRef.current = nextPdfUrl
        setPdfUrl(nextPdfUrl)
      } catch {
        if (!disposed) {
          setPdfLoadError('Failed to load PDF. Please check permissions.')
          if (pdfUrlRef.current) {
            URL.revokeObjectURL(pdfUrlRef.current)
            pdfUrlRef.current = ''
          }
          setPdfUrl('')
        }
      } finally {
        if (!disposed) {
          setPdfLoading(false)
        }
      }
    })()
    return () => {
      disposed = true
      if (nextPdfUrl) {
        URL.revokeObjectURL(nextPdfUrl)
      }
    }
  }, [activeTab, reference?.document_id])

  useEffect(() => {
    if (activeTab === 'pdf' && numPages && reference?.positions?.[0]) {
        // Delay slightly to allow rendering
        setTimeout(() => {
            const pageNum = reference.positions[0][0];
            const pageElement = document.getElementById(`pdf-page-${pageNum}`);
            if (pageElement) {
                pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 100);
    }
  }, [activeTab, numPages, reference])

  if (!reference) return null

  const imageId = reference.image_id || reference.img_id
  const hasImage = !!imageId
  const hasPdf = !!reference.document_id

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages)
  }

  return (
    <div 
      className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-3 border-b flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-4 overflow-hidden">
            <h3 className="font-semibold text-slate-800 flex items-center gap-2 text-sm truncate pr-4 max-w-[300px]">
              <FileText size={18} className="text-blue-600 flex-shrink-0" />
              <span className="truncate" title={reference.document_name}>{reference.document_name}</span>
            </h3>
            
            <div className="flex bg-slate-200 p-1 rounded-lg shrink-0">
              <button
                onClick={() => setActiveTab('summary')}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-medium transition-all",
                  activeTab === 'summary' ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700"
                )}
              >
                Summary
              </button>
              {hasPdf && (
                <button
                  onClick={() => setActiveTab('pdf')}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-medium transition-all",
                    activeTab === 'pdf' ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  Full PDF
                </button>
              )}
            </div>
          </div>

          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-slate-200 rounded-full text-slate-500 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden relative bg-slate-100/50">
          {activeTab === 'summary' && (
            <div className="h-full overflow-y-auto p-6">
              <div className="max-w-3xl mx-auto space-y-6">
                {/* Meta Info */}
                <div className="flex items-center gap-4 text-xs text-slate-500 uppercase tracking-wider font-semibold">
                  <span>Matched Content</span>
                  {reference.similarity && (
                    <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                      Score: {(reference.similarity * 100).toFixed(1)}%
                    </span>
                  )}
                </div>

                {/* Text Content */}
                <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm text-slate-700 whitespace-pre-wrap leading-relaxed text-sm font-mono">
                  {reference.content_with_weight ? (
                     <div dangerouslySetInnerHTML={{ __html: reference.content_with_weight }} />
                  ) : (
                     reference.content || "No content preview available."
                  )}
                </div>

                {/* Image Preview */}
                {hasImage && !imageError && (
                  <div className="space-y-2">
                    <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold flex items-center gap-2">
                      <ImageIcon size={14} />
                      <span>Page Snapshot</span>
                    </div>
                    <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-white group relative">
                      <img 
                        src={`/api/document/image/${imageId}`}
                        alt="Document Snapshot"
                        className="w-full h-auto object-contain max-h-[500px]"
                        onError={() => setImageError(true)}
                      />
                      {hasPdf && (
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                           <button 
                             onClick={() => setActiveTab('pdf')}
                             className="px-4 py-2 bg-white text-slate-900 rounded-lg shadow-lg font-medium text-sm transform translate-y-2 group-hover:translate-y-0 transition-all"
                           >
                             View in PDF
                           </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'pdf' && (
            <div className="h-full flex flex-col">
               {/* PDF Toolbar */}
               <div className="p-2 border-b bg-white flex items-center justify-between shrink-0 z-10 shadow-sm">
                 <div className="flex items-center gap-2">
                   <span className="text-xs font-mono text-slate-500 px-2">
                     Total {numPages || '--'} Pages
                   </span>
                 </div>
                 <div className="flex items-center gap-2">
                    <button onClick={() => setScale(s => Math.max(0.5, s - 0.1))} className="p-1.5 hover:bg-slate-100 rounded"><ZoomOut size={16} /></button>
                    <span className="text-xs font-mono w-12 text-center select-none">{(scale * 100).toFixed(0)}%</span>
                    <button onClick={() => setScale(s => Math.min(2.0, s + 0.1))} className="p-1.5 hover:bg-slate-100 rounded"><ZoomIn size={16} /></button>
                 </div>
               </div>
               
               {/* PDF View */}
               <div className="flex-1 overflow-auto bg-slate-500/10 flex justify-center p-8">
                 <Document
                   file={pdfUrl || undefined}
                   onLoadSuccess={onDocumentLoadSuccess}
                   className="shadow-xl flex flex-col gap-4"
                   loading={<div className="flex items-center gap-2 text-slate-500"><Loader2 className="animate-spin" /> Loading PDF...</div>}
                   error={<div className="text-red-500 text-sm p-4 bg-red-50 rounded">{pdfLoadError || 'Failed to load PDF. Please check permissions.'}</div>}
                 >
                   {numPages && Array.from(new Array(numPages), (el, index) => {
                        const pageNum = index + 1;
                        return (
                            <div key={`page_${pageNum}`} id={`pdf-page-${pageNum}`} className="relative">
                                <Page 
                                    pageNumber={pageNum} 
                                    scale={scale}
                                    renderTextLayer={false}
                                    renderAnnotationLayer={false}
                                    className="shadow-md"
                                >
                                    {/* Highlight Overlay */}
                                    {reference.positions && reference.positions
                                        .filter((pos) => pos[0] === pageNum)
                                        .map((pos, idx) => {
                                        const [p, x_min, x_max, y_min, y_max] = pos;
                                        return (
                                            <div
                                                key={`${pageNum}-${idx}`}
                                                style={{
                                                    position: 'absolute',
                                                    left: x_min * scale,
                                                    top: y_min * scale,
                                                    width: (x_max - x_min) * scale,
                                                    height: (y_max - y_min) * scale,
                                                    backgroundColor: 'rgba(255, 255, 0, 0.2)',
                                                    border: '1px solid rgba(255, 200, 0, 0.4)',
                                                    pointerEvents: 'none'
                                                }}
                                            />
                                        )
                                    })}
                                </Page>
                            </div>
                        );
                   })}
                 </Document>
                 {pdfLoading && (
                   <div className="absolute top-4 right-4 px-3 py-1.5 rounded bg-white text-xs text-slate-500 border border-slate-200 shadow-sm">
                     PDF 加载中...
                   </div>
                 )}
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MarkdownWithCitations({ content, references, onViewReference }) {
  if (!content) return null;

  const formattedContent = content
    // [ID:0] / [0] (0-based legacy)
    .replace(/\[(?:ID:\s*)?(\d+)\]/gi, (match, id) => ` [${parseInt(id, 10) + 1}](#citation-${id})`)
    // [引用来源1] / [引用来源 1] / [来源1] / [来源 1] (1-based common output)
    .replace(/\[(?:引用来源|来源)\s*(\d+)\]/gi, (match, id) => {
      const oneBased = Number.parseInt(id, 10)
      if (!Number.isFinite(oneBased) || oneBased <= 0) return match
      const zeroBased = oneBased - 1
      return ` [${oneBased}](#citation-${zeroBased})`
    });

  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        pre: ({_node, ...props}) => <div className="overflow-auto w-full my-2 bg-slate-800 text-slate-100 p-2 rounded" {...props} />,
        code: ({_node, ...props}) => <code className="bg-slate-100 text-slate-800 px-1 py-0.5 rounded text-xs" {...props} />,
        table: ({_node, ...props}) => (
          <div className="overflow-x-auto my-4">
            <table className="min-w-full border-collapse border border-slate-300 text-sm" {...props} />
          </div>
        ),
        thead: ({_node, ...props}) => <thead className="bg-slate-100" {...props} />,
        th: ({_node, ...props}) => <th className="border border-slate-300 px-3 py-2 text-left font-semibold" {...props} />,
        td: ({_node, ...props}) => <td className="border border-slate-300 px-3 py-2" {...props} />,
        a: ({_node, href, children, ...props}) => {
          if (href?.startsWith('#citation-')) {
            const index = parseInt(href.replace('#citation-', ''));
            const ref = references?.[index];
            if (ref) {
              return (
                <button 
                  onClick={(e) => { e.preventDefault(); onViewReference(ref); }}
                  className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 ml-0.5 text-[10px] font-bold text-blue-600 bg-blue-50 rounded-full border border-blue-200 hover:bg-blue-100 align-top transition-colors transform -translate-y-0.5 cursor-pointer select-none"
                  title={ref.document_name}
                >
                  {index + 1}
                </button>
              );
            }
            return <span className="text-gray-400 text-[10px] ml-0.5">[{index + 1}]</span>;
          }
          return <a href={href} className="text-blue-600 hover:underline" {...props}>{children}</a>
        }
      }}
    >
      {formattedContent}
    </Markdown>
  );
}

function ThoughtBlock({ content, references, onViewReference, isStreaming }) {
  const [expanded, setExpanded] = useState(true);

  // Auto-collapse when streaming finishes, expand when streaming starts
  useEffect(() => {
    if (isStreaming) {
      setExpanded(true)
    } else {
      setExpanded(false)
    }
  }, [isStreaming])
  
  return (
    <div className="mb-4 rounded-lg overflow-hidden border border-amber-200 bg-amber-50">
        <button 
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center gap-2 px-3 py-2 bg-amber-100/50 hover:bg-amber-100 transition-colors text-xs font-semibold text-amber-700 uppercase tracking-wide select-none"
        >
            <Brain size={14} className="text-amber-600" />
            <span>深度思考过程 (Deep Thinking)</span>
            <span className="ml-auto text-amber-500 text-[10px]">
                {expanded ? '收起' : '展开'}
            </span>
        </button>
        
        {expanded && (
            <div className="p-3 text-sm text-slate-600 italic leading-relaxed border-t border-amber-100 bg-white/50">
                <MarkdownWithCitations 
                    content={content} 
                    references={references} 
                    onViewReference={onViewReference} 
                />
            </div>
        )}
    </div>
  )
}

function ChatInterface() {
  const createDefaultAssistantMessage = useCallback(() => ({
    role: 'assistant',
    content: '你好！我是 AI 助手，请问有什么可以帮你？'
  }), [])
  const [messages, setMessages] = useState(() => [
    createDefaultAssistantMessage()
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [conversationLoading, setConversationLoading] = useState(false)
  const [conversationError, setConversationError] = useState('')
  const [conversations, setConversations] = useState([])
  const [conversationPage, setConversationPage] = useState(1)
  const [conversationHasMore, setConversationHasMore] = useState(false)
  const [conversationRetentionDays, setConversationRetentionDays] = useState(90)
  const [conversationListLoadingMore, setConversationListLoadingMore] = useState(false)
  const [messageHasMore, setMessageHasMore] = useState(false)
  const [messageBeforeId, setMessageBeforeId] = useState(null)
  const [messageLoadingMore, setMessageLoadingMore] = useState(false)
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)
  const [activeConversationTitle, setActiveConversationTitle] = useState('')
  const [renamingConversationId, setRenamingConversationId] = useState('')
  const [renamingTitle, setRenamingTitle] = useState('')
  const [conversationActionLoading, setConversationActionLoading] = useState(false)
  const [viewingRef, setViewingRef] = useState(null)
  const [toolForms, setToolForms] = useState({})
  const [toolPending, setToolPending] = useState({})
  const [toolResults, setToolResults] = useState({})
  const [toolCatalog, setToolCatalog] = useState([])
  const [toolCatalogLoading, setToolCatalogLoading] = useState(false)
  const [toolCatalogError, setToolCatalogError] = useState('')
  const [manualDraftPending, setManualDraftPending] = useState('')
  const [planDrafts, setPlanDrafts] = useState({})
  const [planUiStates, setPlanUiStates] = useState({})
  const [selectedMemoryProfileId, setSelectedMemoryProfileId] = useState('')
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [uploadProgress, setUploadProgress] = useState({})
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const abortControllerRef = useRef(null)
  const currentRequestIdRef = useRef(0)
  // 上滑加载历史消息时关闭自动滚动到底部，避免视图被强制跳回最新消息。
  const suppressAutoScrollRef = useRef(false)
  const conversationIdRef = useRef('')
  const conversationListRef = useRef(null)
  const messagesContainerRef = useRef(null)
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionStart, setMentionStart] = useState(-1)
  const [mentionEnd, setMentionEnd] = useState(-1)
  const [mentionIndex, setMentionIndex] = useState(0)
  const quickRouteExamples = [
    '什么是指标校核',
    '请使用指标校核',
    '请帮我指标校核',
    '什么是大模型',
    '如何进行半面积计算'
  ]

  useEffect(() => {
    if (suppressAutoScrollRef.current) {
      suppressAutoScrollRef.current = false
      return
    }
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    setShowScrollToBottom(false)
  }, [messages])

  const updateScrollToBottomVisibility = useCallback((node) => {
    if (!node) {
      setShowScrollToBottom(false)
      return
    }
    const distanceToBottom = node.scrollHeight - node.scrollTop - node.clientHeight
    setShowScrollToBottom(distanceToBottom > 140)
  }, [])

  const handleScrollToBottom = useCallback(() => {
    const node = messagesContainerRef.current
    if (!node) return
    node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' })
    setShowScrollToBottom(false)
  }, [])

  const normalizeConversationTitle = useCallback((item) => {
    return item?.name || item?.title || item?.conversationTitle || item?.conversation_id || '未命名会话'
  }, [])

  const normalizeConversationId = useCallback((item) => {
    return item?.conversationId || item?.conversation_id || item?.id || ''
  }, [])

  const normalizeMessageRole = useCallback((item) => {
    const rawRole = String(item?.role || item?.message_role || item?.sender || '').toLowerCase()
    if (rawRole === 'user') return 'user'
    if (rawRole === 'assistant') return 'assistant'
    return 'assistant'
  }, [])

  const normalizeMessageContent = useCallback((item) => {
    return item?.content || item?.message || item?.text || ''
  }, [])

  const normalizeStoredMessagePayload = useCallback((item) => {
    const rawPayload = item?.messagePayload ?? item?.message_payload ?? ''
    if (!rawPayload) return {}
    if (typeof rawPayload === 'object') return rawPayload
    if (typeof rawPayload !== 'string') return {}
    try {
      return JSON.parse(rawPayload)
    } catch {
      return {}
    }
  }, [])

  const normalizeMessageFromHistory = useCallback((item) => {
    const payload = normalizeStoredMessagePayload(item)
    const fallbackContent = typeof payload?.content === 'string' ? payload.content : ''
    const refs = Array.isArray(payload?.references)
      ? payload.references
      : (Array.isArray(item?.references) ? item.references : [])
    const sourceTag = typeof payload?.sourceTag === 'string'
      ? payload.sourceTag
      : (typeof item?.sourceTag === 'string' ? item.sourceTag : '')
    const logicFlow = typeof payload?.logicFlow === 'string'
      ? payload.logicFlow
      : (typeof item?.logicFlow === 'string' ? item.logicFlow : '')
    const skillHint = typeof payload?.skillHint === 'string'
      ? payload.skillHint
      : (typeof item?.skillHint === 'string' ? item.skillHint : '')
    const analysisPlan = payload?.analysisPlan && typeof payload.analysisPlan === 'object'
      ? payload.analysisPlan
      : (item?.analysisPlan && typeof item.analysisPlan === 'object' ? item.analysisPlan : null)
    const analysisSteps = Array.isArray(payload?.analysisSteps)
      ? payload.analysisSteps
      : (Array.isArray(item?.analysisSteps) ? item.analysisSteps : [])
    const analysisSummary = payload?.analysisSummary && typeof payload.analysisSummary === 'object'
      ? payload.analysisSummary
      : (item?.analysisSummary && typeof item.analysisSummary === 'object' ? item.analysisSummary : null)
    const toolDraft = payload?.toolDraft && typeof payload.toolDraft === 'object'
      ? payload.toolDraft
      : (item?.toolDraft && typeof item.toolDraft === 'object' ? item.toolDraft : null)
    const clarify = payload?.clarify && typeof payload.clarify === 'object'
      ? payload.clarify
      : (item?.clarify && typeof item.clarify === 'object' ? item.clarify : null)
    const messageId = item?.id ?? item?.messageId ?? item?.message_id ?? item?.recordId ?? item?.record_id ?? null
    return {
      id: messageId,
      role: normalizeMessageRole(item),
      content: normalizeMessageContent(item) || fallbackContent,
      references: refs,
      sourceTag,
      logicFlow,
      skillHint,
      analysisPlan,
      analysisSteps,
      analysisSummary,
      toolDraft,
      clarify
    }
  }, [normalizeMessageContent, normalizeMessageRole, normalizeStoredMessagePayload])

  const buildMessagePayloadForSave = (msg) => {
    if (!msg || typeof msg !== 'object') return ''
    const payload = {
      content: String(msg.content || ''),
      references: Array.isArray(msg.references) ? msg.references : [],
      sourceTag: String(msg.sourceTag || ''),
      logicFlow: String(msg.logicFlow || ''),
      skillHint: String(msg.skillHint || ''),
      analysisPlan: msg.analysisPlan && typeof msg.analysisPlan === 'object' ? msg.analysisPlan : null,
      analysisSteps: Array.isArray(msg.analysisSteps) ? msg.analysisSteps : [],
      analysisSummary: msg.analysisSummary && typeof msg.analysisSummary === 'object' ? msg.analysisSummary : null,
      toolDraft: msg.toolDraft && typeof msg.toolDraft === 'object' ? msg.toolDraft : null,
      clarify: msg.clarify && typeof msg.clarify === 'object' ? msg.clarify : null
    }
    const hasExtra = payload.references.length > 0
      || payload.sourceTag
      || payload.logicFlow
      || payload.skillHint
      || payload.analysisPlan
      || payload.analysisSteps.length > 0
      || payload.analysisSummary
      || payload.toolDraft
      || payload.clarify
    if (!hasExtra) return ''
    return JSON.stringify(payload)
  }

  const buildMessagesAndDraftsFromHistory = useCallback((history, conversationId) => {
    const mappedMessages = (Array.isArray(history) ? history : [])
      .map(item => normalizeMessageFromHistory(item))
      .filter(item => item.content)
    const recoveredPlanDrafts = {}
    mappedMessages.forEach((msg, index) => {
      if (!msg.analysisPlan || typeof msg.analysisPlan !== 'object') return
      const messageId = msg.id ?? `${conversationId}-history-${index}`
      msg.id = messageId
      const steps = Array.isArray(msg.analysisPlan.steps) ? msg.analysisPlan.steps.map(normalizePlanStep) : []
      const historyAnalysisSteps = Array.isArray(msg.analysisSteps) ? msg.analysisSteps : []
      recoveredPlanDrafts[messageId] = {
        planId: msg.analysisPlan.planId || msg.analysisPlan.plan_id || '',
        version: msg.analysisPlan.version || 1,
        query: msg.analysisPlan.query || '',
        deepThinking: msg.analysisPlan.deepThinking || msg.analysisPlan.deep_thinking || '',
        questionType: msg.analysisPlan.questionType || msg.analysisPlan.question_type || '',
        summary: msg.analysisPlan.summary || '',
        rerunMode: msg.analysisPlan.rerunMode || msg.analysisPlan.rerun_mode || 'AUTO',
        restartFromStep: Number(msg.analysisPlan.restartFromStep || msg.analysisPlan.restart_from_step || 1),
        adjustmentInstruction: msg.analysisPlan.adjustmentInstruction || '',
        editedSteps: steps,
        analysisSteps: historyAnalysisSteps,
        analysisSummary: msg.analysisSummary || null
      }
    })
    return { mappedMessages, recoveredPlanDrafts }
  }, [normalizeMessageFromHistory])

  const loadConversationMessages = useCallback(async (targetConversationId, beforeId = null) => {
    if (!targetConversationId) {
      return { items: [], hasMore: false, nextBeforeId: null }
    }
    return fetchConversationMessages(targetConversationId, { beforeId, limit: 50 })
  }, [])

  const loadConversationListAndMessages = useCallback(async (preferConversationId = '') => {
    setConversationLoading(true)
    setConversationError('')
    try {
      let result = await fetchConversations({ page: 1, pageSize: 50 })
      if (!Array.isArray(result.items) || result.items.length === 0) {
        const created = await createConversation('新对话')
        if (created) {
          result = await fetchConversations({ page: 1, pageSize: 50 })
        }
      }
      const normalizedList = (Array.isArray(result.items) ? result.items : [])
        .map(item => ({
          id: normalizeConversationId(item),
          title: normalizeConversationTitle(item),
          createTime: item?.createTime || item?.create_time || '',
          remainingDays: Number(item?.remainingDays ?? item?.remaining_days ?? 0)
        }))
        .filter(item => item.id)
      setConversations(normalizedList)
      setConversationPage(1)
      setConversationHasMore(Boolean(result?.hasMore))
      setConversationRetentionDays(Number(result?.retentionDays || 90))
      const preferred = normalizedList.find(item => item.id === preferConversationId)
      const current = preferred || normalizedList[0]
      if (!current) {
        conversationIdRef.current = ''
        setActiveConversationTitle('')
        setMessages([createDefaultAssistantMessage()])
        setMessageHasMore(false)
        setMessageBeforeId(null)
        return
      }
      conversationIdRef.current = current.id
      setActiveConversationTitle(current.title || '')
      const historyPage = await loadConversationMessages(current.id, null)
      const { mappedMessages, recoveredPlanDrafts } = buildMessagesAndDraftsFromHistory(historyPage?.items || [], current.id)
      setPlanDrafts(recoveredPlanDrafts)
      setPlanUiStates({})
      setMessages(mappedMessages.length > 0 ? mappedMessages : [createDefaultAssistantMessage()])
      setMessageHasMore(Boolean(historyPage?.hasMore))
      setMessageBeforeId(historyPage?.nextBeforeId ?? null)
    } catch (err) {
      setConversationError(err?.message || '会话加载失败')
      setMessages([createDefaultAssistantMessage()])
      setMessageHasMore(false)
      setMessageBeforeId(null)
    } finally {
      setConversationLoading(false)
    }
  }, [buildMessagesAndDraftsFromHistory, createDefaultAssistantMessage, loadConversationMessages, normalizeConversationId, normalizeConversationTitle])

  useEffect(() => {
    loadConversationListAndMessages()
  }, [loadConversationListAndMessages])

  const loadMoreConversations = useCallback(async () => {
    if (conversationListLoadingMore || !conversationHasMore) return
    setConversationListLoadingMore(true)
    try {
      const nextPage = conversationPage + 1
      const result = await fetchConversations({ page: nextPage, pageSize: 50 })
      const normalized = (Array.isArray(result.items) ? result.items : [])
        .map(item => ({
          id: normalizeConversationId(item),
          title: normalizeConversationTitle(item),
          createTime: item?.createTime || item?.create_time || '',
          remainingDays: Number(item?.remainingDays ?? item?.remaining_days ?? 0)
        }))
        .filter(item => item.id)
      if (normalized.length > 0) {
        setConversations(prev => {
          const idSet = new Set(prev.map(item => item.id))
          const merged = [...prev]
          normalized.forEach(item => {
            if (idSet.has(item.id)) return
            merged.push(item)
          })
          return merged
        })
      }
      setConversationPage(nextPage)
      setConversationHasMore(Boolean(result?.hasMore))
    } catch (err) {
      setConversationError(err?.message || '加载更多会话失败')
    } finally {
      setConversationListLoadingMore(false)
    }
  }, [conversationHasMore, conversationListLoadingMore, conversationPage, normalizeConversationId, normalizeConversationTitle])

  const loadMoreMessages = useCallback(async () => {
    const activeId = conversationIdRef.current
    if (!activeId || messageLoadingMore || !messageHasMore || !messageBeforeId) return
    const container = messagesContainerRef.current
    const previousHeight = container?.scrollHeight || 0
    setMessageLoadingMore(true)
    try {
      const historyPage = await loadConversationMessages(activeId, messageBeforeId)
      const { mappedMessages, recoveredPlanDrafts } = buildMessagesAndDraftsFromHistory(historyPage?.items || [], activeId)
      if (mappedMessages.length > 0) {
        suppressAutoScrollRef.current = true
        setMessages(prev => [...mappedMessages, ...prev])
      }
      if (Object.keys(recoveredPlanDrafts).length > 0) {
        setPlanDrafts(prev => ({ ...recoveredPlanDrafts, ...prev }))
      }
      setMessageHasMore(Boolean(historyPage?.hasMore))
      setMessageBeforeId(historyPage?.nextBeforeId ?? null)
      requestAnimationFrame(() => {
        const node = messagesContainerRef.current
        if (!node) return
        const nextHeight = node.scrollHeight
        node.scrollTop = nextHeight - previousHeight + node.scrollTop
        updateScrollToBottomVisibility(node)
      })
    } catch (err) {
      setConversationError(err?.message || '加载更多消息失败')
    } finally {
      setMessageLoadingMore(false)
    }
  }, [buildMessagesAndDraftsFromHistory, loadConversationMessages, messageBeforeId, messageHasMore, messageLoadingMore, updateScrollToBottomVisibility])

  const handleConversationListScroll = useCallback((event) => {
    const target = event?.currentTarget
    if (!target || !conversationHasMore || conversationListLoadingMore) return
    const nearTop = target.scrollTop <= 24
    if (nearTop) {
      loadMoreConversations()
    }
  }, [conversationHasMore, conversationListLoadingMore, loadMoreConversations])

  const handleMessagesScroll = useCallback((event) => {
    const target = event?.currentTarget
    if (!target) return
    updateScrollToBottomVisibility(target)
    if (!messageHasMore || messageLoadingMore) return
    if (target.scrollTop <= 48) {
      loadMoreMessages()
    }
  }, [loadMoreMessages, messageHasMore, messageLoadingMore, updateScrollToBottomVisibility])

  const loadToolCatalog = useCallback(async () => {
    setToolCatalogLoading(true)
    setToolCatalogError('')
    try {
      const list = await fetchToolCatalog()
      setToolCatalog(list)
    } catch (err) {
      setToolCatalog([])
      setToolCatalogError(err?.message || '加载技能目录失败')
    } finally {
      setToolCatalogLoading(false)
    }
  }, [])

  useEffect(() => {
    loadToolCatalog()
  }, [loadToolCatalog])

  const getToolDisplayLabel = (tool) => String(tool?.tool_name || tool?.toolName || tool?.displayName || tool?.name || '').trim()
  const normalizeToolToken = (text) => String(text || '').trim().toLowerCase()

  // 解析输入框中的 @mention 上下文，仅用于辅助输入，不会强制触发技能调用。
  const resolveMentionContext = (text, caretPosition) => {
    const safeText = String(text || '')
    const safeCaret = Number.isFinite(caretPosition) ? caretPosition : safeText.length
    const head = safeText.slice(0, safeCaret)
    // 支持在任意位置输入 @（句首/句中/句尾），只要光标前最后一段是未闭合的 @token 即触发候选。
    const match = head.match(/@([^\s@]*)$/)
    if (!match) return null
    const atIndex = head.lastIndexOf('@')
    if (atIndex < 0) return null
    const query = match[1] || ''
    return {
      start: atIndex,
      end: safeCaret,
      query: query.trim()
    }
  }

  const getMentionCandidates = () => {
    if (!mentionOpen) return []
    const keyword = String(mentionQuery || '').toLowerCase()
    const scored = toolCatalog
      .map((tool) => {
        const name = String(tool?.name || '')
        const displayName = String(tool?.displayName || '')
        const toolName = String(tool?.tool_name || tool?.toolName || '')
        const desc = String(tool?.description || '')
        const corpus = `${name} ${displayName} ${toolName} ${desc}`.toLowerCase()
        if (!keyword) return { tool, score: 1 }
        if (name.toLowerCase().startsWith(keyword) || displayName.toLowerCase().startsWith(keyword) || toolName.toLowerCase().startsWith(keyword)) return { tool, score: 3 }
        if (corpus.includes(keyword)) return { tool, score: 2 }
        return null
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
    return scored.map(item => item.tool)
  }

  const mentionCandidates = getMentionCandidates()

  const closeMention = () => {
    setMentionOpen(false)
    setMentionQuery('')
    setMentionStart(-1)
    setMentionEnd(-1)
    setMentionIndex(0)
  }

  const applyMentionTool = (tool) => {
    if (!tool || mentionStart < 0 || mentionEnd < mentionStart) return
    const mentionText = `@${getToolDisplayLabel(tool) || tool.name}`
    const nextInput = `${input.slice(0, mentionStart)}${mentionText} ${input.slice(mentionEnd)}`
    setInput(nextInput)
    closeMention()
    requestAnimationFrame(() => {
      const cursorPos = mentionStart + mentionText.length + 1
      if (inputRef.current) {
        inputRef.current.focus()
        inputRef.current.selectionStart = cursorPos
        inputRef.current.selectionEnd = cursorPos
      }
    })
  }

  // 仅当输入整体是“@技能名”时，触发直连技能调用；句中 @ 仍走语义判断。
  const resolveStandaloneMentionTool = (text) => {
    const raw = String(text || '').trim()
    const match = raw.match(/^@\s*(.+?)\s*$/)
    if (!match) return null
    const mentionText = String(match[1] || '').trim()
    if (!mentionText) return null
    const target = normalizeToolToken(mentionText)
    const exact = toolCatalog.find((tool) => {
      const candidates = [
        tool?.tool_name,
        tool?.toolName,
        tool?.displayName,
        tool?.name,
        tool?.tool_code,
        tool?.toolCode
      ]
      return candidates
        .map(item => normalizeToolToken(item))
        .filter(Boolean)
        .includes(target)
    })
    return exact || null
  }

  const parseJsonSafe = (text, fallback = null) => {
    try {
      return JSON.parse(text)
    } catch {
      return fallback
    }
  }

  const normalizeRefs = (payload) => {
    const rawRefs =
      payload?.reference
      || payload?.data?.reference
      || payload?.references
      || payload?.data?.references
      || payload?.raw?.reference
      || payload?.raw?.data?.reference
      || payload?.raw?.references
      || payload?.raw?.data?.references
      || payload?.raw?.choices?.[0]?.message?.reference
      || payload?.raw?.data?.choices?.[0]?.message?.reference
    if (Array.isArray(rawRefs)) return rawRefs
    if (rawRefs && Array.isArray(rawRefs.chunks)) return rawRefs.chunks
    return []
  }

  const buildReferenceOnlyNotice = (refs) => {
    if (!Array.isArray(refs) || refs.length === 0) return ''
    const docNames = Array.from(new Set(
      refs
        .map((ref, idx) => ref?.document_name || ref?.doc_name || `文档${idx + 1}`)
        .filter(Boolean)
    )).slice(0, 3)
    if (docNames.length === 0) {
      return '已检索到相关资料，请查看下方引用原文。'
    }
    return `已检索到相关资料（${docNames.join('、')}），请查看下方引用原文。`
  }

  const normalizeClarifySuggestions = (payload) => {
    if (!payload || !Array.isArray(payload.suggestions)) return []
    return payload.suggestions
      .map(item => typeof item === 'string' ? item.trim() : '')
      .filter(Boolean)
      .slice(0, 3)
  }

  const normalizeLogicFlow = (payload) => {
    const flow = payload?.logicFlow || payload?.data?.logicFlow || ''
    return typeof flow === 'string' ? flow.trim() : ''
  }

  const consumeSse = async (response, onEvent) => {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let currentEvent = 'message'
    let dataLines = []
    const flushEvent = async () => {
      if (dataLines.length === 0) {
        currentEvent = 'message'
        return
      }
      const data = dataLines.join('\n')
      dataLines = []
      await onEvent(currentEvent || 'message', data)
      currentEvent = 'message'
    }
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const rawLine of lines) {
        const line = rawLine.trimEnd()
        if (!line) {
          await flushEvent()
          continue
        }
        if (line.startsWith('event:')) {
          await flushEvent()
          currentEvent = line.slice(6).trim()
          continue
        }
        if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).replace(/^\s/, ''))
        }
      }
    }
    if (buffer.trim()) {
      if (buffer.trimStart().startsWith('data:')) {
        dataLines.push(buffer.trimStart().slice(5).replace(/^\s/, ''))
      }
    }
    await flushEvent()
  }

  const updateStreamingMessage = (messageId, updater) => {
    setMessages(prev => prev.map(msg => {
      if (msg.id !== messageId) return msg
      return { ...msg, ...updater(msg) }
    }))
  }

  const normalizePlanStep = (step, index) => {
    const stepNo = Number(step?.stepNo ?? step?.step_no ?? index + 1)
    const route = String(step?.route || '').trim().toUpperCase()
    const label = String(step?.label || '').trim() || `步骤${stepNo}`
    return {
      stepNo,
      route,
      label,
      goal: String(step?.goal || '').trim(),
      query: String(step?.query || '').trim(),
      toolName: String(step?.toolName || step?.tool_name || '').trim(),
      continueWhen: String(step?.continueWhen || step?.continue_when || '').trim(),
      stopWhen: String(step?.stopWhen || step?.stop_when || '').trim()
    }
  }

  const reindexPlanSteps = (steps) => {
    return (steps || []).map((step, index) => ({
      ...step,
      stepNo: index + 1
    }))
  }

  const initializePlanDraft = (messageId, payload) => {
    if (!payload) return
    const steps = Array.isArray(payload.steps) ? payload.steps.map(normalizePlanStep) : []
    setPlanDrafts(prev => ({
      ...prev,
      [messageId]: {
        planId: payload.planId || payload.plan_id || '',
        version: payload.version || 1,
        query: payload.query || '',
        deepThinking: payload.deepThinking || payload.deep_thinking || '',
        questionType: payload.questionType || payload.question_type || '',
        summary: payload.summary || '',
        rerunMode: payload.rerunMode || payload.rerun_mode || 'AUTO',
        restartFromStep: Number(payload.restartFromStep || payload.restart_from_step || 1),
        adjustmentInstruction: payload.adjustmentInstruction || '',
        editedSteps: steps,
        analysisSteps: [],
        analysisSummary: null
      }
    }))
    updateStreamingMessage(messageId, old => ({
      analysisPlan: payload,
      content: old.content || ''
    }))
  }

  const updatePlanDraft = (messageId, updater) => {
    setPlanDrafts(prev => {
      const current = prev[messageId]
      if (!current) return prev
      const next = updater(current)
      return { ...prev, [messageId]: next }
    })
  }

  const updatePlanUiState = (messageId, updater) => {
    setPlanUiStates(prev => {
      const current = prev[messageId] || {
        manualExpanded: false,
        manualCollapsed: false,
        editMode: false
      }
      const next = updater(current)
      return { ...prev, [messageId]: next }
    })
  }

  const togglePlanExpanded = (messageId, msg) => {
    updatePlanUiState(messageId, current => {
      const currentlyExpanded = current.manualExpanded
        ? true
        : current.manualCollapsed
          ? false
          : !!msg?.isStreaming
      if (currentlyExpanded) {
        return { ...current, manualExpanded: false, manualCollapsed: true }
      }
      return { ...current, manualExpanded: true, manualCollapsed: false }
    })
  }

  const togglePlanEditMode = (messageId, enabled) => {
    updatePlanUiState(messageId, current => ({
      ...current,
      editMode: enabled,
      manualExpanded: true,
      manualCollapsed: false
    }))
  }

  const handlePlanStepFieldChange = (messageId, index, key, value) => {
    updatePlanDraft(messageId, current => {
      const nextSteps = (current.editedSteps || []).map((step, i) => {
        if (i !== index) return step
        return { ...step, [key]: value }
      })
      return { ...current, editedSteps: nextSteps }
    })
  }

  const handlePlanConfigChange = (messageId, key, value) => {
    updatePlanDraft(messageId, current => ({ ...current, [key]: value }))
  }

  const handlePlanStepMove = (messageId, index, direction) => {
    updatePlanDraft(messageId, current => {
      const steps = [...(current.editedSteps || [])]
      const targetIndex = index + direction
      if (targetIndex < 0 || targetIndex >= steps.length) return current
      const temp = steps[index]
      steps[index] = steps[targetIndex]
      steps[targetIndex] = temp
      return { ...current, editedSteps: reindexPlanSteps(steps) }
    })
  }

  const handlePlanStepAdd = (messageId) => {
    updatePlanDraft(messageId, current => {
      const nextSteps = [...(current.editedSteps || [])]
      nextSteps.push(normalizePlanStep({
        route: 'AUTO',
        label: '新步骤',
        goal: '',
        query: current.query || '',
        toolName: '',
        continueWhen: '',
        stopWhen: ''
      }, nextSteps.length))
      return { ...current, editedSteps: reindexPlanSteps(nextSteps) }
    })
  }

  const handlePlanStepRemove = (messageId, index) => {
    updatePlanDraft(messageId, current => {
      const steps = [...(current.editedSteps || [])]
      if (steps.length <= 1) return current
      steps.splice(index, 1)
      return { ...current, editedSteps: reindexPlanSteps(steps) }
    })
  }

  const buildPlanStreamState = (draft, msg) => {
    const executed = Array.isArray(draft?.analysisSteps) ? draft.analysisSteps : []
    const planned = Array.isArray(draft?.editedSteps) ? draft.editedSteps.length : 0
    const finishedRaw = executed.filter(step => {
      const status = String(step?.status || '').toLowerCase()
      return status === 'completed' || status === 'done'
    }).length
    const finished = planned > 0 ? Math.min(finishedRaw, planned) : finishedRaw
    const latest = executed.length > 0 ? executed[executed.length - 1] : null
    const waitingApproval = executed.some(step => String(step?.status || '').toLowerCase() === 'waiting_approval')
    if (draft?.analysisSummary || msg?.analysisSummary) {
      const total = planned || Math.max(finished, 1)
      if (waitingApproval || (planned > 0 && finished < planned)) {
        const percent = total > 0 ? Math.round((finished / total) * 100) : 20
        return {
          text: `已执行：${finished}/${total} 步（${waitingApproval ? '等待审批' : '未全部完成'}）`,
          progress: Math.max(12, Math.min(99, percent))
        }
      }
      return {
        text: `已完成：${finished}/${total} 步`,
        progress: 100
      }
    }
    if (msg?.isStreaming) {
      if (!latest) {
        return {
          text: `进行中：0/${planned || 1} 步（正在生成链路）`,
          progress: 10
        }
      }
      const latestNoRaw = Number(latest.step_no || executed.length)
      const latestNo = planned > 0 ? Math.min(Math.max(1, latestNoRaw), planned) : Math.max(1, latestNoRaw)
      const latestLabel = latest.label || latest.type || '执行步骤'
      const latestStatus = latest.status || 'streaming'
      const percentBase = planned > 0 ? Math.min(100, Math.round((latestNo / planned) * 100)) : 30
      return {
        text: `进行中：第 ${latestNo} 步 ${latestLabel}（${latestStatus}）`,
        progress: Math.max(12, percentBase)
      }
    }
    return {
      text: `待执行：0/${planned || 1} 步`,
      progress: 0
    }
  }

  const buildStepSectionHeader = (stepPayload) => {
    const stepNoRaw = Number(stepPayload?.step_no || 0)
    const stepNo = Number.isFinite(stepNoRaw) && stepNoRaw > 0 ? stepNoRaw : null
    const label = String(stepPayload?.label || stepPayload?.type || '执行步骤').trim()
    const route = String(stepPayload?.route || stepPayload?.type || '').trim()
    const query = String(stepPayload?.query || '').trim()
    const title = stepNo ? `### 第 ${stepNo} 步：${label}` : `### ${label}`
    const meta = [route ? `路由：${route}` : '', query ? `任务：${query}` : ''].filter(Boolean).join('｜')
    return meta ? `${title}\n${meta}\n\n` : `${title}\n\n`
  }

  const runWithPlanDraft = async (messageId, replanOnly) => {
    const draft = planDrafts[messageId]
    if (!draft) return
    const nextMsgId = Date.now() + Math.floor(Math.random() * 1000)
    setMessages(prev => [...prev, { role: 'assistant', content: '', id: nextMsgId, isStreaming: true }])
    setLoading(true)
    let finalAssistantContent = ''
    let pendingStepPayload = null
    const insertedStepNoSet = new Set()
    let insertedFallbackHeader = false
    const assistantPayloadState = {
      references: [],
      sourceTag: '',
      logicFlow: '',
      skillHint: '',
      analysisPlan: null,
      analysisSteps: [],
      analysisSummary: null,
      toolDraft: null,
      clarify: null
    }
    try {
      const response = await startAgentStream(conversationIdRef.current, draft.query || '', {
        adjustmentInstruction: draft.adjustmentInstruction || '',
        editedSteps: draft.editedSteps || [],
        rerunMode: draft.rerunMode || 'AUTO',
        restartFromStep: draft.restartFromStep || 1,
        replanOnly,
        memoryProfileId: selectedMemoryProfileId
      })
      let aiContent = ''
      let hasRenderableOutput = false
      await consumeSse(response, async (eventName, dataStr) => {
        if (dataStr === '[DONE]') return
        if (eventName === 'analysis_plan') {
          hasRenderableOutput = true
          const payload = parseJsonSafe(dataStr, {}) || {}
          assistantPayloadState.analysisPlan = payload
          initializePlanDraft(nextMsgId, payload)
          return
        }
        if (eventName === 'analysis_step') {
          hasRenderableOutput = true
          const payload = parseJsonSafe(dataStr, {}) || {}
          pendingStepPayload = payload
          assistantPayloadState.analysisSteps = [...assistantPayloadState.analysisSteps, payload]
          updatePlanDraft(nextMsgId, current => ({
            ...current,
            analysisSteps: [...(current.analysisSteps || []), payload]
          }))
          updateStreamingMessage(nextMsgId, old => ({
            analysisSteps: [...(old.analysisSteps || []), payload]
          }))
          return
        }
        if (eventName === 'analysis_summary') {
          hasRenderableOutput = true
          const payload = parseJsonSafe(dataStr, {}) || {}
          assistantPayloadState.analysisSummary = payload
          updatePlanDraft(nextMsgId, current => ({ ...current, analysisSummary: payload }))
          updateStreamingMessage(nextMsgId, () => ({ analysisSummary: payload }))
          return
        }
        if (eventName === 'tool_draft') {
          hasRenderableOutput = true
          const draftPayload = parseJsonSafe(dataStr)
          if (!draftPayload) return
          assistantPayloadState.toolDraft = draftPayload
          const draftArgs = parseJsonSafe(draftPayload.draftArgs, {}) || {}
          setToolForms(prev => ({
            ...prev,
            [draftPayload.toolCallId]: {
              args: draftArgs,
              files: []
            }
          }))
          const tip = '已识别到可执行技能，请填写参数并上传文件后执行。'
          updateStreamingMessage(nextMsgId, old => {
            const base = String(old.content || aiContent || '').trim()
            const content = base.includes(tip) ? base : `${base ? `${base}\n\n` : ''}${tip}`
            finalAssistantContent = content
            return {
              content,
              toolDraft: draftPayload
            }
          })
          return
        }
        if (eventName === 'clarify') {
          hasRenderableOutput = true
          const payload = parseJsonSafe(dataStr, {}) || {}
          const question = (payload.question || '我需要你补充一下意图，才能继续。').trim()
          assistantPayloadState.clarify = {
            ...payload,
            suggestions: normalizeClarifySuggestions(payload)
          }
          finalAssistantContent = question
          updateStreamingMessage(nextMsgId, () => ({
            content: question,
            clarify: assistantPayloadState.clarify
          }))
          return
        }
        if (eventName === 'rag_content') {
          hasRenderableOutput = true
          const payload = parseJsonSafe(dataStr)
          if (!payload) return
          const answer = payload.answer || ''
          const refs = normalizeRefs(payload)
          const skillName = payload.skillName || ''
          if (refs.length > 0) {
            assistantPayloadState.references = refs
          }
          if (skillName) {
            assistantPayloadState.sourceTag = 'RAG检索'
          }
          // Store RAG content separately for dedicated block display
          if (answer) {
            assistantPayloadState.ragContent = answer
            updateStreamingMessage(nextMsgId, old => ({
              content: old.content,
              ragContent: answer,
              references: refs.length > 0 ? refs : (old.references || []),
              sourceTag: assistantPayloadState.sourceTag || old.sourceTag,
              logicFlow: old.logicFlow,
              skillHint: old.skillHint,
              hasRagContent: true
            }))
          }
          return
        }
        if (eventName === 'skill_end') {
          hasRenderableOutput = true
          const payload = parseJsonSafe(dataStr)
          if (!payload) return
          const result = payload.result || payload.answer || ''
          const refs = normalizeRefs(payload)
          const skillName = payload.skillName || ''
          if (refs.length > 0) {
            assistantPayloadState.references = refs
          }
          if (skillName) {
            assistantPayloadState.sourceTag = 'RAG检索'
          }
          // Store RAG content separately
          if (result) {
            assistantPayloadState.ragContent = result
            updateStreamingMessage(nextMsgId, old => ({
              content: old.content,
              ragContent: result,
              references: refs.length > 0 ? refs : (old.references || []),
              sourceTag: assistantPayloadState.sourceTag || old.sourceTag,
              logicFlow: old.logicFlow,
              skillHint: old.skillHint,
              hasRagContent: true
            }))
          }
          return
        }
        if (eventName === 'skill_start') {
          // Mark rag start - save current content as preRagContent
          const payload = parseJsonSafe(dataStr)
          if (!payload) return
          const skillName = payload.skillName || ''
          if (skillName && (skillName === 'rag-query' || skillName.includes('rag'))) {
            assistantPayloadState.isRagPending = true
            assistantPayloadState.preRagContent = aiContent
            assistantPayloadState.ragContent = ''
            assistantPayloadState.postRagContent = ''
          }
          return
        }
        if (eventName === 'token') {
          hasRenderableOutput = true
          if (pendingStepPayload) {
            const stepNo = Number(pendingStepPayload?.step_no || 0)
            if (stepNo > 0 && !insertedStepNoSet.has(stepNo)) {
              aiContent += `${aiContent.trim() ? '\n\n' : ''}${buildStepSectionHeader(pendingStepPayload)}`
              insertedStepNoSet.add(stepNo)
            } else if (stepNo <= 0 && !insertedFallbackHeader) {
              aiContent += `${aiContent.trim() ? '\n\n' : ''}${buildStepSectionHeader(pendingStepPayload)}`
              insertedFallbackHeader = true
            }
            pendingStepPayload = null
          }
          aiContent += dataStr
          finalAssistantContent = aiContent
          updateStreamingMessage(nextMsgId, () => ({ content: aiContent }))
          return
        }
        if (eventName === 'error') {
          hasRenderableOutput = true
          updateStreamingMessage(nextMsgId, () => ({ content: `**Error**: ${dataStr}` }))
          return
        }
        if (eventName === 'message') {
          const payload = parseJsonSafe(dataStr)
          // Skip if this is a rag_content or skill_end message (already handled by dedicated events)
          if (payload && (payload.type === 'rag_content' || payload.type === 'skill_end')) {
            return
          }
          if (!payload) {
            const plainText = (dataStr || '').trim()
            if (!plainText) return
            hasRenderableOutput = true
            if (pendingStepPayload) {
              const stepNo = Number(pendingStepPayload?.step_no || 0)
              if (stepNo > 0 && !insertedStepNoSet.has(stepNo)) {
                aiContent += `${aiContent.trim() ? '\n\n' : ''}${buildStepSectionHeader(pendingStepPayload)}`
                insertedStepNoSet.add(stepNo)
              } else if (stepNo <= 0 && !insertedFallbackHeader) {
                aiContent += `${aiContent.trim() ? '\n\n' : ''}${buildStepSectionHeader(pendingStepPayload)}`
                insertedFallbackHeader = true
              }
              pendingStepPayload = null
            }
            // Check if rag is pending - add to postRagContent
            if (assistantPayloadState.isRagPending) {
              const currentPostRag = assistantPayloadState.postRagContent || ''
              assistantPayloadState.postRagContent = currentPostRag + plainText
            }
            aiContent += plainText
            finalAssistantContent = aiContent
            updateStreamingMessage(nextMsgId, () => ({ 
              content: aiContent,
              preRagContent: assistantPayloadState.preRagContent,
              postRagContent: assistantPayloadState.postRagContent
            }))
            return
          }
          const delta = payload.answer || payload.data?.answer || ''
          const refs = normalizeRefs(payload)
          const logicFlow = normalizeLogicFlow(payload)
          const sourceTag = payload.sourceLabel || payload.source || (refs.length > 0 ? 'RAG检索' : '')
          const skillHint = String(payload.skillHint || payload.skill_hint || '').trim()
          if (refs.length > 0) {
            assistantPayloadState.references = refs
          }
          if (logicFlow) {
            assistantPayloadState.logicFlow = logicFlow
          }
          if (sourceTag) {
            assistantPayloadState.sourceTag = sourceTag
          }
          if (skillHint) {
            assistantPayloadState.skillHint = skillHint
          }
          if (!delta && refs.length > 0 && !aiContent.trim()) {
            aiContent += buildReferenceOnlyNotice(refs)
          }
          if (pendingStepPayload && delta) {
            const stepNo = Number(pendingStepPayload?.step_no || 0)
            if (stepNo > 0 && !insertedStepNoSet.has(stepNo)) {
              aiContent += `${aiContent.trim() ? '\n\n' : ''}${buildStepSectionHeader(pendingStepPayload)}`
              insertedStepNoSet.add(stepNo)
            } else if (stepNo <= 0 && !insertedFallbackHeader) {
              aiContent += `${aiContent.trim() ? '\n\n' : ''}${buildStepSectionHeader(pendingStepPayload)}`
              insertedFallbackHeader = true
            }
            pendingStepPayload = null
          }
          // Check if rag is pending - add to postRagContent
          if (assistantPayloadState.isRagPending && delta) {
            const currentPostRag = assistantPayloadState.postRagContent || ''
            assistantPayloadState.postRagContent = currentPostRag + delta
          }
          aiContent += delta
          finalAssistantContent = aiContent
          updateStreamingMessage(nextMsgId, old => ({
            content: aiContent,
            preRagContent: assistantPayloadState.preRagContent,
            postRagContent: assistantPayloadState.postRagContent,
            references: refs.length > 0 ? refs : old.references,
            sourceTag: sourceTag || old.sourceTag,
            logicFlow: logicFlow || old.logicFlow,
            skillHint: skillHint || old.skillHint
          }))
          hasRenderableOutput = true
        }
      })
      if (!hasRenderableOutput) {
        finalAssistantContent = '请求已完成，暂未返回可展示内容。'
        updateStreamingMessage(nextMsgId, () => ({ content: finalAssistantContent }))
      }
    } catch (err) {
      finalAssistantContent = `**Error**: ${err.message}`
      updateStreamingMessage(nextMsgId, () => ({ content: `**Error**: ${err.message}` }))
    } finally {
      setLoading(false)
      updateStreamingMessage(nextMsgId, () => ({ isStreaming: false }))
      if (conversationIdRef.current && finalAssistantContent.trim()) {
        try {
          const payloadText = buildMessagePayloadForSave({
            content: finalAssistantContent,
            ...assistantPayloadState
          })
          await saveConversationMessage(conversationIdRef.current, 'assistant', finalAssistantContent, activeConversationTitle, payloadText)
        } catch (persistErr) {
          console.error('保存助手消息失败:', persistErr)
        }
      }
    }
  }

  const handleClarifySuggestionClick = (text) => {
    if (!text) return
    setInput(text)
  }

  const handleManualSkillInvoke = async (tool) => {
    if (!tool?.name) return
    if (loading) return
    setConversationError('')
    setManualDraftPending(tool.name)
    try {
      if (!conversationIdRef.current) {
        await loadConversationListAndMessages()
      }
      if (!conversationIdRef.current) {
        setConversationError('当前无可用会话，请先新建会话')
        return
      }
      const conversationTitle = activeConversationTitle || String(getToolDisplayLabel(tool) || tool?.name || '').slice(0, 20)
      const draft = await createToolDraft(
        conversationIdRef.current,
        tool.name,
        tool.description || getToolDisplayLabel(tool) || tool.name
      )
      const draftArgs = parseJsonSafe(draft?.draftArgs, {}) || {}
      if (draft?.toolCallId) {
        setToolForms(prev => ({
          ...prev,
          [draft.toolCallId]: {
            args: draftArgs,
            files: []
          }
        }))
      }
      const assistantContent = `已选择技能：${getToolDisplayLabel(tool) || tool.name}\n请填写参数并上传文件后执行。`
      const assistantMsg = {
        role: 'assistant',
        content: assistantContent,
        id: Date.now() + Math.floor(Math.random() * 1000),
        toolDraft: draft
      }
      setMessages(prev => [...prev, assistantMsg])
      const payloadText = buildMessagePayloadForSave({
        content: assistantContent,
        toolDraft: draft
      })
      await saveConversationMessage(conversationIdRef.current, 'assistant', assistantContent, conversationTitle, payloadText)
    } catch (err) {
      setConversationError(err?.message || '创建技能草稿失败')
    } finally {
      setManualDraftPending('')
    }
  }

  const handleSend = async (presetInput) => {
    const mergedInput = typeof presetInput === 'string' ? presetInput : input
    const finalInput = String(mergedInput || '').trim()
    if (!finalInput) return
    closeMention()

    if (loading && abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    const requestId = ++currentRequestIdRef.current
    if (!conversationIdRef.current) {
      await loadConversationListAndMessages()
    }
    if (!conversationIdRef.current) {
      setConversationError('当前无可用会话，请先新建会话')
      return
    }

    const standaloneTool = resolveStandaloneMentionTool(finalInput)
    if (standaloneTool?.name) {
      const conversationTitle = activeConversationTitle || String(getToolDisplayLabel(standaloneTool) || standaloneTool.name).slice(0, 20)
      const userMsg = { role: 'user', content: finalInput }
      setMessages(prev => [...prev, userMsg])
      setInput('')
      try {
        await saveConversationMessage(conversationIdRef.current, 'user', finalInput, conversationTitle)
      } catch (persistErr) {
        console.error('保存用户消息失败:', persistErr)
      }
      try {
        const draft = await createToolDraft(
          conversationIdRef.current,
          standaloneTool.name,
          `direct_mention:${getToolDisplayLabel(standaloneTool) || standaloneTool.name}`
        )
        const draftArgs = parseJsonSafe(draft?.draftArgs, {}) || {}
        const presetForm = { args: draftArgs, files: [] }
        if (draft?.toolCallId) {
          setToolForms(prev => ({
            ...prev,
            [draft.toolCallId]: presetForm
          }))
        }
        // 单独 @技能名：固定走直接调用；若技能要求文件则降级为“已选择技能，等待上传”。
        if (draft?.toolSpec?.upload_required) {
          const assistantContent = `已直接匹配技能：${getToolDisplayLabel(standaloneTool) || standaloneTool.name}\n该技能需要上传文件，请补充文件后点击“执行技能”。`
          const assistantMsg = {
            role: 'assistant',
            content: assistantContent,
            id: Date.now() + Math.floor(Math.random() * 1000),
            toolDraft: draft
          }
          setMessages(prev => [...prev, assistantMsg])
          const payloadText = buildMessagePayloadForSave({
            content: assistantContent,
            toolDraft: draft
          })
          await saveConversationMessage(conversationIdRef.current, 'assistant', assistantContent, conversationTitle, payloadText)
        } else {
          await handleApproveTool(draft, presetForm)
        }
      } catch (err) {
        setConversationError(err?.message || '直接调用技能失败')
      }
      return
    }

    const conversationTitle = activeConversationTitle || finalInput.slice(0, 20)
    const userMsg = { role: 'user', content: finalInput }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)
    try {
      await saveConversationMessage(conversationIdRef.current, 'user', finalInput, conversationTitle)
    } catch (persistErr) {
      console.error('保存用户消息失败:', persistErr)
    }

    const aiMsgId = Date.now()
    setMessages(prev => [...prev, { role: 'assistant', content: '', id: aiMsgId, isStreaming: true }])
    abortControllerRef.current = new AbortController()
    let finalAssistantContent = ''
    let pendingStepPayload = null
    const insertedStepNoSet = new Set()
    let insertedFallbackHeader = false
    const assistantPayloadState = {
      references: [],
      sourceTag: '',
      logicFlow: '',
      skillHint: '',
      analysisPlan: null,
      analysisSteps: [],
      analysisSummary: null,
      toolDraft: null,
      clarify: null
    }

    try {
      // 获取并清空上传的文件
      const filesToUpload = [...uploadedFiles]
      setUploadedFiles([])

      const { response, uploaded: uploadedFromStream } = await startAgentStream(conversationIdRef.current, userMsg.content, {
        memoryProfileId: selectedMemoryProfileId,
        files: filesToUpload
      })

      // 如果有上传的文件，显示在消息中
      if (uploadedFromStream && uploadedFromStream.length > 0) {
        const fileMsg = {
          role: 'user',
          content: `[已上传文件]`,
          id: `upload-${Date.now()}`,
          isFile: true,
          fileNames: uploadedFromStream.map(f => f.fileName)
        }
        setMessages(prev => [...prev, fileMsg])
      }
      let aiContent = ''
      let hasRenderableOutput = false

      await consumeSse(response, async (eventName, dataStr) => {
        if (dataStr === '[DONE]') return
        if (eventName === 'analysis_plan') {
          hasRenderableOutput = true
          const payload = parseJsonSafe(dataStr, {}) || {}
          assistantPayloadState.analysisPlan = payload
          initializePlanDraft(aiMsgId, payload)
          return
        }
        if (eventName === 'analysis_step') {
          hasRenderableOutput = true
          const payload = parseJsonSafe(dataStr, {}) || {}
          pendingStepPayload = payload
          assistantPayloadState.analysisSteps = [...assistantPayloadState.analysisSteps, payload]
          updatePlanDraft(aiMsgId, current => ({
            ...current,
            analysisSteps: [...(current.analysisSteps || []), payload]
          }))
          updateStreamingMessage(aiMsgId, old => ({
            analysisSteps: [...(old.analysisSteps || []), payload]
          }))
          return
        }
        if (eventName === 'analysis_summary') {
          hasRenderableOutput = true
          const payload = parseJsonSafe(dataStr, {}) || {}
          assistantPayloadState.analysisSummary = payload
          updatePlanDraft(aiMsgId, current => ({ ...current, analysisSummary: payload }))
          updateStreamingMessage(aiMsgId, () => ({ analysisSummary: payload }))
          return
        }
        if (eventName === 'token') {
          hasRenderableOutput = true
          if (pendingStepPayload) {
            const stepNo = Number(pendingStepPayload?.step_no || 0)
            if (stepNo > 0 && !insertedStepNoSet.has(stepNo)) {
              aiContent += `${aiContent.trim() ? '\n\n' : ''}${buildStepSectionHeader(pendingStepPayload)}`
              insertedStepNoSet.add(stepNo)
            } else if (stepNo <= 0 && !insertedFallbackHeader) {
              aiContent += `${aiContent.trim() ? '\n\n' : ''}${buildStepSectionHeader(pendingStepPayload)}`
              insertedFallbackHeader = true
            }
            pendingStepPayload = null
          }
          aiContent += dataStr
          finalAssistantContent = aiContent
          updateStreamingMessage(aiMsgId, () => ({ content: aiContent }))
          return
        }
        if (eventName === 'tool_draft') {
          hasRenderableOutput = true
          const draft = parseJsonSafe(dataStr)
          if (!draft) return
          assistantPayloadState.toolDraft = draft
          const draftArgs = parseJsonSafe(draft.draftArgs, {}) || {}
          setToolForms(prev => ({
            ...prev,
            [draft.toolCallId]: {
              args: draftArgs,
              files: []
            }
          }))
          const tip = '已识别到可执行技能，请填写参数并上传文件后执行。'
          updateStreamingMessage(aiMsgId, old => {
            const base = String(old.content || aiContent || '').trim()
            const content = base.includes(tip) ? base : `${base ? `${base}\n\n` : ''}${tip}`
            finalAssistantContent = content
            return {
              content,
              toolDraft: draft
            }
          })
          return
        }
        if (eventName === 'clarify') {
          hasRenderableOutput = true
          const payload = parseJsonSafe(dataStr, {}) || {}
          const question = (payload.question || '我需要你补充一下意图，才能继续。').trim()
          assistantPayloadState.clarify = {
            ...payload,
            suggestions: normalizeClarifySuggestions(payload)
          }
          updateStreamingMessage(aiMsgId, () => ({
            content: question,
            clarify: assistantPayloadState.clarify
          }))
          return
        }
        if (eventName === 'rag_content') {
          hasRenderableOutput = true
          const payload = parseJsonSafe(dataStr)
          if (!payload) return
          const answer = payload.answer || ''
          const refs = normalizeRefs(payload)
          const skillName = payload.skillName || ''
          if (refs.length > 0) {
            assistantPayloadState.references = refs
          }
          if (skillName) {
            assistantPayloadState.sourceTag = 'RAG检索'
          }
          if (answer) {
            assistantPayloadState.ragContent = answer
            updateStreamingMessage(aiMsgId, old => ({
              content: old.content,
              ragContent: answer,
              references: refs.length > 0 ? refs : (old.references || []),
              sourceTag: assistantPayloadState.sourceTag || old.sourceTag,
              logicFlow: old.logicFlow,
              skillHint: old.skillHint,
              hasRagContent: true
            }))
          }
          return
        }
        if (eventName === 'skill_end') {
          hasRenderableOutput = true
          const payload = parseJsonSafe(dataStr)
          if (!payload) return
          const result = payload.result || payload.answer || ''
          const refs = normalizeRefs(payload)
          const skillName = payload.skillName || ''
          if (refs.length > 0) {
            assistantPayloadState.references = refs
          }
          if (skillName) {
            assistantPayloadState.sourceTag = 'RAG检索'
          }
          if (result) {
            assistantPayloadState.ragContent = result
            updateStreamingMessage(aiMsgId, old => ({
              content: old.content,
              ragContent: result,
              references: refs.length > 0 ? refs : (old.references || []),
              sourceTag: assistantPayloadState.sourceTag || old.sourceTag,
              logicFlow: old.logicFlow,
              skillHint: old.skillHint,
              hasRagContent: true
            }))
          }
          return
        }
        if (eventName === 'skill_start') {
          // Mark rag start - save current content as preRagContent
          const payload = parseJsonSafe(dataStr)
          if (!payload) return
          const skillName = payload.skillName || ''
          if (skillName && (skillName === 'rag-query' || skillName.includes('rag'))) {
            assistantPayloadState.isRagPending = true
            assistantPayloadState.preRagContent = aiContent
            assistantPayloadState.ragContent = ''
            assistantPayloadState.postRagContent = ''
          }
          return
        }
        if (eventName === 'skill_end') {
          // Handle skill_end event - stream RAG results directly to frontend
          hasRenderableOutput = true
          const payload = parseJsonSafe(dataStr)
          if (!payload) return
          const result = payload.result || payload.answer || ''
          const refs = normalizeRefs(payload)
          const skillName = payload.skillName || ''
          if (refs.length > 0) {
            assistantPayloadState.references = refs
          }
          if (skillName) {
            assistantPayloadState.sourceTag = 'RAG检索'
          }
          if (result) {
            assistantPayloadState.ragContent = result
            updateStreamingMessage(aiMsgId, old => ({
              content: old.content,
              ragContent: result,
              references: refs.length > 0 ? refs : (old.references || []),
              sourceTag: assistantPayloadState.sourceTag || old.sourceTag,
              logicFlow: old.logicFlow,
              skillHint: old.skillHint,
              hasRagContent: true
            }))
          }
          return
        }
        if (eventName === 'error') {
          hasRenderableOutput = true
          updateStreamingMessage(aiMsgId, () => ({ content: `**Error**: ${dataStr}` }))
          return
        }
        if (eventName === 'message') {
          const payload = parseJsonSafe(dataStr)
          // Skip if this is a rag_content or skill_end message (already handled by dedicated events)
          if (payload && (payload.type === 'rag_content' || payload.type === 'skill_end')) {
            return
          }
          if (!payload) {
            const plainText = (dataStr || '').trim()
            if (!plainText) return
            hasRenderableOutput = true
            if (pendingStepPayload) {
              const stepNo = Number(pendingStepPayload?.step_no || 0)
              if (stepNo > 0 && !insertedStepNoSet.has(stepNo)) {
                aiContent += `${aiContent.trim() ? '\n\n' : ''}${buildStepSectionHeader(pendingStepPayload)}`
                insertedStepNoSet.add(stepNo)
              } else if (stepNo <= 0 && !insertedFallbackHeader) {
                aiContent += `${aiContent.trim() ? '\n\n' : ''}${buildStepSectionHeader(pendingStepPayload)}`
                insertedFallbackHeader = true
              }
              pendingStepPayload = null
            }
            aiContent += plainText
            finalAssistantContent = aiContent
            updateStreamingMessage(aiMsgId, () => ({ content: aiContent }))
            return
          }
          const delta = payload.answer || payload.data?.answer || ''
          const refs = normalizeRefs(payload)
          const logicFlow = normalizeLogicFlow(payload)
          const sourceTag = payload.sourceLabel || payload.source || (refs.length > 0 ? 'RAG检索' : '')
          const skillHint = String(payload.skillHint || payload.skill_hint || '').trim()
          if (refs.length > 0) {
            assistantPayloadState.references = refs
          }
          if (logicFlow) {
            assistantPayloadState.logicFlow = logicFlow
          }
          if (sourceTag) {
            assistantPayloadState.sourceTag = sourceTag
          }
          if (skillHint) {
            assistantPayloadState.skillHint = skillHint
          }
          if (delta || refs.length > 0 || logicFlow || skillHint) {
            hasRenderableOutput = true
          }
          if (!delta && refs.length > 0 && !aiContent.trim()) {
            aiContent += buildReferenceOnlyNotice(refs)
          }
          if (pendingStepPayload && delta) {
            const stepNo = Number(pendingStepPayload?.step_no || 0)
            if (stepNo > 0 && !insertedStepNoSet.has(stepNo)) {
              aiContent += `${aiContent.trim() ? '\n\n' : ''}${buildStepSectionHeader(pendingStepPayload)}`
              insertedStepNoSet.add(stepNo)
            } else if (stepNo <= 0 && !insertedFallbackHeader) {
              aiContent += `${aiContent.trim() ? '\n\n' : ''}${buildStepSectionHeader(pendingStepPayload)}`
              insertedFallbackHeader = true
            }
            pendingStepPayload = null
          }
          // Add LLM marker header if this is the first LLM output after RAG content
          if (delta && assistantPayloadState.references?.length > 0 && !aiContent.includes('🤖 AI回答')) {
            aiContent += '\n\n---\n\n> **🤖 AI回答**\n\n'
          }
          aiContent += delta
          finalAssistantContent = aiContent
          updateStreamingMessage(aiMsgId, old => ({
            content: aiContent,
            references: refs.length > 0 ? refs : old.references,
            sourceTag: sourceTag || old.sourceTag,
            logicFlow: logicFlow || old.logicFlow,
            skillHint: skillHint || old.skillHint
          }))
        }
      })
      if (!hasRenderableOutput) {
        finalAssistantContent = '请求已完成，暂未返回可展示内容。'
        updateStreamingMessage(aiMsgId, () => ({ content: '请求已完成，暂未返回可展示内容。' }))
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        return
      }
      finalAssistantContent = `**Error**: ${err.message}`
      updateStreamingMessage(aiMsgId, () => ({ content: `**Error**: ${err.message}` }))
    } finally {
      if (currentRequestIdRef.current === requestId) {
        setLoading(false)
      }
      updateStreamingMessage(aiMsgId, () => ({ isStreaming: false }))
      if (conversationIdRef.current && finalAssistantContent.trim()) {
        try {
          const payloadText = buildMessagePayloadForSave({
            content: finalAssistantContent,
            ...assistantPayloadState
          })
          await saveConversationMessage(conversationIdRef.current, 'assistant', finalAssistantContent, conversationTitle, payloadText)
        } catch (persistErr) {
          console.error('保存助手消息失败:', persistErr)
        }
      }
    }
  }

  const handleCreateConversation = async () => {
    if (conversationLoading || conversationActionLoading) return
    setConversationLoading(true)
    setConversationError('')
    try {
      const created = await createConversation('新对话')
      const nextConversationId = normalizeConversationId(created)
      await loadConversationListAndMessages(nextConversationId)
    } catch (err) {
      setConversationError(err?.message || '新建会话失败')
      setConversationLoading(false)
    }
  }

  const handleSwitchConversation = async (targetConversationId) => {
    if (!targetConversationId || targetConversationId === conversationIdRef.current) return
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    setLoading(false)
    await loadConversationListAndMessages(targetConversationId)
  }

  // 文件选择处理
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      addFiles(files)
    }
    e.target.value = ''
  }

  // 拖拽文件处理（支持文件夹）
  const handleFileDrop = async (e) => {
    e.preventDefault()
    const allFiles = []

    // 尝试使用 File System Access API 读取目录
    const items = e.dataTransfer.items
    if (items) {
      for (const item of items) {
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry?.()
          if (entry) {
            await readDirectoryEntry(entry, allFiles)
          } else {
            const file = item.getAsFile()
            if (file) allFiles.push(file)
          }
        }
      }
    }

    // 如果没有读取到文件，尝试直接使用 files
    if (allFiles.length === 0 && e.dataTransfer.files.length > 0) {
      allFiles.push(...Array.from(e.dataTransfer.files))
    }

    if (allFiles.length > 0) {
      addFiles(allFiles)
    }
  }

  // 递归读取目录中的所有文件
  const readDirectoryEntry = (entry, fileList, basePath = '') => {
    return new Promise((resolve) => {
      if (entry.isFile) {
        entry.file((file) => {
          const fileWithPath = new File([file], basePath + file.name, { type: file.type })
          fileList.push(fileWithPath)
          resolve()
        })
      } else if (entry.isDirectory) {
        const dirReader = entry.createReader()
        dirReader.readEntries((entries) => {
          if (entries.length === 0) {
            resolve()
            return
          }
          const promises = entries.map((e) =>
            readDirectoryEntry(e, fileList, basePath + entry.name + '/')
          )
          Promise.all(promises).then(resolve)
        })
      } else {
        resolve()
      }
    })
  }

  // 添加文件
  const addFiles = (newFiles) => {
    setUploadedFiles(prev => {
      const existingNames = new Set(prev.map(f => f.name))
      const unique = newFiles.filter(f => !existingNames.has(f.name))
      return [...prev, ...unique.map(f => ({ name: f.name, size: f.size, file: f }))]
    })
  }

  // 移除文件
  const removeUploadedFile = (index) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index))
  }

  // 处理文件夹选择
  const handleFolderSelect = (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      addFiles(files)
    }
    e.target.value = ''
  }

  const handleSendButtonClick = () => {
    // 点击转圈按钮时，真正中断当前流式输出；若输入框有新内容则立即发起新问题。
    if (loading) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      setLoading(false)
      const nextPrompt = String(input || '').trim()
      if (nextPrompt) {
        handleSend(nextPrompt)
      }
      return
    }
    handleSend()
  }

  const handleStartRenameConversation = (item) => {
    if (!item?.id) return
    setRenamingConversationId(item.id)
    setRenamingTitle(item.title || '')
  }

  const handleCancelRenameConversation = () => {
    setRenamingConversationId('')
    setRenamingTitle('')
  }

  const handleSubmitRenameConversation = async (conversationId) => {
    const nextTitle = String(renamingTitle || '').trim()
    if (!conversationId || !nextTitle) {
      setConversationError('会话名称不能为空')
      return
    }
    setConversationActionLoading(true)
    setConversationError('')
    try {
      await renameConversation(conversationId, nextTitle)
      setRenamingConversationId('')
      setRenamingTitle('')
      await loadConversationListAndMessages(conversationId)
    } catch (err) {
      setConversationError(err?.message || '重命名会话失败')
    } finally {
      setConversationActionLoading(false)
    }
  }

  const handleDeleteConversation = async (conversationId) => {
    if (!conversationId || conversationActionLoading) return
    if (!window.confirm('确定删除该会话及全部消息吗？')) return
    setConversationActionLoading(true)
    setConversationError('')
    try {
      await deleteConversation(conversationId)
      const rest = conversations.filter(item => item.id !== conversationId)
      const nextConversationId = rest[0]?.id || ''
      await loadConversationListAndMessages(nextConversationId)
    } catch (err) {
      setConversationError(err?.message || '删除会话失败')
    } finally {
      setConversationActionLoading(false)
    }
  }

  const handleToolArgChange = (toolCallId, key, value) => {
    setToolForms(prev => ({
      ...prev,
      [toolCallId]: {
        ...(prev[toolCallId] || { args: {}, files: [] }),
        args: {
          ...((prev[toolCallId] && prev[toolCallId].args) || {}),
          [key]: value
        }
      }
    }))
  }

  const handleToolFileChange = (toolCallId, files) => {
    setToolForms(prev => ({
      ...prev,
      [toolCallId]: {
        ...(prev[toolCallId] || { args: {}, files: [] }),
        files: Array.from(files || [])
      }
    }))
  }

  const handleApproveTool = async (toolDraft, formOverride = null) => {
    const toolCallId = toolDraft.toolCallId
    const form = formOverride || toolForms[toolCallId] || { args: {}, files: [] }
    const files = form.files || []
    const args = form.args || {}
    if (toolDraft.toolSpec?.upload_required && files.length === 0) {
      alert('该技能需要先上传文件')
      return
    }
    setToolPending(prev => ({ ...prev, [toolCallId]: true }))
    const aiMsgId = Date.now() + Math.floor(Math.random() * 1000)
    setMessages(prev => [...prev, { role: 'assistant', content: '', id: aiMsgId, isStreaming: true }])
    let finalAssistantContent = ''
    const assistantPayloadState = {
      references: [],
      sourceTag: '',
      logicFlow: '',
      skillHint: ''
    }
    try {
      for (const file of files) {
        await uploadToolInputFile(toolCallId, file)
      }
      const response = await approveToolCall(
        conversationIdRef.current,
        toolCallId,
        JSON.stringify(args)
      )
      let aiContent = ''
      let latestToolResult = null
      let hasRenderableOutput = false
      await consumeSse(response, async (eventName, dataStr) => {
        if (dataStr === '[DONE]') return
        if (eventName === 'tool_result') {
          const result = parseJsonSafe(dataStr)
          if (result) {
            latestToolResult = result
            setToolResults(prev => ({ ...prev, [toolCallId]: result }))
          }
          return
        }
        if (eventName === 'rag_content') {
          // Handle rag_content event - stream RAG results directly
          hasRenderableOutput = true
          const payload = parseJsonSafe(dataStr)
          if (!payload) return
          const answer = payload.answer || ''
          const refs = normalizeRefs(payload)
          const skillName = payload.skillName || ''
          if (refs.length > 0) {
            assistantPayloadState.references = refs
          }
          if (skillName) {
            assistantPayloadState.sourceTag = 'RAG检索'
          }
          if (answer) {
            if (aiContent.trim()) {
              aiContent += '\n\n'
            }
            aiContent += `> **📚 RAG检索结果**\n\n`
            aiContent += answer
            finalAssistantContent = aiContent
            updateStreamingMessage(aiMsgId, old => ({
              content: aiContent,
              references: refs.length > 0 ? refs : (old.references || []),
              sourceTag: assistantPayloadState.sourceTag || old.sourceTag,
              logicFlow: old.logicFlow,
              skillHint: old.skillHint,
              hasRagContent: true
            }))
          }
          return
        }
        if (eventName === 'skill_end') {
          // Handle skill_end event - stream RAG results directly to frontend
          hasRenderableOutput = true
          const payload = parseJsonSafe(dataStr)
          if (!payload) return
          const result = payload.result || payload.answer || ''
          const refs = normalizeRefs(payload)
          const skillName = payload.skillName || ''
          const outputFiles = payload.outputFiles || []
          if (refs.length > 0) {
            assistantPayloadState.references = refs
          }
          if (skillName) {
            assistantPayloadState.sourceTag = 'RAG检索'
          }
          if (result) {
            if (aiContent.trim()) {
              aiContent += '\n\n'
            }
            aiContent += `> **📚 ${skillName || 'Skill'} 执行结果**\n\n`
            aiContent += result
            // Add download links if available
            if (outputFiles.length > 0) {
              aiContent += '\n\n---\n\n**📥 下载文件:**\n\n'
              outputFiles.forEach(f => {
                aiContent += `- [${f.file_name}](${f.download_url})\n`
              })
            }
            finalAssistantContent = aiContent
            updateStreamingMessage(aiMsgId, old => ({
              content: aiContent,
              references: refs.length > 0 ? refs : (old.references || []),
              sourceTag: assistantPayloadState.sourceTag || old.sourceTag,
              logicFlow: old.logicFlow,
              skillHint: old.skillHint,
              hasRagContent: true,
              outputFiles: outputFiles
            }))
          }
          return
        }
        if (eventName === 'token') {
          aiContent += dataStr
          finalAssistantContent = aiContent
          updateStreamingMessage(aiMsgId, () => ({ content: aiContent }))
          return
        }
        if (eventName === 'error') {
          finalAssistantContent = `**Error**: ${dataStr}`
          updateStreamingMessage(aiMsgId, () => ({ content: `**Error**: ${dataStr}` }))
          return
        }
        if (eventName === 'message') {
          const payload = parseJsonSafe(dataStr)
          // Skip if this is a rag_content or skill_end message (already handled by dedicated events)
          if (payload && (payload.type === 'rag_content' || payload.type === 'skill_end')) {
            return
          }
          if (!payload) {
            const plainText = (dataStr || '').trim()
            if (!plainText) return
            aiContent += plainText
            finalAssistantContent = aiContent
            updateStreamingMessage(aiMsgId, () => ({ content: aiContent }))
            return
          }
          const delta = payload.answer || payload.data?.answer || ''
          const refs = normalizeRefs(payload)
          const logicFlow = normalizeLogicFlow(payload)
          const sourceTag = payload.sourceLabel || payload.source || (refs.length > 0 ? 'RAG检索' : '')
          const skillHint = String(payload.skillHint || payload.skill_hint || '').trim()
          if (refs.length > 0) {
            assistantPayloadState.references = refs
          }
          if (logicFlow) {
            assistantPayloadState.logicFlow = logicFlow
          }
          if (sourceTag) {
            assistantPayloadState.sourceTag = sourceTag
          }
          if (skillHint) {
            assistantPayloadState.skillHint = skillHint
          }
          if (!delta && refs.length > 0 && !aiContent.trim()) {
            aiContent += buildReferenceOnlyNotice(refs)
          }
          aiContent += delta
          finalAssistantContent = aiContent
          updateStreamingMessage(aiMsgId, old => ({
            content: aiContent,
            references: refs.length > 0 ? refs : old.references,
            sourceTag: sourceTag || old.sourceTag,
            logicFlow: logicFlow || old.logicFlow,
            skillHint: skillHint || old.skillHint
          }))
        }
      })
      if (!aiContent) {
        finalAssistantContent = latestToolResult?.summary || '工具执行完成。'
        updateStreamingMessage(aiMsgId, () => ({ content: finalAssistantContent }))
      }
    } catch (err) {
      finalAssistantContent = `**Error**: ${err.message}`
      updateStreamingMessage(aiMsgId, () => ({ content: `**Error**: ${err.message}` }))
    } finally {
      setToolPending(prev => ({ ...prev, [toolCallId]: false }))
      updateStreamingMessage(aiMsgId, () => ({ isStreaming: false }))
      if (conversationIdRef.current && finalAssistantContent.trim()) {
        try {
          const payloadText = buildMessagePayloadForSave({
            content: finalAssistantContent,
            ...assistantPayloadState
          })
          await saveConversationMessage(conversationIdRef.current, 'assistant', finalAssistantContent, activeConversationTitle, payloadText)
        } catch (persistErr) {
          console.error('保存助手消息失败:', persistErr)
        }
      }
    }
  }

  return (
    <div className="flex flex-1 h-full overflow-hidden bg-slate-50 relative">
      <div className="w-72 h-full border-r border-slate-200 bg-white flex flex-col shrink-0">
        <div className="p-3 border-b border-slate-100">
          <button
            onClick={handleCreateConversation}
            disabled={conversationLoading || conversationActionLoading}
            className="w-full inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            <Plus size={14} />
            新建对话
          </button>
        </div>
        <div
          ref={conversationListRef}
          onScroll={handleConversationListScroll}
          className="flex-1 overflow-y-auto p-2 space-y-1"
        >
          {conversationListLoadingMore && (
            <div className="px-2 py-1 text-[11px] text-slate-400 flex items-center gap-1">
              <Loader2 size={12} className="animate-spin" />
              加载更早会话...
            </div>
          )}
          {conversations.map((item) => {
            const active = item.id === conversationIdRef.current
            const renaming = renamingConversationId === item.id
            return (
              <div key={item.id} className={cn("rounded-lg border", active ? "border-blue-200 bg-blue-50" : "border-transparent hover:border-slate-200 hover:bg-slate-50")}>
                {renaming ? (
                  <div className="p-2 space-y-2">
                    <input
                      value={renamingTitle}
                      onChange={(e) => setRenamingTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleSubmitRenameConversation(item.id)
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault()
                          handleCancelRenameConversation()
                        }
                      }}
                      maxLength={120}
                      className="w-full px-2 py-1.5 text-sm rounded border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={handleCancelRenameConversation}
                        className="px-2 py-1 text-xs rounded border border-slate-300 text-slate-600 hover:bg-slate-100"
                      >
                        取消
                      </button>
                      <button
                        onClick={() => handleSubmitRenameConversation(item.id)}
                        disabled={conversationActionLoading}
                        className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        保存
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 p-2">
                    <button
                      onClick={() => handleSwitchConversation(item.id)}
                      className={cn("flex-1 min-w-0 text-left text-sm truncate", active ? "text-blue-700 font-medium" : "text-slate-700")}
                    >
                      {item.title || '未命名会话'}
                    </button>
                    <button
                      onClick={() => handleStartRenameConversation(item)}
                      disabled={conversationActionLoading}
                      className="p-1.5 rounded text-slate-500 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-50"
                    >
                      <Edit size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteConversation(item.id)}
                      disabled={conversationActionLoading}
                      className="p-1.5 rounded text-rose-500 hover:bg-rose-100 hover:text-rose-700 disabled:opacity-50"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div className="border-t border-slate-100 p-2">
          <div className="flex items-center justify-between px-1 mb-2">
            <div className="text-xs font-semibold text-slate-600">技能快捷调用</div>
            <button
              onClick={loadToolCatalog}
              disabled={toolCatalogLoading}
              className="p-1 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              title="刷新技能目录"
            >
              <RefreshCw size={12} className={toolCatalogLoading ? 'animate-spin' : ''} />
            </button>
          </div>
          {toolCatalogError && (
            <div className="px-2 py-1.5 text-[11px] text-rose-600 bg-rose-50 border border-rose-100 rounded mb-2">
              {toolCatalogError}
            </div>
          )}
          <div className="max-h-52 overflow-y-auto space-y-1">
            {toolCatalogLoading && (
              <div className="px-2 py-2 text-[11px] text-slate-400 flex items-center gap-1">
                <Loader2 size={12} className="animate-spin" />
                加载中...
              </div>
            )}
            {!toolCatalogLoading && toolCatalog.length === 0 && (
              <div className="px-2 py-2 text-[11px] text-slate-400">暂无可用技能</div>
            )}
            {!toolCatalogLoading && toolCatalog.map((tool, idx) => (
              <button
                key={tool.code || tool.toolCode || `tool-${idx}`}
                onClick={() => handleManualSkillInvoke(tool)}
                disabled={loading || manualDraftPending === tool.name}
                className="w-full text-left px-2 py-1.5 rounded border border-slate-200 hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50"
              >
                <div className="text-xs font-medium text-slate-700 truncate">
                  {getToolDisplayLabel(tool) || tool.name}
                </div>
                <div className="text-[10px] text-slate-500 truncate">
                  {manualDraftPending === tool.name ? '创建草稿中...' : (tool.description || tool.name)}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="relative flex-1 flex flex-col h-full shadow-sm bg-white">
        <div className="p-4 border-b bg-white/80 backdrop-blur z-10 sticky top-0">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold text-slate-800 flex items-center gap-2">
              <Bot size={20} className="text-blue-500" />
              智能问答助手
            </h2>
            <div className="text-xs text-slate-500 flex items-center gap-2">
              <span>{activeConversationTitle || '未命名会话'}</span>
            </div>
          </div>
          {conversationError && (
            <div className="mt-2 text-xs text-rose-600">{conversationError}</div>
          )}
        </div>

        <div
          ref={messagesContainerRef}
          onScroll={handleMessagesScroll}
          className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth"
        >
          {messageLoadingMore && (
            <div className="text-center text-[11px] text-slate-400 flex items-center justify-center gap-1">
              <Loader2 size={12} className="animate-spin" />
              加载更早消息...
            </div>
          )}
          {messages.map((msg, idx) => (
            <div key={idx} className={cn(
              "flex gap-4",
              msg.role === 'user' ? "flex-row-reverse" : ""
            )}>
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm",
                msg.role === 'user' ? "bg-blue-600 text-white" : "bg-emerald-500 text-white"
              )}>
                {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
              </div>
              <div className={cn(
                "px-5 py-3 rounded-2xl max-w-[85%] text-sm leading-relaxed shadow-sm",
                msg.role === 'user' 
                  ? "bg-blue-600 text-white rounded-tr-sm" 
                  : "bg-white border border-slate-100 text-slate-700 rounded-tl-sm"
              )}>
                {msg.isFile && (
                  <div className="mb-2 flex items-center gap-2 text-xs text-slate-600">
                    <Paperclip size={14} className="text-blue-500" />
                    <span>已上传文件:</span>
                    <span className="font-medium">{msg.fileNames?.join(', ')}</span>
                  </div>
                )}
                {msg.toolDraft && (
                  <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50 p-3">
                    <div className="text-xs text-blue-700 font-semibold mb-2">
                      已识别技能：{msg.toolDraft.toolName}
                    </div>
                    <div className="text-xs text-slate-600 mb-3">
                      {msg.toolDraft.toolSpec?.description || '请填写参数并执行'}
                    </div>
                    {msg.toolDraft.toolSpec?.parameters_schema?.properties && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                        {Object.keys(msg.toolDraft.toolSpec.parameters_schema.properties).map((key) => (
                          <input
                            key={key}
                            value={toolForms[msg.toolDraft.toolCallId]?.args?.[key] || ''}
                            onChange={(e) => handleToolArgChange(msg.toolDraft.toolCallId, key, e.target.value)}
                            placeholder={key}
                            className="px-2 py-1.5 rounded border border-slate-300 text-xs bg-white"
                          />
                        ))}
                      </div>
                    )}
                    {msg.toolDraft.toolSpec?.upload_required && (
                      <div className="mb-3">
                        <div className="text-[11px] text-slate-500 mb-1">
                          支持文件：{(msg.toolDraft.toolSpec.accepted_file_types || []).join(', ') || '不限'}
                        </div>
                        <input
                          type="file"
                          multiple
                          onChange={(e) => handleToolFileChange(msg.toolDraft.toolCallId, e.target.files)}
                          className="text-xs"
                        />
                        {toolForms[msg.toolDraft.toolCallId]?.files?.length > 0 && (
                          <div className="mt-1 text-[11px] text-slate-600">
                            已选择 {toolForms[msg.toolDraft.toolCallId].files.length} 个文件
                          </div>
                        )}
                      </div>
                    )}
                    <button
                      onClick={() => handleApproveTool(msg.toolDraft)}
                      disabled={!!toolPending[msg.toolDraft.toolCallId]}
                      className="px-3 py-1.5 rounded bg-blue-600 text-white text-xs hover:bg-blue-700 disabled:opacity-50"
                    >
                      {toolPending[msg.toolDraft.toolCallId] ? '执行中...' : '执行技能'}
                    </button>
                    {toolResults[msg.toolDraft.toolCallId] && (
                      <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2">
                        <div className="text-xs font-semibold text-emerald-700">
                          {toolResults[msg.toolDraft.toolCallId].summary || '执行完成'}
                        </div>
                        {toolResults[msg.toolDraft.toolCallId].error_message && (
                          <div className="text-xs text-rose-600 mt-1">
                            {toolResults[msg.toolDraft.toolCallId].error_message}
                          </div>
                        )}
                        {toolResults[msg.toolDraft.toolCallId].files && toolResults[msg.toolDraft.toolCallId].files.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {toolResults[msg.toolDraft.toolCallId].files.map((f) => (
                              <a
                                key={f.file_id}
                                href={f.download_url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1 text-xs text-blue-700 hover:underline"
                              >
                                <Download size={12} />
                                <span>{f.file_name}</span>
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {msg.clarify && (
                  <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <div className="text-xs text-amber-700 font-semibold mb-2">
                      需要补充意图
                    </div>
                    <div className="text-xs text-slate-700 mb-2">
                      {msg.clarify.question || '请补充你的目标，我再继续执行。'}
                    </div>
                    {Array.isArray(msg.clarify.suggestions) && msg.clarify.suggestions.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {msg.clarify.suggestions.map((item, i) => (
                          <button
                            key={`${item}-${i}`}
                            onClick={() => handleClarifySuggestionClick(item)}
                            className="px-2.5 py-1 rounded-full bg-white border border-amber-300 text-[11px] text-amber-800 hover:bg-amber-100"
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {planDrafts[msg.id] && (
                  <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
                    {(() => {
                      const draft = planDrafts[msg.id]
                      const uiState = planUiStates[msg.id] || {}
                      const expanded = uiState.manualExpanded
                        ? true
                        : uiState.manualCollapsed
                          ? false
                          : !!msg.isStreaming
                      const editMode = !!uiState.editMode
                      const streamState = buildPlanStreamState(draft, msg)
                      const analysisStatusByNo = (draft.analysisSteps || []).reduce((acc, step) => {
                        const no = Number(step?.step_no || 0)
                        if (no > 0) acc[no] = step?.status || 'streaming'
                        return acc
                      }, {})
                      const plannedSteps = Array.isArray(draft.editedSteps) ? draft.editedSteps : []
                      const normalizedStatuses = plannedSteps.map((step, sIdx) => String(analysisStatusByNo[step.stepNo || sIdx + 1] || 'pending').toLowerCase())
                      const plannedCount = plannedSteps.length
                      const executedCount = normalizedStatuses.filter(status => status !== 'pending').length
                      const completedCount = normalizedStatuses.filter(status => status === 'completed' || status === 'done').length
                      const hasWaitingApproval = normalizedStatuses.includes('waiting_approval')
                      const hasHardPending = normalizedStatuses.some(status => status === 'pending' || status === 'streaming')
                      const summaryFallbackText = plannedCount <= 0
                        ? '已输出阶段汇总'
                        : hasHardPending
                          ? `已按顺序执行 ${executedCount}/${plannedCount} 步，正在继续执行后续步骤。`
                          : hasWaitingApproval
                            ? `已按顺序执行 ${executedCount}/${plannedCount} 步，工具步骤待审批，阶段汇总已生成。`
                            : completedCount >= plannedCount
                              ? `已按顺序执行 ${completedCount}/${plannedCount} 步，最终汇总已生成。`
                              : `已按顺序执行 ${executedCount}/${plannedCount} 步，阶段汇总已生成。`
                      return (
                        <>
                          <div className="flex items-center justify-between">
                            <div className="text-xs font-semibold text-slate-700">分析链路总览</div>
                            <button
                              onClick={() => togglePlanExpanded(msg.id, msg)}
                              className="text-[11px] text-slate-600 hover:text-slate-800"
                            >
                              {expanded ? '收起' : '展开'}
                            </button>
                          </div>
                          {expanded && (
                            <>
                              <div className="space-y-1">
                                <div className="text-xs text-slate-700">{streamState.text}</div>
                                <div className="h-1.5 w-full rounded bg-slate-200 overflow-hidden">
                                  <div
                                    className="h-full rounded bg-blue-500 transition-all duration-300"
                                    style={{ width: `${streamState.progress}%` }}
                                  />
                                </div>
                              </div>
                              <div className="text-xs text-slate-600 whitespace-pre-wrap">
                                深度思考：{draft.deepThinking || '暂无'}
                              </div>
                              {!editMode && (
                                <div className="space-y-1">
                                  {(draft.editedSteps || []).map((step, sIdx) => (
                                    <div key={`${msg.id}-step-text-${sIdx}`} className="text-xs text-slate-700">
                                      {`${step.stepNo || sIdx + 1}. [${step.route || 'AUTO'}] ${step.label || '步骤'}：${step.goal || '无目标'}${step.query ? `（查询：${step.query}）` : ''}${step.toolName ? `（工具：${step.toolName}）` : ''}（状态：${analysisStatusByNo[step.stepNo || sIdx + 1] || 'pending'}）`}
                                    </div>
                                  ))}
                                </div>
                              )}
                              {editMode && (
                                <>
                                  <div>
                                    <button
                                      onClick={() => handlePlanStepAdd(msg.id)}
                                      className="px-2.5 py-1 rounded bg-emerald-600 text-white text-xs hover:bg-emerald-700"
                                    >
                                      新增步骤
                                    </button>
                                  </div>
                                  <div className="space-y-2">
                                    {(draft.editedSteps || []).map((step, sIdx) => (
                                      <div key={`${msg.id}-step-${sIdx}`} className="rounded-lg border border-slate-200 bg-white p-2">
                                        <div className="flex items-center justify-between mb-1">
                                          <div className="text-xs font-semibold text-slate-700">步骤 {step.stepNo}</div>
                                          <div className="text-[10px] px-2 py-0.5 rounded-full border border-blue-200 bg-blue-50 text-blue-700">
                                            {step.route || 'AUTO'}
                                          </div>
                                        </div>
                                        <input
                                          value={step.label}
                                          onChange={(e) => handlePlanStepFieldChange(msg.id, sIdx, 'label', e.target.value)}
                                          className="w-full mb-1 px-2 py-1 rounded border border-slate-300 text-xs"
                                          placeholder="步骤标签"
                                        />
                                        <textarea
                                          value={step.goal}
                                          onChange={(e) => handlePlanStepFieldChange(msg.id, sIdx, 'goal', e.target.value)}
                                          className="w-full mb-1 px-2 py-1 rounded border border-slate-300 text-xs h-14 resize-none"
                                          placeholder="步骤目标"
                                        />
                                        <input
                                          value={step.query}
                                          onChange={(e) => handlePlanStepFieldChange(msg.id, sIdx, 'query', e.target.value)}
                                          className="w-full mb-1 px-2 py-1 rounded border border-slate-300 text-xs"
                                          placeholder="步骤查询词"
                                        />
                                        <input
                                          value={step.toolName}
                                          onChange={(e) => handlePlanStepFieldChange(msg.id, sIdx, 'toolName', e.target.value)}
                                          className="w-full px-2 py-1 rounded border border-slate-300 text-xs"
                                          placeholder="工具名（可选）"
                                        />
                                        <div className="mt-2 flex gap-2 flex-wrap">
                                          <button
                                            onClick={() => handlePlanStepMove(msg.id, sIdx, -1)}
                                            disabled={sIdx === 0}
                                            className="px-2 py-1 rounded bg-slate-100 text-slate-700 text-xs hover:bg-slate-200 disabled:opacity-40"
                                          >
                                            上移
                                          </button>
                                          <button
                                            onClick={() => handlePlanStepMove(msg.id, sIdx, 1)}
                                            disabled={sIdx === (draft.editedSteps || []).length - 1}
                                            className="px-2 py-1 rounded bg-slate-100 text-slate-700 text-xs hover:bg-slate-200 disabled:opacity-40"
                                          >
                                            下移
                                          </button>
                                          <button
                                            onClick={() => handlePlanStepRemove(msg.id, sIdx)}
                                            disabled={(draft.editedSteps || []).length <= 1}
                                            className="px-2 py-1 rounded bg-rose-100 text-rose-700 text-xs hover:bg-rose-200 disabled:opacity-40"
                                          >
                                            删除
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                    <select
                                      value={draft.rerunMode || 'AUTO'}
                                      onChange={(e) => handlePlanConfigChange(msg.id, 'rerunMode', e.target.value)}
                                      className="px-2 py-1 rounded border border-slate-300 text-xs bg-white"
                                    >
                                      <option value="AUTO">AUTO</option>
                                      <option value="PARTIAL_RERUN">PARTIAL_RERUN</option>
                                      <option value="FULL_RERUN">FULL_RERUN</option>
                                    </select>
                                    <input
                                      type="number"
                                      min="1"
                                      value={draft.restartFromStep || 1}
                                      onChange={(e) => handlePlanConfigChange(msg.id, 'restartFromStep', Number(e.target.value) || 1)}
                                      className="px-2 py-1 rounded border border-slate-300 text-xs"
                                      placeholder="从第几步开始"
                                    />
                                    <input
                                      value={draft.adjustmentInstruction || ''}
                                      onChange={(e) => handlePlanConfigChange(msg.id, 'adjustmentInstruction', e.target.value)}
                                      className="px-2 py-1 rounded border border-slate-300 text-xs"
                                      placeholder="人工修改说明"
                                    />
                                  </div>
                                </>
                              )}
                              <div className="flex gap-2 flex-wrap">
                                {!editMode ? (
                                  <button
                                    onClick={() => togglePlanEditMode(msg.id, true)}
                                    className="px-3 py-1.5 rounded bg-slate-700 text-white text-xs hover:bg-slate-800"
                                  >
                                    我要修改计划
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => togglePlanEditMode(msg.id, false)}
                                    className="px-3 py-1.5 rounded bg-slate-200 text-slate-700 text-xs hover:bg-slate-300"
                                  >
                                    退出编辑
                                  </button>
                                )}
                                <button
                                  onClick={() => runWithPlanDraft(msg.id, true)}
                                  disabled={loading}
                                  className="px-3 py-1.5 rounded bg-slate-700 text-white text-xs hover:bg-slate-800 disabled:opacity-50"
                                >
                                  仅重规划
                                </button>
                                <button
                                  onClick={() => runWithPlanDraft(msg.id, false)}
                                  disabled={loading}
                                  className="px-3 py-1.5 rounded bg-blue-600 text-white text-xs hover:bg-blue-700 disabled:opacity-50"
                                >
                                  按新计划执行
                                </button>
                              </div>
                              {msg.analysisSummary && (
                                <div className="text-xs text-emerald-800 whitespace-pre-wrap">
                                  总结：{msg.analysisSummary.final_answer || summaryFallbackText}
                                </div>
                              )}
                            </>
                          )}
                        </>
                      )
                    })()}
                  </div>
                )}
                {(() => {
                  let rawContent = msg.content || '';
                  rawContent = rawContent.replace(/[\r\n]+(?=\s*\[(?:ID:\s*)?\d+\])/g, ' ');

                  let answer = rawContent;
                  const thoughtParts = []
                  answer = answer.replace(/<think>([\s\S]*?)<\/think>/g, (_, part) => {
                    const text = String(part || '').trim()
                    if (text) {
                      thoughtParts.push(text)
                    }
                    return ''
                  })
                  const start = answer.indexOf('<think>')
                  const end = answer.indexOf('</think>')
                  if (thoughtParts.length === 0 && start !== -1 && msg.isStreaming) {
                    const streamingThought = answer.substring(start + 7).trim()
                    if (streamingThought) {
                      thoughtParts.push(streamingThought)
                    }
                    answer = answer.substring(0, start)
                  } else if (thoughtParts.length === 0 && start === -1 && end > 0) {
                    // 兼容只有 </think> 没有 <think> 的返回，避免思考内容丢失。
                    const inferredThought = answer.substring(0, end).trim()
                    if (inferredThought) {
                      thoughtParts.push(inferredThought)
                    }
                    answer = answer.substring(end + 8)
                  }
                  answer = answer.replace(/<\/?think>/g, '')
                  const thought = thoughtParts.length > 0 ? thoughtParts.join('\n\n') : null

                  return (
                    <>
                      {msg.sourceTag && (
                        <div className="mb-2 inline-flex px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-[11px] text-indigo-700">
                          来源：{msg.sourceTag}
                        </div>
                      )}
                      {msg.skillHint && (
                        <div className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2">
                          <div className="text-[11px] font-semibold text-indigo-700 mb-1">相关技能</div>
                          <div className="text-xs text-indigo-800 whitespace-pre-wrap">{msg.skillHint}</div>
                        </div>
                      )}
                      {msg.logicFlow && (
                        <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                          <div className="text-[11px] font-semibold text-slate-600 mb-1">分析链路</div>
                          <div className="space-y-1">
                            {msg.logicFlow.split('\n').map((line, i) => {
                              const text = (line || '').trim()
                              if (!text) return null
                              return (
                                <div key={`${text}-${i}`} className="text-xs text-slate-600">
                                  {text}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                      {thought && (
                        <ThoughtBlock 
                          content={thought} 
                          references={msg.references} 
                          onViewReference={setViewingRef}
                          isStreaming={msg.isStreaming} 
                        />
                      )}
                      {/* 大脑内容 - RAG 之前的部分 */}
                      {msg.preRagContent && (
                        <div className="whitespace-pre-wrap">
                          {msg.preRagContent}
                          {msg.isStreaming && <span className="inline-block w-1 h-3 bg-emerald-400 animate-pulse ml-0.5"/>}
                        </div>
                      )}
                      {/* RAG检索结果 - 固定显示在preRagContent之后、postRagContent之前 */}
                      {msg.ragContent && (
                        <div className="my-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                          <div className="flex items-center gap-2 mb-2">
                            <Database size={14} className="text-amber-600" />
                            <span className="text-xs font-semibold text-amber-700">RAG检索结果</span>
                          </div>
                          <div className="text-sm text-amber-900 whitespace-pre-wrap">
                            {msg.ragContent}
                            {msg.isStreaming && <span className="inline-block w-1 h-3 bg-amber-400 animate-pulse ml-0.5"/>}
                          </div>
                        </div>
                      )}
                      {/* 大脑内容 - RAG 之后的部分 */}
                      {msg.postRagContent && (
                        <div className="whitespace-pre-wrap">
                          {msg.postRagContent}
                          {msg.isStreaming && <span className="inline-block w-1 h-3 bg-emerald-400 animate-pulse ml-0.5"/>}
                        </div>
                      )}
                      {/* 没有任何分割内容时，显示原始 content */}
                      {!msg.preRagContent && !msg.postRagContent && (
                        <MarkdownWithCitations 
                          content={answer} 
                          references={msg.references} 
                          onViewReference={setViewingRef} 
                        />
                      )}
                      {msg.isStreaming && <span className="inline-block w-1.5 h-4 bg-emerald-400 animate-pulse ml-1 align-middle"/>}
                    </>
                  )
                })()}
                {msg.outputFiles && msg.outputFiles.length > 0 && !msg.isStreaming && (
                  <div className="mt-4 pt-3 border-t border-slate-100">
                    <div className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1">
                      <Download size={14} />
                      下载文件
                    </div>
                    <div className="flex flex-col gap-1">
                      {msg.outputFiles.map((f, i) => (
                        <a
                          key={i}
                          href={f.download_url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 p-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg text-left transition-colors"
                        >
                          <Download size={14} className="text-blue-600" />
                          <span className="text-xs text-blue-700 flex-1 truncate">{f.file_name}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {msg.references && msg.references.length > 0 && !msg.isStreaming && (
                  <div className="mt-4 pt-3 border-t border-slate-100">
                    <div className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1">
                      <BookOpen size={14} />
                      参考资料
                    </div>
                    <div className="flex flex-col gap-2">
                      {msg.references.map((ref, i) => (
                        <button 
                          key={i}
                          onClick={() => setViewingRef(ref)}
                          className="flex items-start gap-2 p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-left transition-colors group"
                        >
                          <FileText size={16} className="text-blue-500 mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-slate-700 group-hover:text-blue-700 truncate">
                              {ref.document_name}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2">
                              <span className="bg-slate-200 px-1.5 rounded text-slate-600">
                                {(ref.similarity * 100).toFixed(0)}%
                              </span>
                              <span className="truncate max-w-[200px]">
                                {ref.content ? ref.content.slice(0, 50) + "..." : "No preview"}
                              </span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {showScrollToBottom && (
          <button
            onClick={handleScrollToBottom}
            className="absolute left-1/2 -translate-x-1/2 bottom-28 z-20 inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-slate-200 bg-white/95 shadow hover:bg-slate-50 text-xs text-slate-700"
            title="回到底部"
          >
            <ChevronDown size={14} />
            回到底部
          </button>
        )}
        
        {viewingRef && (
          <SourceViewer 
            reference={viewingRef} 
            onClose={() => setViewingRef(null)} 
          />
        )}

        <div className="p-4 bg-white border-t">
          <div className="mb-3 flex items-center gap-2">
            <input
              value={selectedMemoryProfileId}
              onChange={(e) => setSelectedMemoryProfileId(e.target.value)}
              placeholder="当前记忆 profile（可选）"
              className="h-9 rounded-lg border border-slate-300 px-3 text-xs w-72"
            />
            <span className="text-[11px] text-slate-500">留空则使用当前用户默认 profile</span>
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            {quickRouteExamples.map((item) => (
              <button
                key={item}
                onClick={() => handleSend(item)}
                disabled={conversationLoading}
                className="px-2.5 py-1 text-xs rounded-full border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 disabled:opacity-50"
              >
                {item}
              </button>
            ))}
          </div>
          <div className="relative">
            {/* 已上传文件显示区域 */}
            {uploadedFiles.length > 0 && (
              <div className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex flex-wrap gap-2">
                  {uploadedFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-1 bg-white px-2 py-1 rounded border text-xs">
                      <span className="text-slate-600 max-w-[120px] truncate">{file.name}</span>
                      <span className="text-slate-400">({(file.size / 1024).toFixed(1)}KB)</span>
                      <button
                        onClick={() => removeUploadedFile(idx)}
                        className="text-red-500 hover:text-red-700 ml-1"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                const nextValue = e.target.value
                setInput(nextValue)
                const ctx = resolveMentionContext(nextValue, e.target.selectionStart ?? nextValue.length)
                if (!ctx) {
                  closeMention()
                  return
                }
                setMentionOpen(true)
                setMentionQuery(ctx.query)
                setMentionStart(ctx.start)
                setMentionEnd(ctx.end)
                setMentionIndex(0)
              }}
              onKeyDown={(e) => {
                if (mentionOpen && mentionCandidates.length > 0) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setMentionIndex(prev => (prev + 1) % mentionCandidates.length)
                    return
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setMentionIndex(prev => (prev - 1 + mentionCandidates.length) % mentionCandidates.length)
                    return
                  }
                  if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                    e.preventDefault()
                    applyMentionTool(mentionCandidates[mentionIndex] || mentionCandidates[0])
                    return
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    closeMention()
                    return
                  }
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              onBlur={() => {
                setTimeout(() => closeMention(), 120)
              }}
              onDragOver={(e) => {
                e.preventDefault()
                e.currentTarget.classList.add('border-blue-400', 'bg-blue-50')
              }}
              onDragLeave={(e) => {
                e.currentTarget.classList.remove('border-blue-400', 'bg-blue-50')
              }}
              onDrop={(e) => {
                e.preventDefault()
                e.currentTarget.classList.remove('border-blue-400', 'bg-blue-50')
                handleFileDrop(e)
              }}
              placeholder="请输入您的问题...（可拖拽文件到此处上传）"
              className="w-full pl-4 pr-24 py-3 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none h-[80px] text-sm transition-colors"
              disabled={conversationLoading}
            />
            {mentionOpen && mentionCandidates.length > 0 && (
              <div className="absolute left-0 right-14 bottom-[88px] rounded-lg border border-slate-200 bg-white shadow-lg z-20 max-h-56 overflow-y-auto">
                {mentionCandidates.map((tool, idx) => (
                  <button
                    key={tool.name || `${tool.displayName}-${idx}`}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      applyMentionTool(tool)
                    }}
                    className={cn(
                      'w-full text-left px-3 py-2 border-b last:border-b-0',
                      idx === mentionIndex ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-700'
                    )}
                  >
                    <div className="text-xs font-medium">{getToolDisplayLabel(tool) || tool.name}</div>
                    <div className="text-[11px] text-slate-500 truncate">{tool.description || tool.name}</div>
                  </button>
                ))}
              </div>
            )}
            {/* 文件上传按钮 - 支持文件和文件夹 */}
            <div className="absolute right-12 top-2 flex items-center gap-1">
              <label className="p-2 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors" title="上传文件">
                <input
                  type="file"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Paperclip size={18} />
              </label>
              <label className="p-2 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors" title="上传文件夹">
                <input
                  type="file"
                  multiple
                  webkitdirectory=""
                  onChange={handleFolderSelect}
                  className="hidden"
                />
                <FolderOpen size={18} />
              </label>
            </div>
            <button
              onClick={handleSendButtonClick}
              disabled={conversationLoading || (!loading && !input.trim() && uploadedFiles.length === 0)}
              className="absolute right-2 top-2 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              {(loading || conversationLoading) ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">输入 `@` 可选择技能名称，支持拖拽上传文件。</p>
          <p className="text-center text-xs text-slate-400 mt-2">
            AI 生成内容仅供参考，请以原始文档为准。
          </p>
        </div>
      </div>
    </div>
  )
}

function MemoryManager() {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [profiles, setProfiles] = useState([])
  const [selectedProfileId, setSelectedProfileId] = useState('')
  const [content, setContent] = useState('')

  const load = useCallback(async (profileIdOverride = '') => {
    setLoading(true)
    setError('')
    setOk('')
    try {
      const data = await fetchMemoryProfiles()
      const allowed = Array.isArray(data?.allowedProfileIds) ? data.allowedProfileIds : []
      setProfiles(allowed)
      const nextId = profileIdOverride || selectedProfileId || data?.currentProfileId || allowed[0] || ''
      setSelectedProfileId(nextId)
      if (!nextId) {
        setContent('')
      } else {
        const mem = await fetchCurrentMemory(nextId)
        setContent(mem?.content || '')
      }
    } catch (e) {
      setError(e?.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [selectedProfileId])

  useEffect(() => {
    load('')
  }, [load])

  const onSave = async () => {
    if (!selectedProfileId) return
    setSaving(true)
    setError('')
    setOk('')
    try {
      await updateCurrentMemory(selectedProfileId, content)
      setOk('保存成功')
    } catch (e) {
      setError(e?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 h-full overflow-auto space-y-4">
      <h2 className="text-xl font-semibold text-slate-900">记忆管理</h2>
      <div className="flex items-center gap-3">
        <select
          className="h-10 rounded-lg border border-slate-300 px-3 text-sm min-w-[280px]"
          value={selectedProfileId}
          onChange={(e) => load(e.target.value)}
          disabled={loading || saving}
        >
          {profiles.map((pid) => (
            <option key={pid} value={pid}>{pid}</option>
          ))}
        </select>
        <button
          onClick={() => load(selectedProfileId)}
          disabled={loading || saving}
          className="h-10 px-4 rounded-lg bg-slate-100 hover:bg-slate-200 text-sm"
        >
          刷新
        </button>
        <button
          onClick={onSave}
          disabled={!selectedProfileId || loading || saving}
          className="h-10 px-4 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 text-sm"
        >
          {saving ? '保存中...' : '保存记忆'}
        </button>
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="w-full h-[65vh] rounded-xl border border-slate-300 p-4 text-sm font-mono"
        placeholder="编辑该 profile 的记忆内容..."
      />
      {error ? <div className="text-sm text-red-600">{error}</div> : null}
      {ok ? <div className="text-sm text-emerald-600">{ok}</div> : null}
    </div>
  )
}

function App() {
  const [authSession, setAuthSession] = useState(() => loadAuthSession())
  const [activeTab, setActiveTab] = useState('chat')
  const role = authSession?.user?.role || null
  const username = authSession?.user?.username || ''
  const userId = authSession?.user?.id || null

  useEffect(() => {
    const syncAuthExpired = () => {
      clearAuthSession()
      setAuthSession(null)
      setActiveTab('chat')
    }
    window.addEventListener('ai4kb-auth-expired', syncAuthExpired)
    return () => window.removeEventListener('ai4kb-auth-expired', syncAuthExpired)
  }, [])

  const handleLogin = async ({ username: loginUsername, password }) => {
    const data = await loginByPassword(loginUsername, password)
    const nextSession = {
      token: data?.token,
      user: data?.user
    }
    if (!nextSession.token || !nextSession.user?.role) {
      throw new Error('登录返回数据不完整')
    }
    saveAuthSession(nextSession)
    setAuthSession(nextSession)
    setActiveTab(isSuperAdminRole(nextSession.user.role) ? 'super_overview' : (isAdminLikeRole(nextSession.user.role) ? 'datasets' : 'chat'))
  }

  const handleLogout = () => {
    clearAuthSession()
    setAuthSession(null)
    setActiveTab('chat')
  }

  if (!role) {
    return <LoginScreen onLogin={handleLogin} />
  }

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar 
        role={role} 
        username={username}
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        onLogout={handleLogout}
      />
      <main className="flex-1 h-full overflow-hidden relative">
        {activeTab === 'chat' && <ChatInterface role={role} />}
        {activeTab === 'super_overview' && isAdminLikeRole(role) && <SuperAdminOverview role={role} />}
        {activeTab === 'datasets' && isAdminLikeRole(role) && <DatasetManager />}
        {activeTab === 'user_management' && isAdminLikeRole(role) && <UserManagement currentRole={role} currentUserId={userId} />}
        {activeTab === 'permissions' && isAdminLikeRole(role) && <PermissionManager />}
        {activeTab === 'skills' && isAdminLikeRole(role) && <SkillManager role={role} />}
        {activeTab === 'memory' && <MemoryManager />}
        {activeTab === 'route_samples' && isSuperAdminRole(role) && <RouteSampleManager />}
      </main>
    </div>
  )
}

export default App
