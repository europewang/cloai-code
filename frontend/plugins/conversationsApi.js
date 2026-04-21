import { randomUUID } from 'node:crypto'
import { createServer as createHttpServer } from 'node:http'

const CONVERSATION_RETENTION_DAYS = 90
const conversationStore = new Map()
const toolDraftStore = new Map()

function getUserKeyFromAuth(req) {
  const auth = req.headers['x-user-key'] || req.headers['authorization'] || 'anonymous'
  return String(auth).split(' ').pop() || 'anonymous'
}

function ensureConversationBucket(userKey) {
  if (!conversationStore.has(userKey)) {
    conversationStore.set(userKey, new Map())
  }
  return conversationStore.get(userKey)
}

function sendJson(res, status, json) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-key')
  res.end(JSON.stringify(json))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function parseJsonBody(buf) {
  if (!buf || buf.length === 0) return {}
  try {
    return JSON.parse(buf.toString('utf-8'))
  } catch {
    return {}
  }
}

function matchPath(pathname, ...patterns) {
  for (const pattern of patterns) {
    const match = pathname.match(pattern)
    if (match) return match
  }
  return null
}

function handleConversationsApi(req, res, urlObj) {
  const userKey = getUserKeyFromAuth(req)
  const bucket = ensureConversationBucket(userKey)
  const pathname = urlObj.pathname
  const method = req.method || 'GET'
  const listMatch = matchPath(
    pathname,
    /^\/?api\/user\/conversations$/,
    /^\/?user\/conversations$/
  )
  const itemMatch = matchPath(
    pathname,
    /^\/?api\/user\/conversations\/([^/]+)$/,
    /^\/?user\/conversations\/([^/]+)$/
  )
  const msgMatch = matchPath(
    pathname,
    /^\/?api\/user\/conversations\/([^/]+)\/messages$/,
    /^\/?user\/conversations\/([^/]+)\/messages$/
  )

  if (listMatch && method === 'GET') {
    const page = Math.max(1, Number(urlObj.searchParams.get('page') || '1'))
    const pageSize = Math.max(1, Math.min(100, Number(urlObj.searchParams.get('pageSize') || '50')))
    const rows = Array.from(bucket.values()).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    const start = (page - 1) * pageSize
    const items = rows.slice(start, start + pageSize).map((x) => ({
      id: x.id,
      title: x.title,
      created_at: x.createdAt,
      updated_at: x.updatedAt,
    }))
    return sendJson(res, 200, {
      items,
      total: rows.length,
      page,
      page_size: pageSize,
      has_more: start + pageSize < rows.length,
      retention_days: CONVERSATION_RETENTION_DAYS,
    })
  }

  if (listMatch && method === 'POST') {
    return readBody(req).then((buf) => {
      const body = parseJsonBody(buf)
      const id = randomUUID()
      const now = new Date().toISOString()
      const row = {
        id,
        title: String(body.title || '新对话'),
        createdAt: now,
        updatedAt: now,
        messages: [],
      }
      bucket.set(id, row)
      sendJson(res, 200, { id, title: row.title, created_at: now, updated_at: now })
    }).catch(() => sendJson(res, 500, { message: '创建会话失败' }))
  }

  if (itemMatch && method === 'PUT') {
    const conversationId = decodeURIComponent(itemMatch[1])
    return readBody(req).then((buf) => {
      const row = bucket.get(conversationId)
      if (!row) return sendJson(res, 404, { message: '会话不存在' })
      const body = parseJsonBody(buf)
      row.title = String(body.title || row.title)
      row.updatedAt = new Date().toISOString()
      bucket.set(conversationId, row)
      sendJson(res, 200, { id: row.id, title: row.title, updated_at: row.updatedAt })
    }).catch(() => sendJson(res, 500, { message: '重命名会话失败' }))
  }

  if (itemMatch && method === 'DELETE') {
    const conversationId = decodeURIComponent(itemMatch[1])
    bucket.delete(conversationId)
    return sendJson(res, 200, { success: true })
  }

  if (msgMatch && method === 'GET') {
    const conversationId = decodeURIComponent(msgMatch[1])
    const row = bucket.get(conversationId)
    if (!row) return sendJson(res, 404, { message: '会话不存在' })
    const limit = Math.max(1, Math.min(100, Number(urlObj.searchParams.get('limit') || '50')))
    const beforeId = Number(urlObj.searchParams.get('beforeId') || 0)
    const sorted = [...row.messages].sort((a, b) => b.id - a.id)
    const filtered = beforeId > 0 ? sorted.filter((x) => x.id < beforeId) : sorted
    const items = filtered.slice(0, limit)
    const nextBeforeId = items.length > 0 ? items[items.length - 1].id : null
    return sendJson(res, 200, {
      items: items.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        message_payload: m.messagePayload || '',
        created_at: m.createdAt,
      })),
      has_more: filtered.length > limit,
      next_before_id: nextBeforeId,
    })
  }

  if (msgMatch && method === 'POST') {
    const conversationId = decodeURIComponent(msgMatch[1])
    const row = bucket.get(conversationId)
    if (!row) return sendJson(res, 404, { message: '会话不存在' })
    return readBody(req).then((buf) => {
      const body = parseJsonBody(buf)
      const msg = {
        id: Date.now(),
        role: String(body.role || 'assistant'),
        content: String(body.content || ''),
        messagePayload: String(body.messagePayload || ''),
        createdAt: new Date().toISOString(),
      }
      row.messages.push(msg)
      row.updatedAt = new Date().toISOString()
      if (body.conversationTitle && String(body.conversationTitle).trim()) {
        row.title = String(body.conversationTitle).trim()
      }
      bucket.set(conversationId, row)
      sendJson(res, 200, { id: msg.id })
    }).catch(() => sendJson(res, 500, { message: '保存消息失败' }))
  }

  sendJson(res, 404, { message: 'not found' })
}

export default function conversationsPlugin() {
  let server
  const port = 3001

  return {
    name: 'vite-plugin-conversations-api',
    configureServer(devServer) {
      server = createHttpServer((req, res) => {
        const urlPath = req.url || '/'
        const urlObj = new URL(urlPath, 'http://localhost')

        if (urlObj.pathname.startsWith('/api/user/conversations') || urlObj.pathname.startsWith('/user/conversations')) {
          handleConversationsApi(req, res, urlObj)
          return
        }

        res.statusCode = 404
        res.end('Not Found')
      })

      server.listen(port, () => {
        console.log(`[conversations-api] API server running on port ${port}`)
      })

      devServer.middlewares.use((req, res, next) => {
        const urlPath = req.url || '/'
        if (urlPath.startsWith('/api/user/conversations') || urlPath.startsWith('/user/conversations')) {
          const urlObj = new URL(urlPath, 'http://localhost')
          handleConversationsApi(req, res, urlObj)
          return
        }
        next()
      })
    },
    closeBundle() {
      if (server) {
        server.close()
      }
    }
  }
}
