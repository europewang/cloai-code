/**
 * Brain Service - HTTP service wrapper for src brain
 *
 * This service implements the proper brain loop:
 * 1. Receive query from brain-server
 * 2. Call pre-server to get user context (profileId, allowedSkills)
 * 3. Call memory API to get user's memory content
 * 4. Run src brain's query engine with user's memory and context
 * 5. When src brain wants to invoke a skill, it goes through SkillTool
 * 6. SkillTool.checkPermissions uses pre-context from request scope (no extra HTTP calls)
 * 7. Loop until brain decides to answer or max iterations
 *
 * Key insight: We DON'T hardcode skill routing. We let src brain's LLM decide
 * which skill to use based on user's available skills (from pre-context).
 */

import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { getProjectRoot } from 'src/bootstrap/state.js'
import { getCommands } from 'src/commands.js'
import type { Tool, ToolUseContext } from 'src/Tool.js'
import { asSystemPrompt, type SystemPrompt } from 'src/utils/systemPromptType.js'
import { enableConfigs } from 'src/utils/config.js'
import { ensureBootstrapMacro } from 'src/bootstrapMacro.js'
import { query } from 'src/query.js'
import type { Message } from 'src/types/message.js'
import type { PermissionDecision } from 'src/types/permissions.js'
import type { QueryDeps } from 'src/query/deps.js'
import { productionDeps } from 'src/query/deps.js'
import { createFileStateCacheWithSizeLimit } from 'src/utils/fileStateCache.js'
import { SKILL_TOOL_NAME } from 'src/tools/SkillTool/constants.js'
import { setBrainToken, clearBrainToken, getBrainToken } from './client.js'
import type { StructuredSkillResult } from 'src/utils/forkedAgent.js'
import { getMongoDBSkills } from './mongoDBSkills.js'

// Types
type PreContext = {
  allowedSkills?: string[]
  allowedDatasets?: string[]
  profileId?: string
  policyVersion?: string
  memoryScope?: { type: string; profileId?: string }
}

type MemoryContent = {
  profileId: string
  content: string
  memoryScope?: { type: string; profileId?: string }
  policyVersion?: string
}

type BrainRequest = {
  query: string
  conversationId?: string
}

const PORT = Number(process.env.BRAIN_SERVICE_PORT || '3100')
const MAX_LOOPS = 5
const BRAIN_SERVER_BASE_URL = process.env.BRAIN_SERVER_BASE_URL || 'http://127.0.0.1:8091'
const BRAIN_SERVER_ACCESS_TOKEN = process.env.BRAIN_SERVER_ACCESS_TOKEN || ''

/**
 * Request-scoped context for brain service
 * This is set per-request and used by SkillTool.checkPermissions to avoid circular HTTP calls
 */
let requestContext: {
  preContext: PreContext | null
  memoryContent: MemoryContent | null
} = {
  preContext: null,
  memoryContent: null,
}

/**
 * Fetch pre-context from brain-server
 */
