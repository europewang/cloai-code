import { createServer } from 'node:http'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { randomUUID } from 'node:crypto'

const env = globalThis.process?.env || {}
const cwd = globalThis.process?.cwd ? globalThis.process.cwd() : '.'
const PORT = Number(env.PORT || 80)
const BACKEND_URL = new URL(env.BACKEND_URL || 'http://ai4kb-brain-server:8091')
const DIST_DIR = join(cwd, 'dist')
const CONVERSATION_RETENTION_DAYS = 90
const conversationStore = new Map()
const toolDraftStore = new Map()
const TOOL_CATALOG = [
  {
    name: 'rag-query',
    tool_code: 'rag-query',
    tool_name: 'rag-query',
    displayName: 'rag-query',
    description: '调用受控RAG查询，返回结构化答案与引用',
    upload_required: false,
    parameters_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        datasetId: { type: 'string' },
        topK: { type: 'number' },
      },
    },
    accepted_file_types: [],
    max_files: 0,
  },
  {
    name: 'indicator-verification',
    tool_code: 'indicator-verification',
    tool_name: 'indicator-verification',
    displayName: 'cad text extractor',
    description: 'CAD文本提取与面积指标核验（需上传dxf）',
    upload_required: true,
    parameters_schema: {
      type: 'object',
      properties: {
        checker: { type: 'string' },
        reviewer: { type: 'string' },
      },
    },
    accepted_file_types: ['.dxf'],
    max_files: 20,
  },
]

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
}

function proxyApi(req, res) {
  const isHttps = BACKEND_URL.protocol === 'https:'
  const client = isHttps ? httpsRequest : httpRequest
  const targetPath = req.url || '/'
  const headers = { ...req.headers }
  headers.host = BACKEND_URL.host
  headers.connection = headers.connection || 'keep-alive'
  const requestOptions = {
    protocol: BACKEND_URL.protocol,
    hostname: BACKEND_URL.hostname,
    port: BACKEND_URL.port || (isHttps ? 443 : 80),
    method: req.method,
    path: targetPath,
    headers
  }
  const proxyReq = client(requestOptions, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers)
    proxyRes.pipe(res)
  })
  proxyReq.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' })
    }
    res.end(JSON.stringify({ code: 502, message: '前端代理后端失败' }))
  })
  req.pipe(proxyReq)
}

function sendJson(res, statusCode, payload) {
  const text = JSON.stringify(payload ?? {})
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
  })
  res.end(text)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
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

function getUserKeyFromAuth(req) {
  const auth = String(req.headers.authorization || '')
  if (!auth) return 'anonymous'
  return auth
}

function ensureConversationBucket(userKey) {
  if (!conversationStore.has(userKey)) {
    conversationStore.set(userKey, new Map())
  }
  return conversationStore.get(userKey)
}

function ensureToolDraftBucket(userKey) {
  if (!toolDraftStore.has(userKey)) {
    toolDraftStore.set(userKey, new Map())
  }
  return toolDraftStore.get(userKey)
}

async function requestBackendJson(path, method = 'GET', reqHeaders = {}, body = null) {
  const isHttps = BACKEND_URL.protocol === 'https:'
  const client = isHttps ? httpsRequest : httpRequest
  const headers = { ...reqHeaders, host: BACKEND_URL.host }
  if (body && !headers['content-length'] && !headers['Content-Length']) {
    headers['content-length'] = String(body.length)
  }
  const options = {
    protocol: BACKEND_URL.protocol,
    hostname: BACKEND_URL.hostname,
    port: BACKEND_URL.port || (isHttps ? 443 : 80),
    method,
    path,
    headers,
  }
  return new Promise((resolve, reject) => {
    const upReq = client(options, (upRes) => {
      const chunks = []
      upRes.on('data', (c) => chunks.push(c))
      upRes.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf-8')
        let json
        try {
          json = text ? JSON.parse(text) : {}
        } catch {
          json = { raw: text }
        }
        resolve({ status: upRes.statusCode || 500, json })
      })
    })
    upReq.on('error', reject)
    if (body) upReq.write(body)
    upReq.end()
  })
}

