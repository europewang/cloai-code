import { getSecureStorage } from './secureStorage/index.js'

export type CompatibleProviderKind = 'anthropic-like' | 'openai-like'
export type OpenAIAuthMode = 'chat-completions' | 'responses' | 'oauth'
export type AnthropicAuthMode = 'api-key'
export type ProviderAuthMode = AnthropicAuthMode | OpenAIAuthMode

export type ActiveCustomApiEndpoint = {
  kind?: CompatibleProviderKind
  providerId?: string
  authMode?: ProviderAuthMode
  baseURL?: string
  apiKey?: string
  model?: string
  savedModels?: string[]
}

export type ProviderReasoningConfig = {
  reasoningEffort?: string
  reasoningSummary?: string | null
  textVerbosity?: string | null
}

export type ProviderConfig = {
  id: string
  kind: CompatibleProviderKind
  authMode: ProviderAuthMode
  baseURL?: string
  apiKey?: string
  models: string[]
  reasoning?: ProviderReasoningConfig
}

export type CustomApiStorageData = {
  activeProvider?: string
  activeModel?: string
  activeAuthMode?: ProviderAuthMode
  providers?: ProviderConfig[]
  provider?: 'anthropic' | 'openai'
  providerKind?: CompatibleProviderKind
  providerId?: string
  authMode?: ProviderAuthMode
  baseURL?: string
  apiKey?: string
  model?: string
  savedModels?: string[]
}

const CUSTOM_API_STORAGE_KEY = 'customApiEndpoint'

function dedupeModels(models: unknown): string[] {
  if (!Array.isArray(models)) return []
  return [...new Set(models.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean))]
}

export function deriveProviderId(
  baseURL: string | undefined,
  kind: CompatibleProviderKind,
): string {
  if (!baseURL) {
    return kind === 'openai-like' ? 'openai' : 'anthropic'
  }

  try {
    const url = new URL(baseURL)
    let host = url.hostname
      .replace(/^api[.-]/, '')
      .replace(/^openai[.-]/, '')
      .replace(/^claude[.-]/, '')
      .replace(/^www\./, '')

    const parts = host.split('.').filter(Boolean)
    const providerId = parts[0]?.toLowerCase()

    return providerId || (kind === 'openai-like' ? 'openai' : 'anthropic')
  } catch {
    return (baseURL
      .replace(/^https?:\/\//, '')
      .replace(/[:/].*$/, '')
      .replace(/^api[.-]/, '')
      .replace(/^openai[.-]/, '')
      .replace(/^claude[.-]/, '')
      .replace(/^www\./, '')
      .split('.')[0] ||
      (kind === 'openai-like' ? 'openai' : 'anthropic'))
      .toLowerCase()
  }
}

function normalizeProviderKind(value: unknown): CompatibleProviderKind | null {
  return value === 'anthropic-like' || value === 'openai-like' ? value : null
}

function normalizeLegacyProviderKind(value: unknown): CompatibleProviderKind {
  return value === 'openai' ? 'openai-like' : 'anthropic-like'
}

function normalizeProviderReasoning(value: unknown): ProviderReasoningConfig | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const reasoningEffort = typeof record.reasoningEffort === 'string' ? record.reasoningEffort : undefined
  const reasoningSummary =
    typeof record.reasoningSummary === 'string' || record.reasoningSummary === null
      ? (record.reasoningSummary as string | null)
      : undefined
  const textVerbosity =
    typeof record.textVerbosity === 'string' || record.textVerbosity === null
      ? (record.textVerbosity as string | null)
      : undefined
  if (
    reasoningEffort === undefined &&
    reasoningSummary === undefined &&
    textVerbosity === undefined
  ) {
    return undefined
  }
  return {
    ...(reasoningEffort !== undefined ? { reasoningEffort } : {}),
    ...(reasoningSummary !== undefined ? { reasoningSummary } : {}),
    ...(textVerbosity !== undefined ? { textVerbosity } : {}),
  }
}

function buildProviderSummary(
  provider: ProviderConfig | undefined,
  activeModel: string | undefined,
): Pick<
  CustomApiStorageData,
  'provider' | 'providerKind' | 'providerId' | 'authMode' | 'baseURL' | 'apiKey' | 'model' | 'savedModels'
> {
  return {
    provider: provider?.kind === 'openai-like' ? 'openai' : provider?.kind === 'anthropic-like' ? 'anthropic' : undefined,
    providerKind: provider?.kind,
    providerId: provider?.id,
    authMode: provider?.authMode,
    baseURL: provider?.baseURL,
    apiKey: provider?.apiKey,
    model: activeModel,
    savedModels: provider?.models,
  }
}