async function fetchPreContextFromBrainServer(): Promise<PreContext | null> {
  try {
    const resp = await fetch(`${BRAIN_SERVER_BASE_URL}/api/v1/pre/context`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${getBrainToken()}`,
        'Content-Type': 'application/json',
      },
    })
    if (!resp.ok) return null
    return await resp.json() as PreContext
  } catch {
    return null
  }
}

/**
 * Fetch user's memory content from brain-server
 */
async function fetchMemoryFromBrainServer(profileId: string): Promise<MemoryContent | null> {
  try {
    const resp = await fetch(`${BRAIN_SERVER_BASE_URL}/api/v1/memory/current?profileId=${encodeURIComponent(profileId)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${getBrainToken()}`,
        'Content-Type': 'application/json',
      },
    })
    if (!resp.ok) return null
    return await resp.json() as MemoryContent
  } catch {
    return null
  }
}

/**
 * Create a canUseTool function for brain service that:
 * 1. Uses the preContext.allowedSkills directly (no HTTP calls)
 * 2. Skips SkillTool.checkPermissions's fetchPreContext/authorizeToolCall (would be circular)
 * 3. For rag-query, passes allowedDatasets to the skill execution
 */
function createBrainServiceCanUseTool(
  allowedSkills: string[] | undefined,
  allowedDatasets: string[] | undefined
): (
  tool: Tool,
  input: Record<string, unknown>,
  toolUseContext: ToolUseContext,
  assistantMessage: Message,
  toolUseID: string,
  forceDecision?: PermissionDecision
) => Promise<PermissionDecision> {
  return async (tool, input, toolUseContext, assistantMessage, toolUseID, forceDecision) => {
    // If forced decision, use it
    if (forceDecision) {
      return forceDecision
    }

    // For skill tool, check against pre-context's allowedSkills
    if (tool.name === SKILL_TOOL_NAME) {
      const skillName = input.skill as string
      if (!skillName) {
        return { behavior: 'deny', message: 'No skill name', decisionReason: undefined }
      }

      // Check allowed skills from pre-context (already fetched, no HTTP call needed)
      if (allowedSkills && allowedSkills.length > 0) {
        if (!allowedSkills.includes(skillName)) {
          return {
            behavior: 'deny',
            message: `Skill "${skillName}" is not in your allowed skills list: [${allowedSkills.join(', ')}]`,
            decisionReason: undefined,
          }
        }
      }

      return { behavior: 'allow', decisionReason: undefined }
    }

    // For other tools, allow by default (brain service is internal)
    return { behavior: 'allow', decisionReason: undefined }
  }
}

/**
 * Create appState for brain service with user's allowedSkills
 */
function createBrainServiceAppState(allowedSkills: string[] | undefined) {
  const mcpState = {
    commands: [] as any[],
    clients: [] as { type: string; name: string }[],
  }
  const toolPermissionContext = {
    mode: 'default' as const,
    alwaysAllowRules: {
      command: allowedSkills || [],
      tool: [] as string[],
    },
    additionalWorkingDirectories: new Map<string, string>(),
  }

  return {
    mcp: mcpState,
    toolPermissionContext,
    sessionHooks: new Map<string, { hooks: Record<string, unknown[]> }>(),
    todos: {} as Record<string, unknown>,
  }
}

/**
 * Build system prompt with user's memory and skill context
 */
function buildSystemPromptWithMemory(
  memoryContent: string | null,
  memoryProfileId: string | undefined,
  allowedSkills: string[] | undefined
): SystemPrompt {
  const parts: string[] = [
    `You are a helpful AI assistant with access to skills.

Available skills: ${allowedSkills && allowedSkills.length > 0 ? allowedSkills.join(', ') : 'rag-query, indicator-verification'}

When a user asks a question:
1. If the question requires specific knowledge, domain expertise, or document search → use rag-query skill (e.g., SkillTool with skill="rag-query", args="your question")
2. If the question involves CAD files, area calculations, or indicator verification → use indicator-verification skill
3. Otherwise, answer directly using your general knowledge

IMPORTANT: You have access to the SkillTool. When you need to answer questions about specific knowledge, documents, or domain expertise, you MUST use the SkillTool to call the appropriate skill. Do not answer directly - use the skill tool first, then provide the result to the user.`
  ]

  // Inject user's memory
  if (memoryContent && memoryContent.trim()) {
    parts.push(`# User Memory (${memoryProfileId || 'default'})\n${memoryContent.trim()}`)
  }

  // Add context about available skills
  if (allowedSkills && allowedSkills.length > 0) {
    parts.push(`# Available Skills\nYou have access to the following skills: ${allowedSkills.join(', ')}`)
  }

  return asSystemPrompt(parts)
}

/**
 * Injects structured result (RAG references, citations, images) into the final
 * answer text.  The structured data is appended in a way that:
 * 1. The human-readable summary is at the top (already generated by the model)
 * 2. Raw references are preserved at the bottom so API consumers can extract them
 *
 * The format is intentionally structured so callers can parse it back out:
 * - Human summary comes first
 * - Separator `---REFERENCES---` marks the structured section
 * - JSON block with: answer, referenceCount, references (array), raw (optional)
 */
function injectStructuredResultIntoAnswer(
  answer: string,
  structuredResult: StructuredSkillResult,
): string {
  if (!structuredResult) return answer

  const references = structuredResult.references ?? []
  const refSection =
    references.length > 0
      ? '\n\n---\n\n**引用列表**（共 ' +
        references.length +
        ' 条）\n\n```json\n' +
        JSON.stringify(
          {
            answer: structuredResult.answer ?? answer,
            referenceCount: references.length,
            references: references.map(ref => ({
              document_name: (ref as any).document_name ?? (ref as any).doc_name ?? '未知文档',
              content: (ref as any).content ?? (ref as any).text ?? '',
              url: (ref as any).source ?? (ref as any).url ?? '',
              images: (ref as any).images ?? [],
            })),
            traceId: structuredResult.traceId ?? null,
            chatId: structuredResult.chatId ?? null,
          },
          null,
          2,
        ) +
        '\n```'
      : ''

  return (
    answer.trim() +
    refSection +
    '\n\n*此回答由 RAG 检索增强生成，引用数据已附上。*'
  )
}

/**
 * Process a query through the src brain
 */
async function processQueryThroughBrain(queryText: string): Promise<{ answer: string; loopCount: number; structuredResult?: StructuredSkillResult }> {
  // Enable config reading (required before any config access)
  ensureBootstrapMacro()
  enableConfigs()

  // Step 1: Fetch pre-context from brain-server
  const preCtx = await fetchPreContextFromBrainServer()
  requestContext.preContext = preCtx

  if (!preCtx) {
    return { answer: 'Error: Unable to fetch user context from brain-server', loopCount: 0, structuredResult: undefined }
  }

  // Step 2: Fetch user's memory content
  const memory = preCtx.profileId
    ? await fetchMemoryFromBrainServer(preCtx.profileId)
    : null
  requestContext.memoryContent = memory

  const memoryContent = memory?.content || null
  const memoryProfileId = memory?.profileId || preCtx.profileId

  // Step 3: Build system prompt with memory and skill context
  const systemPrompt = buildSystemPromptWithMemory(
    memoryContent,
    memoryProfileId,
    preCtx.allowedSkills
  )

  // Step 4: Get skill tools and commands
  const { SkillTool } = await import('src/tools/SkillTool/SkillTool.js')
  const { getSkillToolCommands } = await import('src/commands.js')
  const projectRoot = getProjectRoot()
  
  // Get local skill commands from filesystem
  const localSkillCommands = await getSkillToolCommands(projectRoot)
  
  // Get skill commands from MongoDB (via brain-server)
  const mongoSkills = await getMongoDBSkills()
  
  // Combine local and MongoDB skills
  const allSkillCommands = [...localSkillCommands, ...mongoSkills]
  
  // Combine local and MongoDB skills, filter by allowed skills
  const allowedSkillCommands = allSkillCommands.filter(cmd =>
    !preCtx.allowedSkills || preCtx.allowedSkills.length === 0 || preCtx.allowedSkills.includes(cmd.name) || preCtx.allowedSkills.includes(cmd.name.replace(/_/g, '-'))
  )
  const tools: Tool[] = [SkillTool as unknown as Tool]

  // Step 5: Create canUseTool that uses pre-context directly
  const canUseTool = createBrainServiceCanUseTool(preCtx.allowedSkills, preCtx.allowedDatasets)

  // Step 6: Create appState with allowed skills
  const appState = createBrainServiceAppState(preCtx.allowedSkills)

  // Step 7: Run query through src brain
  let messages: Message[] = []
  let loopCount = 0
  let finalAnswer = ''

  while (loopCount < MAX_LOOPS) {
    loopCount++

    const result = await runSingleTurn(
      queryText,
      messages,
      tools,
      systemPrompt,
      appState,
      canUseTool,
      preCtx,
      allowedSkillCommands
    )

    if (result.needsMore) {
      queryText = result.continuePrompt || queryText
      messages = [...messages, {
        type: 'user' as const,
        id: randomUUID(),
        message: { role: 'user', content: result.continuePrompt || '' },
        timestamp: Date.now(),
      }]
      continue
    }

    finalAnswer = result.answer
    // If the skill wrote structured data (e.g., rag-query references), inject
    // them into the final answer so the API consumer can render citations/images.
    if (result.structuredResult) {
      finalAnswer = injectStructuredResultIntoAnswer(finalAnswer, result.structuredResult)
    }
    break
  }

  return { answer: finalAnswer || 'Max iterations reached', loopCount }
}

// Track last event for loop control
let lastStreamEvent: StreamEventType | null = null

async function checkLastEvent(): Promise<StreamEventType | null> {
  return lastStreamEvent
}

type TurnResult = {
  answer: string
  needsMore: boolean
  continuePrompt?: string
  structuredResult?: StructuredSkillResult
}

async function runSingleTurn(
  queryText: string,
  messages: Message[],
  tools: Tool[],
  systemPrompt: SystemPrompt,
  appState: ReturnType<typeof createBrainServiceAppState>,
  canUseTool: ReturnType<typeof createBrainServiceCanUseTool>,
  preCtx: PreContext,
  allowedSkillCommands: any[]
): Promise<TurnResult> {
  // Minimal general-purpose agent definition for forked skill execution
  const generalPurposeAgent = {
    agentType: 'general-purpose' as const,
    whenToUse: 'General-purpose agent for executing skills.',
    source: 'built-in' as const,
    baseDir: 'built-in' as const,
    getSystemPrompt: () => 'You are a skill execution agent. Execute the given skill and return the results.',
    tools: ['*'] as string[],
  }

  const toolUseContext: ToolUseContext = {
    messages,
    getAppState: () => appState as any,
    setAppState: (f: (prev: any) => any) => {
      const prev = appState as any
      const next = f(prev)
      Object.assign(appState, next)
    },
    options: {
      commands: allowedSkillCommands,
      tools,
      mainLoopModel: process.env.ANTHROPIC_MODEL || 'qwen3.5:9b',
      thinkingConfig: { type: 'disabled' },
      mcpClients: [],
      mcpResources: {},
      ideInstallationStatus: null,
      isNonInteractiveSession: true,
      agentDefinitions: { activeAgents: [generalPurposeAgent], allAgents: [generalPurposeAgent] },
    },
    abortController: new AbortController(),
    readFileState: createFileStateCacheWithSizeLimit(100, 25 * 1024 * 1024),
    nestedMemoryAttachmentTriggers: new Set(),
    loadedNestedMemoryPaths: new Set(),
    dynamicSkillDirTriggers: new Set(),
    discoveredSkillNames: new Set(allowedSkillCommands.map(c => c.name)),
    setInProgressToolUseIDs: () => {},
    setResponseLength: () => {},
    updateFileHistoryState: () => {},
    updateAttributionState: () => {},
  }

  const userMessage: Message = {
    type: 'user',
    id: randomUUID(),
    message: { role: 'user', content: queryText },
    timestamp: Date.now(),
  }

  const allMessages = [...messages, userMessage]
  const deps: QueryDeps = productionDeps()

  let answer = ''
  let needsMore = false
  let continuePrompt: string | undefined
  let collectedStructuredResult: StructuredSkillResult | undefined

  try {
    let eventCount = 0
    for await (const event of query({
      messages: allMessages,
      systemPrompt,
      userContext: {},
      systemContext: {},
      canUseTool,
      toolUseContext,
      querySource: 'sdk',
      deps,
    })) {
      eventCount++
      if (event.type === 'assistant') {
        for (const block of event.message.content) {
          if (block.type === 'text') {
            answer += block.text
          }
        }
      } else if (event.type === 'result') {
        answer = (event as any).result || answer
      } else if (event.type === 'tool_result') {
        // Capture structuredResult from forked skill execution (e.g., rag-query references)
        const toolResultData = (event as any).data as {
          structuredResult?: StructuredSkillResult
        } | undefined
        if (toolResultData?.structuredResult) {
          collectedStructuredResult = toolResultData.structuredResult
        }
      }
    }
  } catch (err) {
    console.error('Query error:', err)
    answer = `Error processing query: ${err}`
  }

  return { answer, needsMore, structuredResult: collectedStructuredResult }
}

/**
 * Handle incoming brain query requests - streaming version
 * Streams events as Server-Sent Events (SSE) for real-time output
 */
function handleBrainQueryStream(req: any, res: any): void {
  let body = ''
  req.on('data', (chunk: Buffer) => {
    body += chunk.toString()
  })
  req.on('end', async () => {
    try {
      const request = JSON.parse(body) as BrainRequest

      if (!request.query) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'query is required' }))
        return
      }

      // Extract Authorization header (user's JWT token) from the request
      const authHeader = String(req.headers.authorization || '').replace('Bearer ', '')

      // Set token for SkillTool.checkPermissions to use
      if (authHeader) {
        setBrainToken(authHeader)
      }

      // Set up SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      })

      try {
        // Process through src brain with streaming
        const streamResult = await processQueryThroughBrainStream(request.query, authHeader)

        for await (const event of streamResult) {
          if (event.type === 'chunk') {
            // Text chunk - send as 'message' event with 'answer' field (frontend expects this format)
            res.write(`event: message\ndata: ${JSON.stringify({ answer: event.content })}\n\n`)
          } else if (event.type === 'skill_start') {
            // Skill execution started - send as 'skill_start' event
            res.write(`event: skill_start\ndata: ${JSON.stringify({ type: 'skill_start', skillName: event.skillName })}\n\n`)
          } else if (event.type === 'skill_end') {
            // Skill execution completed - include result, references, and output files
            res.write(`event: skill_end\ndata: ${JSON.stringify({
              type: 'skill_end',
              skillName: event.skillName,
              result: event.result,
              references: event.references || [],
              outputFiles: event.outputFiles || [],
            })}\n\n`)
          } else if (event.type === 'rag_token') {
            // Real-time RAG token streaming - send as 'rag_token' event for immediate display
            res.write(`event: rag_token\ndata: ${JSON.stringify({
              type: 'rag_token',
              skillName: event.skillName,
              delta: event.delta
            })}\n\n`)
          } else if (event.type === 'rag_content') {
            // Structured RAG result - send as 'rag_content' event only
            // (do NOT duplicate to 'message' to avoid frontend showing content twice)
            const structuredData = event.data
            const answer = structuredData?.answer || structuredData?.result || ''
            const references = event.references || structuredData?.references || []
            res.write(`event: rag_content\ndata: ${JSON.stringify({
              type: 'rag_content',
              skillName: event.skillName,
              answer: answer,
              references: references
            })}\n\n`)
          } else if (event.type === 'done') {
            // Final answer from LLM - only send if there's actual content
            if (event.content && event.content.trim()) {
              res.write(`event: message\ndata: ${JSON.stringify({ answer: event.content })}\n\n`)
            }
          } else if (event.type === 'error') {
            // Error occurred
            res.write(`event: error\ndata: ${JSON.stringify({ message: event.message })}\n\n`)
          }
        }

        // Note: done/error events are already sent by processQueryThroughBrainStream
        // No need to send additional [DONE] - the stream ends when the generator completes
        res.end()
      } finally {
        // Always clear the token after the request
        if (authHeader) {
          clearBrainToken()
        }
      }
    } catch (err) {
      console.error('Brain query stream error:', err)
      res.write(`data: ${JSON.stringify({ type: 'error', message: String(err) })}\n\n`)
      res.end()
    }
  })
}