function handleConversationsApi(req, res, urlObj) {
  const userKey = getUserKeyFromAuth(req)
  const bucket = ensureConversationBucket(userKey)
  const pathname = urlObj.pathname
  const method = req.method || 'GET'
  const listMatch = pathname.match(/^\/api\/user\/conversations$/)
  const itemMatch = pathname.match(/^\/api\/user\/conversations\/([^/]+)$/)
  const msgMatch = pathname.match(/^\/api\/user\/conversations\/([^/]+)\/messages$/)

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

function extractAnswerFromSseText(text) {
  if (!text || typeof text !== 'string') return ''
  let answer = ''
  const lines = text.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) continue
    const payload = trimmed.slice(5).trim()
    if (!payload || payload === '[DONE]') continue
    try {
      const obj = JSON.parse(payload)
      const candidate = obj?.data?.answer
      if (typeof candidate === 'string' && candidate.trim()) {
        answer = candidate
      }
    } catch {
      // ignore malformed line
    }
  }
  return answer
}

function extractAnswerFromRagResponse(ragResponse) {
  if (!ragResponse) return ''
  if (typeof ragResponse === 'string') {
    return extractAnswerFromSseText(ragResponse)
  }
  if (typeof ragResponse !== 'object') return ''
  const direct = ragResponse.answer || ragResponse?.data?.answer || ragResponse.message || ragResponse?.data?.message
  if (typeof direct === 'string' && direct.trim()) return direct
  const choiceContent =
    ragResponse?.choices?.[0]?.message?.content
    || ragResponse?.data?.choices?.[0]?.message?.content
  if (typeof choiceContent === 'string' && choiceContent.trim()) {
    return choiceContent
  }
  if (typeof ragResponse?.data === 'string') {
    return extractAnswerFromSseText(ragResponse.data)
  }
  if (typeof ragResponse?.raw === 'string') {
    return extractAnswerFromSseText(ragResponse.raw)
  }
  return ''
}

function extractReferencesFromRagResponse(ragResponse) {
  if (!ragResponse || typeof ragResponse !== 'object') return []
  if (Array.isArray(ragResponse.references)) return ragResponse.references
  if (Array.isArray(ragResponse?.data?.references)) return ragResponse.data.references
  const choiceRef =
    ragResponse?.choices?.[0]?.message?.reference
    || ragResponse?.data?.choices?.[0]?.message?.reference
  if (Array.isArray(choiceRef)) return choiceRef
  return []
}

function writeSse(res, event, data) {
  if (event) {
    res.write(`event: ${event}\n`)
  }
  const text = typeof data === 'string' ? data : JSON.stringify(data ?? {})
  res.write(`data: ${text}\n\n`)
}

function readReviewedArgs(reviewedArgs) {
  if (!reviewedArgs) return {}
  if (typeof reviewedArgs === 'object') return reviewedArgs
  try {
    return JSON.parse(String(reviewedArgs))
  } catch {
    return {}
  }
}

function buildDraftArgs(toolCode, query = '') {
  if (toolCode === 'rag-query') {
    return JSON.stringify({
      query: String(query || '').trim() || '什么是半面积',
    })
  }
  if (toolCode === 'indicator-verification') {
    return JSON.stringify({
      checker: '张三',
      reviewer: '李四',
    })
  }
  return JSON.stringify({})
}

