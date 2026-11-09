import { generateText, type LanguageModel, type ModelMessage, NoObjectGeneratedError, Output, type ToolSet } from 'ai'
import {
  describeError,
  hasProvider,
  type LlmSettings,
  loadModel,
  registerProvider,
  resolveCapabilities,
  webSearchTools,
} from 'llm-connect'
import type { z } from 'zod'
import { currentMessages } from '../i18n/index.ts'
import { type CatalogProvider, type ClientKind, CUSTOM_PROVIDER } from './catalog.ts'

export class AiConfigError extends Error {}

export interface ModelRef {
  provider: CatalogProvider
  modelId: string
  apiKey: string
  /** Overrides the provider's address (proxies); required for the custom endpoint. */
  baseUrl?: string
}

/** The package `llm-connect` calls each of our clients with. OpenRouter keeps its own SDK, registered below. */
const NPM: Record<ClientKind, string> = {
  anthropic: '@ai-sdk/anthropic',
  google: '@ai-sdk/google',
  openai: '@ai-sdk/openai',
  openrouter: '@openrouter/ai-sdk-provider',
  'openai-compatible': '@ai-sdk/openai-compatible',
}

/**
 * The settings `llm-connect` builds a model from: the user's endpoint, or a catalog provider with its address
 * (overridden by the user's own) and the headers its CORS preflight needs.
 */
export function toLlmSettings(ref: ModelRef): LlmSettings {
  const { provider, modelId, apiKey } = ref
  const baseUrl = ref.baseUrl?.trim() || undefined
  const headers = provider.headers && Object.keys(provider.headers).length > 0 ? { ...provider.headers } : undefined
  if (provider.id === CUSTOM_PROVIDER) {
    if (!baseUrl) throw new AiConfigError(currentMessages().ai.errors.enterEndpoint)
    return { apiKey, model: modelId, customEndpoint: baseUrl, customModel: modelId, ...(headers ? { headers } : {}) }
  }
  const api = baseUrl ?? provider.api
  if (provider.client === 'openai-compatible' && !api)
    throw new AiConfigError(currentMessages().ai.errors.noAddress(provider.name))
  return {
    apiKey,
    model: modelId,
    providerId: provider.id,
    providerName: provider.name,
    providerNpm: NPM[provider.client],
    ...(api ? { providerApi: api } : {}),
    ...(headers ? { headers } : {}),
  }
}

/** OpenRouter through its own SDK (its structured output and routing), behind `llm-connect`'s guarded fetch. */
async function registerOpenRouter(): Promise<void> {
  if (hasProvider(NPM.openrouter)) return
  const { createOpenRouter } = await import('@openrouter/ai-sdk-provider')
  registerProvider(NPM.openrouter, (config) =>
    createOpenRouter({
      apiKey: config.apiKey,
      ...(config.baseURL ? { baseURL: config.baseURL } : {}),
      ...(config.headers ? { headers: config.headers } : {}),
      // The SDK only calls it; Bun's `typeof fetch` adds a `preconnect` no SDK uses.
      ...(config.fetch ? { fetch: config.fetch as typeof fetch } : {}),
    }).chat(config.model),
  )
}

/**
 * Builds a language model through `llm-connect`: each provider's request rules (Anthropic's browser header to its
 * own host only, no `user-agent` for CORS, compatible base URLs, structured output on JSON-object APIs). Provider
 * packages are loaded only when first needed.
 */
export async function createModel(ref: ModelRef): Promise<LanguageModel> {
  const settings = toLlmSettings(ref)
  if (ref.provider.client === 'openrouter' && ref.provider.id !== CUSTOM_PROVIDER) await registerOpenRouter()
  return loadModel(settings)
}

/**
 * The provider's own web search for this model, or nothing when it has none. A user's own address may not be the
 * provider, so it gets none either.
 */
export async function searchToolsFor(ref: ModelRef): Promise<ToolSet> {
  if (ref.provider.id === CUSTOM_PROVIDER || ref.baseUrl?.trim()) return {}
  const model = ref.provider.models.find((m) => m.id === ref.modelId)
  const { webSearch } = resolveCapabilities({
    kind: ref.provider.client,
    modelId: ref.modelId,
    catalog: { toolCall: model?.structured ?? false },
  })
  return webSearchTools(webSearch, { maxUses: 3 })
}

export interface StructuredRequest<T> {
  system: string
  /** One message; or a conversation in `messages` (with audio parts), which wins when given. */
  prompt: string
  messages?: ModelMessage[]
  schema: z.ZodType<T>
  signal?: AbortSignal
}

/** One structured call: the answer is parsed and checked against `schema`, or the call throws. */
export async function generateStructured<T>(model: LanguageModel, req: StructuredRequest<T>): Promise<T> {
  const res = await generateText({
    model,
    system: req.system,
    ...(req.messages ? { messages: req.messages } : { prompt: req.prompt }),
    output: Output.object({ schema: req.schema }),
    abortSignal: req.signal,
  })
  return res.output
}

/** A sentence the user can act on, for any failure of a call. */
export function describeAiError(e: unknown): string {
  const t = currentMessages().ai.errors
  if (e instanceof AiConfigError) return e.message
  if (NoObjectGeneratedError.isInstance(e)) return t.notUsable
  const msg = e instanceof Error ? e.message : String(e)
  if (/abort/i.test(msg)) return t.stopped
  // The provider's answer, classified by `llm-connect` (its message never holds the key).
  const err = describeError(e)
  switch (err.code) {
    case 'auth':
      return t.keyRefused
    case 'auth-or-network':
      return t.unreachable
    case 'rate-limit':
      return t.quota
    case 'overloaded':
    case 'server':
      return t.busy
    case 'context-length':
      return t.tooLong
    case 'not-found':
      return t.unknownModel(err.message)
  }
  // Errors thrown before any request (or by a provider SDK in its own words).
  if (/401|unauthor|invalid.*key|api key/i.test(msg)) return t.keyRefused
  if (/429|rate|quota|credit/i.test(msg)) return t.quota
  if (/failed to fetch|network|load failed|cors/i.test(msg)) return t.unreachable
  if (/\b404\b|model.*(not found|does not exist|unknown)|unknown model|no such model/i.test(msg))
    return t.unknownModel(msg)
  return msg
}