type StreamEventType =
  | { type: 'chunk'; content: string }
  | { type: 'skill_start'; skillName: string }
  | { type: 'skill_end'; skillName: string; result: string; references?: any[]; outputFiles?: any[] }
  | { type: 'rag_token'; skillName: string; delta: string }
  | { type: 'structured_result'; data: StructuredSkillResult }
  | { type: 'rag_content'; skillName: string; data: StructuredSkillResult; answer?: string; references?: any[]; markdown?: string }
  | { type: 'done'; content: string; loopCount: number }
  | { type: 'error'; message: string }

/**
 * Stream query through the src brain - yields events in real-time
 */
async function* processQueryThroughBrainStream(queryText: string, _authHeader: string): AsyncGenerator<StreamEventType, void, unknown> {
  // Enable config reading (required before any config access)
  ensureBootstrapMacro()
  enableConfigs()

  // Step 1: Fetch pre-context from brain-server
  const preCtx = await fetchPreContextFromBrainServer()
  requestContext.preContext = preCtx

  if (!preCtx) {
    yield { type: 'error', message: 'Unable to fetch user context from brain-server' }
    return
  }

  // Step 2: Fetch user's memory content
  const memory = preCtx.profileId
    ? await fetchMemoryFromBrainServer(preCtx.profileId)
    : null
  requestContext.memoryContent = memory

  const memoryContent = memory?.content || null
  const memoryProfileId = memory?.profileId || preCtx.profileId

  // Step 3: Build system prompt with memory and skill context
  const systemPrompt = buildSystemPromptWithMemory(
    memoryContent,
    memoryProfileId,
    preCtx.allowedSkills
  )

  // Step 4: Get skill tools and commands
  const { SkillTool } = await import('src/tools/SkillTool/SkillTool.js')
  const { getSkillToolCommands } = await import('src/commands.js')
  const projectRoot = getProjectRoot()
  
  // Get local skill commands from filesystem
  const localSkillCommands = await getSkillToolCommands(projectRoot)
  
  // Get skill commands from MongoDB (via brain-server)
  const mongoSkills = await getMongoDBSkills()
  
  // Combine local and MongoDB skills
  const allSkillCommands = [...localSkillCommands, ...mongoSkills]
  
  // Combine local and MongoDB skills, filter by allowed skills
  const allowedSkillCommands = allSkillCommands.filter(cmd =>
    !preCtx.allowedSkills || preCtx.allowedSkills.length === 0 || preCtx.allowedSkills.includes(cmd.name) || preCtx.allowedSkills.includes(cmd.name.replace(/_/g, '-'))
  )
  const tools: Tool[] = [SkillTool as unknown as Tool]

  // Step 5: Create canUseTool that uses pre-context directly
  const canUseTool = createBrainServiceCanUseTool(preCtx.allowedSkills, preCtx.allowedDatasets)

  // Step 6: Create appState with allowed skills
  const appState = createBrainServiceAppState(preCtx.allowedSkills)

  // Step 7: Run query through src brain with streaming
  let messages: Message[] = []
  let loopCount = 0
  let hasStructuredResult = false

  while (loopCount < MAX_LOOPS) {
    loopCount++

    let turnHasStructuredResult = false
    
    for await (const event of runSingleTurnStream(
      queryText,
      messages,
      tools,
      systemPrompt,
      appState,
      canUseTool,
      preCtx,
      allowedSkillCommands
    )) {
      yield event
      
      // Track last event for loop control
      lastStreamEvent = event
      
      // Check if this was a structured result (RAG completed)
      // This is tracked by rag_content event type
      if (event.type === 'rag_content' && event.references?.length > 0) {
        // RAG completed - the skill_end already contains the answer
        // No need for second LLM call, just track and exit
        turnHasStructuredResult = true
        hasStructuredResult = true
      }
      
      // If we got a final 'done' event, we're done
      if (event.type === 'done' || event.type === 'error') {
        return
      }
    }

    // If no structured result in this turn and loop count reached max, exit
    if (!turnHasStructuredResult) {
      break
    }
    
    // Structured result found - we already sent the answer via skill_end/rag_content
    // No need for additional LLM summary, exit the loop
    break
  }

  yield { type: 'done', content: '', loopCount }
}