async function handleAgentToolApi(req, res, urlObj) {
  const method = (req.method || 'GET').toUpperCase()
  const userKey = getUserKeyFromAuth(req)
  const draftBucket = ensureToolDraftBucket(userKey)

  if (urlObj.pathname === '/api/v1/agent/tool/catalog' && method === 'GET') {
    return sendJson(res, 200, TOOL_CATALOG)
  }

  if (urlObj.pathname === '/api/v1/agent/tool/draft' && method === 'POST') {
    try {
      const body = parseJsonBody(await readBody(req))
      const toolCode = String(body.toolCode || '').trim()
      const tool = TOOL_CATALOG.find((t) => t.name === toolCode || t.tool_code === toolCode)
      if (!tool) {
        return sendJson(res, 404, { message: 'tool not found' })
      }
      const toolCallId = randomUUID()
      const draft = {
        toolCallId,
        conversationId: String(body.conversationId || ''),
        toolCode: tool.name,
        toolName: tool.tool_name,
        toolSpec: {
          upload_required: !!tool.upload_required,
          parameters_schema: tool.parameters_schema || {},
          accepted_file_types: tool.accepted_file_types || [],
          max_files: tool.max_files || 0,
        },
        draftArgs: buildDraftArgs(tool.name, body.query || ''),
        uploadedFileIds: [],
      }
      draftBucket.set(toolCallId, draft)
      return sendJson(res, 200, draft)
    } catch {
      return sendJson(res, 500, { message: 'create draft failed' })
    }
  }

  if (urlObj.pathname === '/api/v1/agent/tool/upload' && method === 'POST') {
    const toolCallId = String(urlObj.searchParams.get('toolCallId') || '')
    const draft = draftBucket.get(toolCallId)
    if (!toolCallId || !draft) {
      return sendJson(res, 404, { message: 'tool draft not found' })
    }
    try {
      const bodyBuf = await readBody(req)
      const contentType = String(req.headers['content-type'] || '')
      const backendResp = await requestBackendJson(
        '/api/v1/files/upload',
        'POST',
        {
          authorization: String(req.headers.authorization || ''),
          'content-type': contentType,
        },
        bodyBuf,
      )
      if (backendResp.status >= 400) {
        return sendJson(res, backendResp.status, backendResp.json || { message: 'upload failed' })
      }
      const fileId = String(backendResp.json?.fileId || '')
      if (fileId) {
        draft.uploadedFileIds = [...(draft.uploadedFileIds || []), fileId]
        draftBucket.set(toolCallId, draft)
      }
      return sendJson(res, 200, backendResp.json)
    } catch {
      return sendJson(res, 500, { message: 'upload failed' })
    }
  }

  if (urlObj.pathname === '/api/v1/agent/tool/approve' && method === 'POST') {
    try {
      const body = parseJsonBody(await readBody(req))
      const toolCallId = String(body.toolCallId || '')
      const draft = draftBucket.get(toolCallId)
      if (!toolCallId || !draft) {
        return sendJson(res, 404, { message: 'tool draft not found' })
      }
      const reviewedArgs = readReviewedArgs(body.reviewedArgs)
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })
      if (draft.toolCode === 'rag-query') {
        const payload = {
          query: String(reviewedArgs.query || '').trim() || '什么是半面积',
          skillId: 'rag-query',
        }
        if (reviewedArgs.datasetId) payload.datasetId = String(reviewedArgs.datasetId)
        if (reviewedArgs.topK) payload.topK = Number(reviewedArgs.topK)
        const backendResp = await requestBackendJson(
          '/api/v1/rag/query',
          'POST',
          {
            authorization: String(req.headers.authorization || ''),
            'content-type': 'application/json',
          },
          Buffer.from(JSON.stringify(payload)),
        )
        if (backendResp.status >= 400) {
          writeSse(res, 'error', backendResp.json?.message || `HTTP ${backendResp.status}`)
          writeSse(res, null, '[DONE]')
          res.end()
          return
        }
        const answer = extractAnswerFromRagResponse(backendResp.json)
        const references = extractReferencesFromRagResponse(backendResp.json)
        writeSse(res, 'tool_result', {
          toolName: 'rag-query',
          summary: answer || 'RAG 查询完成',
          raw: backendResp.json,
        })
        writeSse(res, 'message', {
          answer: answer || '请求已完成，暂无可展示文本。',
          references,
        })
        writeSse(res, null, '[DONE]')
        res.end()
        return
      }
      if (draft.toolCode === 'indicator-verification') {
        const payload = {
          inputFileIds: draft.uploadedFileIds || [],
          checker: String(reviewedArgs.checker || '张三'),
          reviewer: String(reviewedArgs.reviewer || '李四'),
        }
        if (!Array.isArray(payload.inputFileIds) || payload.inputFileIds.length === 0) {
          writeSse(res, 'error', '该技能需要先上传文件')
          writeSse(res, null, '[DONE]')
          res.end()
          return
        }
        const backendResp = await requestBackendJson(
          '/api/v1/skills/indicator-verification/run',
          'POST',
          {
            authorization: String(req.headers.authorization || ''),
            'content-type': 'application/json',
          },
          Buffer.from(JSON.stringify(payload)),
        )
        if (backendResp.status >= 400) {
          writeSse(res, 'error', backendResp.json?.message || `HTTP ${backendResp.status}`)
          writeSse(res, null, '[DONE]')
          res.end()
          return
        }
        const outputs = Array.isArray(backendResp.json?.outputFiles) ? backendResp.json.outputFiles : []
        const summary = outputs.length > 0
          ? `CAD 技能执行完成，输出 ${outputs.length} 个文件。`
          : 'CAD 技能执行完成。'
        writeSse(res, 'tool_result', {
          toolName: 'indicator-verification',
          summary,
          files: outputs.map((f) => ({
            file_id: f.fileId,
            file_name: f.fileName,
            download_url: `/api/v1/files/${f.fileId}/download`,
          })),
          raw: backendResp.json,
        })
        writeSse(res, 'message', {
          answer: summary,
        })
        writeSse(res, null, '[DONE]')
        res.end()
        return
      }
      writeSse(res, 'error', 'unsupported tool')
      writeSse(res, null, '[DONE]')
      res.end()
      return
    } catch (err) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })
      writeSse(res, 'error', err instanceof Error ? err.message : 'approve failed')
      writeSse(res, null, '[DONE]')
      res.end()
      return
    }
  }

  return sendJson(res, 404, { message: 'not found' })
}