function normalizeProviderConfig(value: Record<string, unknown>): ProviderConfig | null {
  const kind = normalizeProviderKind(value.kind) ?? normalizeProviderKind(value.id)
  if (!kind) return null
  const baseURL = typeof value.baseURL === 'string' ? value.baseURL : undefined
  const authMode = typeof value.authMode === 'string' ? value.authMode : kind === 'openai-like' ? 'chat-completions' : 'api-key'
  const id = typeof value.id === 'string' && value.id !== kind ? value.id : deriveProviderId(baseURL, kind)
  return {
    id,
    kind,
    authMode: authMode as ProviderAuthMode,
    baseURL,
    apiKey: typeof value.apiKey === 'string' ? value.apiKey : undefined,
    models: dedupeModels(value.models),
    reasoning: normalizeProviderReasoning(value.reasoning),
  }
}

function migrateLegacyShape(value: Record<string, unknown>): CustomApiStorageData {
  const kind = normalizeLegacyProviderKind(value.provider)
  const baseURL = typeof value.baseURL === 'string' ? value.baseURL : undefined
  const providerId = deriveProviderId(baseURL, kind)
  const legacyModel = typeof value.model === 'string' ? value.model : undefined
  const legacySaved = dedupeModels(value.savedModels)
  const models = [...new Set([...(legacyModel ? [legacyModel] : []), ...legacySaved])]
  const provider = {
    id: providerId,
    kind,
    authMode: kind === 'openai-like' ? 'chat-completions' : 'api-key',
    baseURL,
    apiKey: typeof value.apiKey === 'string' ? value.apiKey : undefined,
    models,
  }
  return {
    activeProvider: providerId,
    activeModel: legacyModel,
    activeAuthMode: provider.authMode,
    providers: [provider],
    ...buildProviderSummary(provider, legacyModel),
  }
}

export function readCustomApiStorage(): CustomApiStorageData {
  const storage = getSecureStorage() as {
    read?: () => Record<string, unknown> | null
    update?: (data: Record<string, unknown>) => { success: boolean }
  }
  const data = storage.read?.() ?? {}
  const raw = data[CUSTOM_API_STORAGE_KEY]
  if (!raw || typeof raw !== 'object') return {}
  const value = raw as Record<string, unknown>
  if (!Array.isArray(value.providers)) {
    return migrateLegacyShape(value)
  }
  const providers = value.providers.map(item => item && typeof item === 'object' ? normalizeProviderConfig(item as Record<string, unknown>) : null).filter((item): item is ProviderConfig => item !== null)
  const activeProvider = typeof value.activeProvider === 'string' ? value.activeProvider : typeof value.providerId === 'string' ? value.providerId : providers[0]?.id
  const activeModel = typeof value.activeModel === 'string' ? value.activeModel : typeof value.model === 'string' ? value.model : undefined
  const activeAuthMode = typeof value.activeAuthMode === 'string'
    ? value.activeAuthMode as ProviderAuthMode
    : typeof value.authMode === 'string'
      ? value.authMode as ProviderAuthMode
      : undefined
  const currentProvider = providers.find(provider =>
    provider.id === activeProvider &&
    provider.authMode === activeAuthMode &&
    provider.models.includes(activeModel ?? ''),
  ) ?? providers.find(provider =>
    provider.id === activeProvider &&
    provider.models.includes(activeModel ?? ''),
  ) ?? providers.find(provider => provider.id === activeProvider) ?? providers.find(provider => provider.models.includes(activeModel ?? '')) ?? providers[0]
  return {
    activeProvider: currentProvider?.id ?? activeProvider,
    activeModel,
    activeAuthMode: currentProvider?.authMode ?? activeAuthMode,
    providers,
    ...buildProviderSummary(currentProvider, activeModel),
  }
}

export function writeCustomApiStorage(next: CustomApiStorageData): void {
  const storage = getSecureStorage() as {
    read?: () => Record<string, unknown> | null
    update?: (data: Record<string, unknown>) => { success: boolean }
  }
  const current = storage.read?.() ?? {}
  storage.update?.({
    ...current,
    customApiEndpoint: next,
  })
}

export function clearCustomApiStorage(): void {
  const storage = getSecureStorage() as {
    read?: () => Record<string, unknown> | null
    update?: (data: Record<string, unknown>) => { success: boolean }
  }
  const current = storage.read?.() ?? {}
  const { customApiEndpoint: _, ...rest } = current
  storage.update?.(rest)
}