type ExtractedSkillResult = {
  skillName: string
  result: string
  structuredResult?: StructuredSkillResult
  outputFiles?: Array<{ file_name: string; file_id: string; download_url: string }>
}

/**
 * Extract skill result from tool_result content.
 * SkillTool writes structured result to a temp file, and the result
 * contains a reference to that. We need to read the temp file.
 */
function extractSkillResultFromToolResult(block: any): ExtractedSkillResult | null {
  const content = block?.content
  if (!content || typeof content !== 'string') {
    console.error('DEBUG extractToolResult: no content')
    return null
  }

  // The content contains "Skill \"xxx\" completed (forked execution)"
  const match = content.match(/Skill\s+"([^"]+)"\s+completed/)
  if (!match) {
    console.error('DEBUG extractToolResult: no skill match, content preview:', content.substring(0, 200))
    return null
  }

  const skillName = match[1]

  // Extract result text from content
  const resultMatch = content.match(/Result:\s*\n([\s\S]+?)(?:\n\n__STRUCTURED_RESULT__|$)/)
  let result = resultMatch ? resultMatch[1].trim() : content

  // Try to extract structured result from content (embedded by SkillTool.mapToolResultToToolResultBlockParam)
  let structuredResult: StructuredSkillResult | undefined
  const structuredMatch = content.match(/__STRUCTURED_RESULT__:(.+)$/)
  if (structuredMatch) {
    try {
      const parsed = JSON.parse(structuredMatch[1])
      if (parsed && typeof parsed === 'object') {
        structuredResult = parsed as StructuredSkillResult
        console.error('DEBUG extractToolResult: structuredResult extracted, answer length:', parsed.answer?.length, 'references:', parsed.references?.length)
      }
    } catch (e) {
      console.error('DEBUG extractToolResult: parse error:', e)
    }
  } else {
    console.error('DEBUG extractToolResult: no structured result marker found')
  }

  // Extract output files from __OUTPUT_FILES__ marker in result
  const outputFiles: Array<{ file_name: string; file_id: string; download_url: string }> = []
  const outputFilesMatch = result.match(/__OUTPUT_FILES__\s*\n([\s\S]+?)\n__OUTPUT_FILES_END__/)
  if (outputFilesMatch) {
    try {
      const files = JSON.parse(outputFilesMatch[1])
      if (Array.isArray(files)) {
        // Use brain service URL for downloads
        const baseUrl = process.env.BRAIN_SERVICE_URL || 'http://localhost:3100'
        files.forEach((f: any, idx: number) => {
          outputFiles.push({
            file_name: f.file_name || f.fileName || `file-${idx}`,
            file_id: `output-${Date.now()}-${idx}`,
            download_url: `${baseUrl}/api/files/download?filename=${encodeURIComponent(f.file_path || f.filePath || f.file_name)}`
          })
        })
        console.error('DEBUG extractToolResult: found outputFiles:', outputFiles.length)
      }
    } catch (e) {
      console.error('DEBUG extractToolResult: parse outputFiles error:', e)
    }
    // Clean up the result by removing the output files marker
    result = result.replace(/__OUTPUT_FILES__\s*\n[\s\S]+?\n__OUTPUT_FILES_END__/g, '').trim()
  }

  return { skillName, result, structuredResult, outputFiles }
}