async function handleAgentChatStream(req, res) {
  try {
    const bodyBuffer = await readBody(req)
    const body = parseJsonBody(bodyBuffer)
    const query = String(body.query || '').trim()
    const authHeader = String(req.headers.authorization || '')

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })

    // Call brain-server brain/query endpoint
    const brainPayload = {
      query,
      conversationId: body.conversationId || '',
    }
    const brainBuf = Buffer.from(JSON.stringify(brainPayload), 'utf-8')
    const isHttps = BACKEND_URL.protocol === 'https:'
    const client = isHttps ? httpsRequest : httpRequest

    const brainOptions = {
      protocol: BACKEND_URL.protocol,
      hostname: BACKEND_URL.hostname,
      port: BACKEND_URL.port || (isHttps ? 443 : 80),
      method: 'POST',
      path: '/api/v1/brain/query',
      headers: {
        host: BACKEND_URL.host,
        'Content-Type': 'application/json',
        'Content-Length': String(brainBuf.length),
        authorization: authHeader,
      },
    }

    const brainReq = client(brainOptions, (brainRes) => {
      const statusCode = brainRes.statusCode || 500

      // If not 200, parse error response
      if (statusCode !== 200) {
        const chunks = []
        brainRes.on('data', (c) => chunks.push(c))
        brainRes.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8')
          let errorMsg = `HTTP ${statusCode}`
          try {
            const parsed = JSON.parse(text)
            if (parsed.message) errorMsg = parsed.message
            if (parsed.error === 'unsupported_query_type') {
              // Special case: return error as message event
              writeSse(res, 'message', {
                answer: parsed.message || '该查询类型暂不支持，请使用 CLI 版本进行普通问答。',
              })
              writeSse(res, null, '[DONE]')
              res.end()
              return
            }
          } catch {
            // Use raw text
          }
          res.write(`event: error\ndata: ${errorMsg}\n\n`)
          res.write('data: [DONE]\n\n')
          res.end()
        })
        return
      }

      // Check content type to determine response format
      const contentType = brainRes.headers['content-type'] || ''

      if (contentType.includes('text/event-stream')) {
        // SSE stream - proxy directly, preserving all events including skill_end/rag_content
        brainRes.on('data', (c) => {
          // Direct pipe for SSE - all events should pass through
          res.write(c)
        })
        brainRes.on('end', () => res.end())
        return
      }

      // JSON response - check if it's a skill trigger
      const chunks = []
      brainRes.on('data', (c) => chunks.push(c))
      brainRes.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf-8')
        try {
          const parsed = JSON.parse(text)

          // Handle skill needed response (CAD skill)
          if (parsed.skillNeeded) {
            const toolCallId = randomUUID()
            const userKey = getUserKeyFromAuth(req)
            const draftBucket = ensureToolDraftBucket(userKey)
            const draft = {
              toolCallId,
              conversationId: String(body.conversationId || ''),
              toolCode: parsed.skillName,
              toolName: parsed.skillName,
              toolSpec: {
                upload_required: true,
                parameters_schema: TOOL_CATALOG.find((x) => x.name === parsed.skillName)?.parameters_schema || {},
                accepted_file_types: ['.dxf'],
                max_files: 20,
              },
              draftArgs: JSON.stringify({ checker: '张三', reviewer: '李四' }),
              uploadedFileIds: [],
            }
            draftBucket.set(toolCallId, draft)
            writeSse(res, 'tool_draft', draft)
            writeSse(res, 'message', {
              answer: parsed.message || `已识别 ${parsed.skillName} 技能调用，请上传文件并执行。`,
              skillHint: parsed.skillHint,
            })
            writeSse(res, null, '[DONE]')
            res.end()
            return
          }

          // Handle error response
          if (parsed.error) {
            res.write(`event: error\ndata: ${parsed.message || parsed.error}\n\n`)
            writeSse(res, null, '[DONE]')
            res.end()
            return
          }

          // Handle answer response (direct answer from brain)
          if (parsed.type === 'answer' && parsed.content) {
            writeSse(res, 'message', {
              answer: parsed.content,
            })
            writeSse(res, null, '[DONE]')
            res.end()
            return
          }

          // Unknown response format
          writeSse(res, 'message', {
            answer: '收到未知响应格式，请尝试使用 CLI 版本。',
          })
          writeSse(res, null, '[DONE]')
          res.end()
        } catch {
          res.write(`event: error\ndata: 解析响应失败\n\n`)
          res.write('data: [DONE]\n\n')
          res.end()
        }
      })
    })

    brainReq.on('error', (err) => {
      res.write(`event: error\ndata: ${err?.message || 'brain query failed'}\n\n`)
      res.write('data: [DONE]\n\n')
      res.end()
    })

    brainReq.write(brainBuf)
    brainReq.end()
  } catch (error) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    res.write(`event: error\ndata: ${error instanceof Error ? error.message : 'stream failed'}\n\n`)
    res.write('data: [DONE]\n\n')
    res.end()
  }
}

