import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Bot, Wrench } from 'lucide-react'
import { getSkillUsageScore, recordSkillUsage } from '../../utils/skillMentions'
import { ChatMessagesPanel } from '../../components/chat/ChatMessagesPanel'
import { ChatComposer } from '../../components/chat/ChatComposer'
import { SourceViewer } from '../../components/chat/SourceViewer'
import { ThoughtBlock } from '../../components/chat/ThoughtBlock'
import { MarkdownWithCitations } from '../../components/chat/MarkdownWithCitations'
import {
  appendAuthToken,
  approveToolCall,
  createConversation,
  createToolDraft,
  fetchConversationMessages,
  fetchConversations,
  fetchToolCatalog,
  loadAuthSession,
  saveConversationMessage,
  startAgentStream,
  uploadToolInputFile,
} from '../../lib/appApi'

function normalizeConversationTitle(item) {
  return item?.name || item?.title || item?.conversationTitle || item?.conversation_id || '未命名会话'
}

function normalizeConversationId(item) {
  return item?.conversationId || item?.conversation_id || item?.id || ''
}

const ChatPage = forwardRef(function ChatPage({ role, username, onConversationsChanged }, ref) {
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
  const [conversationActionLoading, setConversationActionLoading] = useState(false)
  const [viewingRef, setViewingRef] = useState(null)
  const [toolForms, setToolForms] = useState({})
  const [toolPending, setToolPending] = useState({})
  const [toolResults, setToolResults] = useState({})
  const [toolCatalog, setToolCatalog] = useState([])
  const [toolCatalogLoading, setToolCatalogLoading] = useState(false)
  const [toolCatalogError, setToolCatalogError] = useState('')
  const [planDrafts, setPlanDrafts] = useState({})
  const [planUiStates, setPlanUiStates] = useState({})
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [uploadProgress, setUploadProgress] = useState({})
  // --- 对话排序状态（由子侧边栏管理，ChatInterface 内部不再使用，保留以兼容部分逻辑） ---
  const [convOrder, setConvOrder] = useState({ pinned: [], order: [] })
  const [activeConvId, setActiveConvId] = useState(null)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const abortControllerRef = useRef(null)
  const currentRequestIdRef = useRef(0)
  // 上滑加载历史消息时关闭自动滚动到底部，避免视图被强制跳回最新消息。
  const suppressAutoScrollRef = useRef(false)
  const conversationIdRef = useRef('')
  const messagesContainerRef = useRef(null)
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionStart, setMentionStart] = useState(-1)
  const [mentionEnd, setMentionEnd] = useState(-1)
  const [mentionIndex, setMentionIndex] = useState(0)

  // 外部传入的对话ID（来自子侧边栏）
  // 外部触发新建对话
  const handleCreateConversationFromExternal = async () => {
    try {
      setConversationLoading(true)
      setConversationError('')
      const created = await createConversation('新对话')
      const newId = created?.id || created?.conversationId || created?.conversation_id || ''
      if (newId) {
        await handleSwitchConversation(newId)
        setConversations(prev => [{
          id: newId,
          title: '新对话',
          createTime: new Date().toISOString(),
          remainingDays: conversationRetentionDays
        }, ...prev])
      }
    } catch (err) {
      setConversationError(err?.message || '创建会话失败')
    } finally {
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

  useImperativeHandle(ref, () => ({
    triggerNewConversation: () => handleCreateConversationFromExternal(),
    switchToConversation: (convId) => handleSwitchConversation(convId),
    refreshTitle: (convId, title) => {
      setConversations(prev => prev.map(c => c.id === convId ? { ...c, title } : c))
      if (activeConvId === convId) setActiveConversationTitle(title)
    },
    syncConversationsFromApp: (appConvs) => {
      setConversations(appConvs)
    },
  }), [handleCreateConversationFromExternal, handleSwitchConversation])

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
    const rawPayload = item?.metadata?.payload ?? item?.messagePayload ?? item?.message_payload ?? ''
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
    const ragContent = typeof payload?.ragContent === 'string'
      ? payload.ragContent
      : (typeof item?.ragContent === 'string' ? item.ragContent : '')
    const outputFiles = Array.isArray(payload?.outputFiles)
      ? payload.outputFiles
      : (Array.isArray(item?.outputFiles) ? item.outputFiles : [])
    // 解析消息中的附件信息
    const attachments = Array.isArray(payload?.attachments)
      ? payload.attachments
      : (Array.isArray(item?.attachments) ? item.attachments : [])
    const messageId = item?.id ?? item?.messageId ?? item?.message_id ?? item?.recordId ?? item?.record_id ?? null
    return {
      id: messageId,
      role: normalizeMessageRole(item),
      content: normalizeMessageContent(item) || fallbackContent,
      references: refs,
      sourceTag,
      logicFlow,
      skillHint,
      ragContent,
      outputFiles,
      analysisPlan,
      analysisSteps,
      analysisSummary,
      toolDraft,
      clarify,
      attachments
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
      ragContent: typeof msg.ragContent === 'string' ? msg.ragContent : '',
      outputFiles: Array.isArray(msg.outputFiles) ? msg.outputFiles : [],
      analysisPlan: msg.analysisPlan && typeof msg.analysisPlan === 'object' ? msg.analysisPlan : null,
      analysisSteps: Array.isArray(msg.analysisSteps) ? msg.analysisSteps : [],
      analysisSummary: msg.analysisSummary && typeof msg.analysisSummary === 'object' ? msg.analysisSummary : null,
      toolDraft: msg.toolDraft && typeof msg.toolDraft === 'object' ? msg.toolDraft : null,
      clarify: msg.clarify && typeof msg.clarify === 'object' ? msg.clarify : null
    }
    const attachments = Array.isArray(msg.attachments)
      ? msg.attachments
      : (Array.isArray(msg.files) ? msg.files.map(f => ({ name: f.name || f.fileName || '', size: f.size || 0, type: f.type || 'application/octet-stream' })) : [])
    const hasExtra = payload.references.length > 0
      || payload.sourceTag
      || payload.logicFlow
      || payload.skillHint
      || payload.ragContent
      || payload.outputFiles.length > 0
      || payload.analysisPlan
      || payload.analysisSteps.length > 0
      || payload.analysisSummary
      || payload.toolDraft
      || payload.clarify
      || attachments.length > 0
    if (!hasExtra) return ''
    if (attachments.length > 0) {
      payload.attachments = attachments
    }
    return JSON.stringify(payload)
  }

  const buildMessagesAndDraftsFromHistory = useCallback((history, conversationId) => {
    const mappedMessages = (Array.isArray(history) ? history : [])
      .map(item => normalizeMessageFromHistory(item))
      .filter(item => item.content || item.toolDraft)
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
      // 初始化排序状态（从服务器返回顺序）
      setConvOrder(prev => ({
        pinned: prev.pinned || [],
        order: normalizedList.map(c => c.id)
      }))
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
      setActiveConvId(current.id)
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
  const getToolUsageValue = (tool) => {
    const label = getToolDisplayLabel(tool) || tool?.name
    return getSkillUsageScore(username, label)
  }

  const resolveMentionedTool = useCallback((mentionText) => {
    const target = normalizeToolToken(mentionText)
    if (!target) return null
    return toolCatalog.find((tool) => {
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
    }) || null
  }, [toolCatalog])

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
        const usage = getToolUsageValue(tool)
        if (!keyword) return { tool, score: 1, usage }
        if (name.toLowerCase().startsWith(keyword) || displayName.toLowerCase().startsWith(keyword) || toolName.toLowerCase().startsWith(keyword)) return { tool, score: 3, usage }
        if (corpus.includes(keyword)) return { tool, score: 2, usage }
        return null
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        if (b.usage !== a.usage) return b.usage - a.usage
        return String(getToolDisplayLabel(a.tool) || a.tool?.name || '').localeCompare(String(getToolDisplayLabel(b.tool) || b.tool?.name || ''), 'zh-CN')
      })
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

  // 将 @技能名 统一改写成自然语言提示，交给同一条对话链路处理。
  const rewriteSkillMentions = useCallback((text) => {
    const usedToolLabels = []
    const rewritten = String(text || '').replace(/(^|[\s(（])@([^\s@]+)/g, (full, prefix, rawName) => {
      const matchedTool = resolveMentionedTool(rawName)
      if (!matchedTool) return full
      const label = getToolDisplayLabel(matchedTool) || matchedTool.name
      if (!label) return full
      usedToolLabels.push(label)
      return `${prefix}请使用 ${label} 技能`
    })
    return {
      rewrittenText: rewritten,
      usedToolLabels,
    }
  }, [resolveMentionedTool])

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
      hasSkillEndResult: false,
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
        replanOnly
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
            assistantPayloadState.sourceTag = skillName === 'rag-query' ? 'RAG检索' : skillName
          }
          // Store RAG content separately for dedicated block display
          if (answer) {
            assistantPayloadState.hasSkillEndResult = true
            assistantPayloadState.ragContent = answer
            assistantPayloadState.outputFiles = Array.isArray(assistantPayloadState.outputFiles) ? assistantPayloadState.outputFiles : []
            updateStreamingMessage(nextMsgId, old => ({
              content: old.content,
              ragContent: answer,
              references: refs.length > 0 ? refs : (old.references || []),
              sourceTag: assistantPayloadState.sourceTag || old.sourceTag,
              logicFlow: old.logicFlow,
              skillHint: old.skillHint,
              hasRagContent: true,
              outputFiles: Array.isArray(assistantPayloadState.outputFiles) ? assistantPayloadState.outputFiles : (Array.isArray(old.outputFiles) ? old.outputFiles : [])
            }))
          } else {
            // No answer text but still preserve outputFiles
            updateStreamingMessage(nextMsgId, old => ({
              outputFiles: Array.isArray(assistantPayloadState.outputFiles) ? assistantPayloadState.outputFiles : (Array.isArray(old.outputFiles) ? old.outputFiles : [])
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
          const outputFiles = payload.outputFiles || []
          if (refs.length > 0) {
            assistantPayloadState.references = refs
          }
          if (skillName) {
            assistantPayloadState.sourceTag = skillName === 'rag-query' ? 'RAG检索' : skillName
          }
          // Store RAG content separately
          if (result) {
            assistantPayloadState.hasSkillEndResult = true
            assistantPayloadState.ragContent = result
            assistantPayloadState.outputFiles = outputFiles
            updateStreamingMessage(nextMsgId, old => ({
              content: old.content,
              ragContent: result,
              references: refs.length > 0 ? refs : (old.references || []),
              sourceTag: assistantPayloadState.sourceTag || old.sourceTag,
              logicFlow: old.logicFlow,
              skillHint: old.skillHint,
              hasRagContent: true,
              outputFiles: outputFiles
            }))
          } else if (outputFiles.length > 0) {
            // No result text but has output files
            assistantPayloadState.ragContent = `**📥 ${skillName || 'Skill'} 执行完成**\n\n文件已生成，请点击下方下载链接获取结果。`
            assistantPayloadState.outputFiles = outputFiles
            updateStreamingMessage(nextMsgId, old => ({
              ragContent: assistantPayloadState.ragContent,
              outputFiles: outputFiles,
              sourceTag: assistantPayloadState.sourceTag || old.sourceTag,
              hasRagContent: true
            }))
          } else {
            updateStreamingMessage(nextMsgId, old => ({
              outputFiles: outputFiles.length > 0 ? outputFiles : old.outputFiles
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
          // Skip RAG skill summarization - these are already sent via skill_end/rag_content
          // brain-server sends a final 'message' event with source='RAG检索' after skill completes
          if (payload && payload.source === 'RAG检索') {
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
      recordSkillUsage(username, getToolDisplayLabel(tool) || tool.name)
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
    const rawInput = String(mergedInput || '').trim()
    if (!rawInput) return
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

    const { rewrittenText, usedToolLabels } = rewriteSkillMentions(rawInput)
    const finalInput = String(rewrittenText || rawInput).trim()
    const conversationTitle = activeConversationTitle || finalInput.slice(0, 20)
    const filesToUpload = [...uploadedFiles]
    setUploadedFiles([])
    
    // 创建用户消息，包含文件信息用于UI显示
    const userMsg = { 
      role: 'user', 
      content: finalInput,
      isFile: filesToUpload.length > 0,
      fileNames: filesToUpload.map(f => f.name)
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)
    try {
      if (usedToolLabels.length > 0) {
        recordSkillUsage(username, usedToolLabels)
      }
      // 保存用户消息时包含文件信息，以便大脑在读取历史消息时能看到文件关联
      const payloadText = filesToUpload.length > 0
        ? JSON.stringify({
            content: finalInput,
            attachments: filesToUpload.map(f => ({
              name: f.name,
              size: f.size,
              type: f.type || 'application/octet-stream'
            }))
          })
        : ''
      await saveConversationMessage(conversationIdRef.current, 'user', finalInput, conversationTitle, payloadText)
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
      hasSkillEndResult: false,
      skillHint: '',
      analysisPlan: null,
      analysisSteps: [],
      analysisSummary: null,
      toolDraft: null,
      clarify: null
    }

    try {
      const { response, uploaded: uploadedFromStream } = await startAgentStream(conversationIdRef.current, userMsg.content, {
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
            assistantPayloadState.sourceTag = skillName === 'rag-query' ? 'RAG检索' : skillName
          }
          if (answer) {
            assistantPayloadState.ragContent = answer
            assistantPayloadState.outputFiles = Array.isArray(assistantPayloadState.outputFiles) ? assistantPayloadState.outputFiles : []
            updateStreamingMessage(aiMsgId, old => ({
              content: old.content,
              ragContent: answer,
              references: refs.length > 0 ? refs : (old.references || []),
              sourceTag: assistantPayloadState.sourceTag || old.sourceTag,
              logicFlow: old.logicFlow,
              skillHint: old.skillHint,
              hasRagContent: true,
              outputFiles: Array.isArray(assistantPayloadState.outputFiles) ? assistantPayloadState.outputFiles : (Array.isArray(old.outputFiles) ? old.outputFiles : [])
            }))
          } else {
            // No answer text but still preserve outputFiles
            updateStreamingMessage(aiMsgId, old => ({
              outputFiles: Array.isArray(assistantPayloadState.outputFiles) ? assistantPayloadState.outputFiles : (Array.isArray(old.outputFiles) ? old.outputFiles : [])
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
          const outputFiles = payload.outputFiles || []
          if (refs.length > 0) {
            assistantPayloadState.references = refs
          }
          if (skillName) {
            assistantPayloadState.sourceTag = skillName === 'rag-query' ? 'RAG检索' : skillName
          }
          if (result) {
            assistantPayloadState.ragContent = result
            assistantPayloadState.outputFiles = outputFiles
            updateStreamingMessage(aiMsgId, old => ({
              content: old.content,
              ragContent: result,
              references: refs.length > 0 ? refs : (old.references || []),
              sourceTag: assistantPayloadState.sourceTag || old.sourceTag,
              logicFlow: old.logicFlow,
              skillHint: old.skillHint,
              hasRagContent: true,
              outputFiles: outputFiles
            }))
          } else if (outputFiles.length > 0) {
            // No result text but has output files
            assistantPayloadState.ragContent = `**📥 ${skillName || 'Skill'} 执行完成**\n\n文件已生成，请点击下方下载链接获取结果。`
            assistantPayloadState.outputFiles = outputFiles
            updateStreamingMessage(aiMsgId, old => ({
              ragContent: assistantPayloadState.ragContent,
              outputFiles: outputFiles,
              sourceTag: assistantPayloadState.sourceTag || old.sourceTag,
              hasRagContent: true
            }))
          } else {
            updateStreamingMessage(aiMsgId, old => ({
              outputFiles: outputFiles.length > 0 ? outputFiles : old.outputFiles
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
          const outputFiles = payload.outputFiles || []
          if (refs.length > 0) {
            assistantPayloadState.references = refs
          }
          if (skillName) {
            assistantPayloadState.sourceTag = skillName === 'rag-query' ? 'RAG检索' : skillName
          }
          if (result) {
            aiContent = `> **📚 ${skillName || 'Skill'} 执行结果**\n\n${result}`
            if (outputFiles.length > 0) {
              aiContent += '\n\n---\n\n**📥 下载文件:**\n\n'
              outputFiles.forEach(f => {
                aiContent += `- [${f.file_name}](${appendAuthToken(f.download_url)})\n`
              })
            }
            finalAssistantContent = aiContent
            assistantPayloadState.ragContent = result
            assistantPayloadState.outputFiles = outputFiles
            updateStreamingMessage(aiMsgId, old => ({
              content: aiContent,
              ragContent: result,
              references: refs.length > 0 ? refs : (old.references || []),
              sourceTag: assistantPayloadState.sourceTag || old.sourceTag,
              logicFlow: old.logicFlow,
              skillHint: assistantPayloadState.skillHint || old.skillHint,
              hasRagContent: true,
              outputFiles: outputFiles
            }))
          } else if (outputFiles.length > 0) {
            aiContent = `> **📚 ${skillName || 'Skill'} 执行完成**\n\n文件已生成，请点击下方下载链接获取结果。\n\n---\n\n**📥 下载文件:**\n\n`
            outputFiles.forEach(f => {
              aiContent += `- [${f.file_name}](${appendAuthToken(f.download_url)})\n`
            })
            finalAssistantContent = aiContent
            assistantPayloadState.ragContent = `**📥 ${skillName || 'Skill'} 执行完成**\n\n文件已生成，请点击下方下载链接获取结果。`
            assistantPayloadState.outputFiles = outputFiles
            updateStreamingMessage(aiMsgId, old => ({
              content: aiContent,
              ragContent: assistantPayloadState.ragContent,
              outputFiles: outputFiles,
              sourceTag: assistantPayloadState.sourceTag || old.sourceTag,
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
          // Skip RAG skill summarization - these are already sent via skill_end/rag_content
          // brain-server sends a final 'message' event with source='RAG检索' after skill completes
          if (payload && payload.source === 'RAG检索') {
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
          // If skill result was already shown via skill_end, skip appending duplicate LLM summary
          if (assistantPayloadState.hasSkillEndResult && delta.trim()) {
            updateStreamingMessage(aiMsgId, old => ({
              content: aiContent,
              references: refs.length > 0 ? refs : old.references,
              sourceTag: sourceTag || old.sourceTag,
              logicFlow: logicFlow || old.logicFlow,
              skillHint: skillHint || old.skillHint
            }))
            return
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

  const renderClarifyCard = (msg) => {
    if (!msg?.clarify) return null
    return (
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
    )
  }

  const renderPlanDraftCard = (msg) => {
    if (!planDrafts[msg.id]) return null
    const draft = planDrafts[msg.id]
    const uiState = planUiStates[msg.id] || {}
    const expanded = uiState.manualExpanded ? true : uiState.manualCollapsed ? false : !!msg.isStreaming
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
      <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
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
      </div>
    )
  }

  const renderMessageMainContent = (msg) => {
    let rawContent = msg.content || ''
    rawContent = rawContent.replace(/[\r\n]+(?=\s*\[(?:ID:\s*)?\d+\])/g, ' ')

    let answer = rawContent
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
        {msg.preRagContent && (
          <div className="whitespace-pre-wrap">
            {msg.preRagContent}
            {msg.isStreaming && <span className="inline-block w-1 h-3 bg-emerald-400 animate-pulse ml-0.5" />}
          </div>
        )}
        {msg.ragContent && (
          <div className="my-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <Wrench size={14} className="text-amber-600" />
              <span className="text-xs font-semibold text-amber-700">{msg.sourceTag || 'RAG检索结果'}</span>
            </div>
            <div className="text-sm text-amber-900 whitespace-pre-wrap">
              {msg.ragContent}
              {msg.isStreaming && <span className="inline-block w-1 h-3 bg-amber-400 animate-pulse ml-0.5" />}
            </div>
          </div>
        )}
        {msg.postRagContent && (
          <div className="whitespace-pre-wrap">
            {msg.postRagContent}
            {msg.isStreaming && <span className="inline-block w-1 h-3 bg-emerald-400 animate-pulse ml-0.5" />}
          </div>
        )}
        {!msg.preRagContent && !msg.postRagContent && (
          <MarkdownWithCitations
            content={answer}
            references={msg.references}
            onViewReference={setViewingRef}
          />
        )}
        {msg.isStreaming && <span className="inline-block w-1.5 h-4 bg-emerald-400 animate-pulse ml-1 align-middle" />}
      </>
    )
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
      hasSkillEndResult: false,
      skillHint: '',
      outputFiles: []
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
            assistantPayloadState.sourceTag = skillName === 'rag-query' ? 'RAG检索' : skillName
          }
          if (answer) {
            if (aiContent.trim()) {
              aiContent += '\n\n'
            }
            const blockTitle = assistantPayloadState.sourceTag || skillName || 'RAG检索结果'
            aiContent += `> **📚 ${blockTitle}**\n\n`
            aiContent += answer
            finalAssistantContent = aiContent
            assistantPayloadState.outputFiles = Array.isArray(assistantPayloadState.outputFiles) ? assistantPayloadState.outputFiles : []
            updateStreamingMessage(aiMsgId, old => ({
              content: aiContent,
              references: refs.length > 0 ? refs : (old.references || []),
              sourceTag: assistantPayloadState.sourceTag || old.sourceTag,
              logicFlow: old.logicFlow,
              skillHint: old.skillHint,
              hasRagContent: true,
              outputFiles: Array.isArray(assistantPayloadState.outputFiles) ? assistantPayloadState.outputFiles : []
            }))
          } else {
            // No answer text but still preserve outputFiles (from skill_end)
            updateStreamingMessage(aiMsgId, old => ({
              outputFiles: Array.isArray(assistantPayloadState.outputFiles) ? assistantPayloadState.outputFiles : (Array.isArray(old.outputFiles) ? old.outputFiles : [])
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
            assistantPayloadState.sourceTag = skillName === 'rag-query' ? 'RAG检索' : skillName
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
                aiContent += `- [${f.file_name}](${appendAuthToken(f.download_url)})\n`
              })
            }
            finalAssistantContent = aiContent
            assistantPayloadState.outputFiles = outputFiles
            updateStreamingMessage(aiMsgId, old => ({
              content: aiContent,
              references: refs.length > 0 ? refs : (old.references || []),
              sourceTag: assistantPayloadState.sourceTag || old.sourceTag,
              logicFlow: old.logicFlow,
              skillHint: old.skillHint,
              hasRagContent: true,
              outputFiles: outputFiles
            }))
          } else if (outputFiles.length > 0) {
            // No result text but has output files - still show download section
            if (aiContent.trim()) {
              aiContent += '\n\n'
            }
            aiContent += `> **📚 ${skillName || 'Skill'} 执行完成**\n\n`
            aiContent += '文件已生成，请点击下方下载链接获取结果。\n\n---\n\n**📥 下载文件:**\n\n'
            outputFiles.forEach(f => {
              aiContent += `- [${f.file_name}](${appendAuthToken(f.download_url)})\n`
            })
            finalAssistantContent = aiContent
            assistantPayloadState.outputFiles = outputFiles
            updateStreamingMessage(aiMsgId, old => ({
              content: aiContent,
              references: refs.length > 0 ? refs : (old.references || []),
              sourceTag: assistantPayloadState.sourceTag || old.sourceTag,
              logicFlow: old.logicFlow,
              skillHint: old.skillHint,
              hasRagContent: true,
              outputFiles: outputFiles
            }))
          } else {
            // Neither result nor output files - just update outputFiles if any
            updateStreamingMessage(aiMsgId, old => ({
              outputFiles: outputFiles.length > 0 ? outputFiles : old.outputFiles
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
          // Skip RAG skill summarization - these are already sent via skill_end/rag_content
          // brain-server sends a final 'message' event with source='RAG检索' after skill completes
          if (payload && payload.source === 'RAG检索') {
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
          // If skill result was already shown via skill_end, skip appending duplicate LLM summary
          if (assistantPayloadState.hasSkillEndResult && delta.trim()) {
            updateStreamingMessage(aiMsgId, old => ({
              content: aiContent,
              references: refs.length > 0 ? refs : old.references,
              sourceTag: sourceTag || old.sourceTag,
              logicFlow: logicFlow || old.logicFlow,
              skillHint: skillHint || old.skillHint
            }))
            return
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
      // Fallback: if aiContent is empty but we had renderable output (skill_end with empty result)
      if (!aiContent.trim() && hasRenderableOutput) {
        finalAssistantContent = latestToolResult?.summary || '技能执行完成。'
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
      {/* 主聊天区域 */}
      <div className="relative flex-1 flex flex-col h-full shadow-sm bg-white">
        <div className="p-4 border-b bg-white/80 backdrop-blur z-10 sticky top-0">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold text-slate-800 flex items-center gap-2">
              <Bot size={20} className="text-blue-500" />
              智能问答助手
            </h2>
            <div className="text-xs text-slate-500 flex items-center gap-2">
              <span>{activeConversationTitle || '未选择对话'}</span>
            </div>
          </div>
          {conversationError && (
            <div className="mt-2 text-xs text-rose-600">{conversationError}</div>
          )}
        </div>

        <ChatMessagesPanel
          messages={messages}
          messageLoadingMore={messageLoadingMore}
          messagesContainerRef={messagesContainerRef}
          handleMessagesScroll={handleMessagesScroll}
          messagesEndRef={messagesEndRef}
          showScrollToBottom={showScrollToBottom}
          handleScrollToBottom={handleScrollToBottom}
          setViewingRef={setViewingRef}
          ToolDraftProps={{
            toolForms,
            toolPending,
            toolResults,
            onArgChange: handleToolArgChange,
            onFileChange: handleToolFileChange,
            onApprove: handleApproveTool,
          }}
          renderClarify={renderClarifyCard}
          renderPlanDraft={renderPlanDraftCard}
          renderMessageMainContent={renderMessageMainContent}
          appendAuthToken={appendAuthToken}
        />
        
        {viewingRef && (
          <SourceViewer 
            reference={viewingRef} 
            onClose={() => setViewingRef(null)} 
          />
        )}

        <ChatComposer
          inputRef={inputRef}
          input={input}
          setInput={setInput}
          conversationLoading={conversationLoading}
          loading={loading}
          uploadedFiles={uploadedFiles}
          removeUploadedFile={removeUploadedFile}
          mentionOpen={mentionOpen}
          mentionCandidates={mentionCandidates}
          mentionIndex={mentionIndex}
          getToolDisplayLabel={getToolDisplayLabel}
          closeMention={closeMention}
          resolveMentionContext={resolveMentionContext}
          setMentionOpen={setMentionOpen}
          setMentionQuery={setMentionQuery}
          setMentionStart={setMentionStart}
          setMentionEnd={setMentionEnd}
          setMentionIndex={setMentionIndex}
          applyMentionTool={applyMentionTool}
          handleSend={handleSend}
          handleSendButtonClick={handleSendButtonClick}
          handleFileDrop={handleFileDrop}
          handleFileSelect={handleFileSelect}
          handleFolderSelect={handleFolderSelect}
        />
      </div>
    </div>
  )
})

export default ChatPage