/**
 * Read RAG streaming tokens from the temp file written by run_skill.py.
 * This enables real-time RAG token streaming to the frontend.
 */
async function readRagStreamTokens(ragStreamTokensPath: string): Promise<string[]> {
  const tokens: string[] = []
  try {
    const { readFile } = await import('node:fs/promises')
    const content = await readFile(ragStreamTokensPath, 'utf-8')
    const lines = content.split('\n').filter(Boolean)
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line)
        if (parsed.type === 'token' && parsed.delta) {
          tokens.push(parsed.delta)
        }
      } catch {
        // ignore malformed line
      }
    }
  } catch {
    // File doesn't exist or can't be read - return empty
  }
  return tokens
}

async function* runSingleTurnStream(
  queryText: string,
  messages: Message[],
  tools: Tool[],
  systemPrompt: SystemPrompt,
  appState: ReturnType<typeof createBrainServiceAppState>,
  canUseTool: ReturnType<typeof createBrainServiceCanUseTool>,
  preCtx: PreContext,
  allowedSkillCommands: any[]
): AsyncGenerator<StreamEventType, void, unknown> {
  // Minimal general-purpose agent definition for forked skill execution
  const generalPurposeAgent = {
    agentType: 'general-purpose' as const,
    whenToUse: 'General-purpose agent for executing skills.',
    source: 'built-in' as const,
    baseDir: 'built-in' as const,
    getSystemPrompt: () => 'You are a skill execution agent. Execute the given skill and return the results.',
    tools: ['*'] as string[],
  }

  const toolUseContext: ToolUseContext = {
    messages,
    getAppState: () => appState as any,
    setAppState: (f: (prev: any) => any) => {
      const prev = appState as any
      const next = f(prev)
      Object.assign(appState, next)
    },
    options: {
      commands: allowedSkillCommands,
      tools,
      mainLoopModel: process.env.ANTHROPIC_MODEL || 'qwen3.5:9b',
      thinkingConfig: { type: 'disabled' },
      mcpClients: [],
      mcpResources: {},
      ideInstallationStatus: null,
      isNonInteractiveSession: true,
      agentDefinitions: { activeAgents: [generalPurposeAgent], allAgents: [generalPurposeAgent] },
    },
    abortController: new AbortController(),
    readFileState: createFileStateCacheWithSizeLimit(100, 25 * 1024 * 1024),
    nestedMemoryAttachmentTriggers: new Set(),
    loadedNestedMemoryPaths: new Set(),
    dynamicSkillDirTriggers: new Set(),
    discoveredSkillNames: new Set(allowedSkillCommands.map(c => c.name)),
    setInProgressToolUseIDs: () => {},
    setResponseLength: () => {},
    updateFileHistoryState: () => {},
    updateAttributionState: () => {},
  }

  const userMessage: Message = {
    type: 'user',
    id: randomUUID(),
    message: { role: 'user', content: queryText },
    timestamp: Date.now(),
  }

  const allMessages = [...messages, userMessage]
  const deps: QueryDeps = productionDeps()

  let collectedStructuredResult: StructuredSkillResult | undefined
  let hasSkillResult = false

  try {
    for await (const event of query({
      messages: allMessages,
      systemPrompt,
      userContext: {},
      systemContext: {},
      canUseTool,
      toolUseContext,
      querySource: 'sdk',
      deps,
    })) {
      if (event.type === 'assistant') {
        // Stream assistant text chunks
        for (const block of event.message.content) {
          if (block.type === 'text') {
            yield { type: 'chunk', content: block.text }
            lastStreamEvent = { type: 'chunk', content: block.text }
          } else if (block.type === 'tool_use') {
            // Tool call started - check if it's a SkillTool
            const toolBlock = block as any
            if (toolBlock.name === SKILL_TOOL_NAME) {
              const skillInput = toolBlock.input || {}
              const skillName = skillInput.skill || ''
              yield { type: 'skill_start', skillName }
              lastStreamEvent = { type: 'skill_start', skillName }
            }
          }
        }
      } else if (event.type === 'user') {
        // Tool results are yielded as user messages with tool_result content
        const msg = event as Message
        if (msg.message?.content && typeof msg.message.content !== 'string') {
          for (const block of msg.message.content as any[]) {
            if (block?.type === 'tool_result') {
              // Check if this is a SkillTool result
              const toolUseId = block.tool_use_id || ''
              const skillResult = extractSkillResultFromToolResult(block)
              if (skillResult) {
                hasSkillResult = true

                // Read RAG streaming tokens for real-time output
                let ragTokens: string[] = []
                const tmpdirPath = (await import('os')).tmpdir()
                const ragStreamTokensPath = `${tmpdirPath}/skill-rag-stream-${toolUseId.split('_').pop() || 'unknown'}.jsonl`
                try {
                  ragTokens = await readRagStreamTokens(ragStreamTokensPath)
                } catch {
                  // Can't read stream tokens - continue without them
                }

                // Stream RAG tokens in real-time (before skill_end)
                for (const delta of ragTokens) {
                  yield { type: 'rag_token', skillName: skillResult.skillName, delta }
                  lastStreamEvent = { type: 'rag_token', skillName: skillResult.skillName, delta: delta }
                }

                // Extract RAG content and references from structuredResult
                const ragAnswer = skillResult.structuredResult?.answer || skillResult.result || ''
                const ragReferences = skillResult.structuredResult?.references || []
                const ragMarkdown = skillResult.structuredResult?.markdown || ragAnswer

                // Yield skill_end with RAG content (not LLM summarized) and output files
                yield { 
                  type: 'skill_end', 
                  skillName: skillResult.skillName, 
                  result: ragAnswer, 
                  references: ragReferences,
                  outputFiles: skillResult.outputFiles || []
                }
                lastStreamEvent = { 
                  type: 'skill_end', 
                  skillName: skillResult.skillName, 
                  result: ragAnswer, 
                  references: ragReferences,
                  outputFiles: skillResult.outputFiles || []
                }

                // If we have structured result (RAG references), yield it separately for streaming
                if (skillResult.structuredResult && ragReferences.length > 0) {
                  collectedStructuredResult = skillResult.structuredResult
                  // Stream the raw RAG content with references as a separate event
                  yield { 
                    type: 'rag_content', 
                    skillName: skillResult.skillName, 
                    data: skillResult.structuredResult, 
                    answer: ragAnswer, 
                    references: ragReferences, 
                    markdown: ragMarkdown 
                  }
                  lastStreamEvent = { 
                    type: 'rag_content', 
                    skillName: skillResult.skillName, 
                    data: skillResult.structuredResult, 
                    answer: ragAnswer, 
                    references: ragReferences, 
                    markdown: ragMarkdown 
                  }
                }
              }
            }
          }
        }
      } else if (event.type === 'result') {
        // Final result
        const result = (event as any).result || ''
        yield { type: 'done', content: result, loopCount: 0 }
        lastStreamEvent = { type: 'done', content: result, loopCount: 0 }
      }
    }
  } catch (err) {
    console.error('Query stream error:', err)
    yield { type: 'error', message: String(err) }
    lastStreamEvent = { type: 'error', message: String(err) }
  }
}