function sendFile(filePath, res, noCache = false) {
  const extension = extname(filePath)
  const contentType = CONTENT_TYPES[extension] || 'application/octet-stream'
  const stats = statSync(filePath)
  const headers = {
    'Content-Type': contentType,
    'Content-Length': stats.size
  }
  if (noCache) {
    headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    headers.Pragma = 'no-cache'
    headers.Expires = '0'
  }
  res.writeHead(200, headers)
  createReadStream(filePath).pipe(res)
}

function resolveStaticPath(urlPath) {
  const pathname = urlPath.split('?')[0].split('#')[0]
  const cleaned = pathname === '/' ? '/index.html' : pathname
  const safePath = normalize(cleaned).replace(/^(\.\.(\/|\\|$))+/, '')
  return join(DIST_DIR, safePath)
}

const server = createServer((req, res) => {
  const urlPath = req.url || '/'
  const urlObj = new URL(urlPath, 'http://localhost')
  if (urlObj.pathname.startsWith('/api/user/conversations')) {
    handleConversationsApi(req, res, urlObj)
    return
  }
  if (urlObj.pathname === '/api/v1/agent/chat/stream' && (req.method || 'GET').toUpperCase() === 'POST') {
    void handleAgentChatStream(req, res)
    return
  }
  if (urlObj.pathname.startsWith('/api/v1/agent/tool/')) {
    void handleAgentToolApi(req, res, urlObj)
    return
  }
  if (urlPath.startsWith('/api/')) {
    proxyApi(req, res)
    return
  }
  const filePath = resolveStaticPath(urlPath)
  const indexPath = join(DIST_DIR, 'index.html')
  if (existsSync(filePath) && statSync(filePath).isFile()) {
    const noCache = urlPath === '/' || urlPath.startsWith('/index.html')
    sendFile(filePath, res, noCache)
    return
  }
  if (existsSync(indexPath)) {
    sendFile(indexPath, res, true)
    return
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('Not Found')
})

server.listen(PORT, '0.0.0.0')