/**
 * Health check endpoint
 */
function handleHealth(req: any, res: any): void {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({
    status: 'ok',
    service: 'brain-service',
    version: '1.0.0',
  }))
}

/**
 * Start the brain service
 */
export function startBrainService(): void {
  const server = createServer((req, res) => {
    const url = req.url || '/'

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    if (req.method === 'OPTIONS') {
      res.writeHead(200)
      res.end()
      return
    }

    if (url === '/health' || url === '/api/health') {
      handleHealth(req, res)
      return
    }

    if (url === '/api/query' && req.method === 'POST') {
      handleBrainQueryStream(req, res)
      return
    }

    // File download endpoint
    const downloadMatch = url.match(/^\/api\/files\/download\?filename=(.+)$/)
    if (downloadMatch && req.method === 'GET') {
      const filePath = decodeURIComponent(downloadMatch[1])
      console.error('Download request for:', filePath)
      const { createReadStream, existsSync } = require('fs')
      if (existsSync(filePath)) {
        const fileName = filePath.split('/').pop() || 'download'
        const stat = require('fs').statSync(filePath)
        res.setHeader('Content-Type', 'application/octet-stream')
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`)
        res.setHeader('Content-Length', stat.size)
        createReadStream(filePath).pipe(res)
        return
      } else {
        console.error('File not found:', filePath)
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'File not found', path: filePath }))
        return
      }
    }

    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'not found' }))
  })

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Brain service listening on port ${PORT}`)
    console.log(`Brain server: ${BRAIN_SERVER_BASE_URL}`)
    console.log(`Endpoints:`)
    console.log(`  GET  /health    - health check`)
    console.log(`  POST /api/query - brain query (uses src brain with pre-context)`)
  })
}

// Start if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startBrainService()
}

export { processQueryThroughBrain }
