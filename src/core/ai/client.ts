import { generateText, type LanguageModel, NoObjectGeneratedError, Output } from 'ai'
import type { z } from 'zod'
import { currentMessages } from '../i18n/index.ts'
import { type CatalogProvider, CUSTOM_PROVIDER } from './catalog.ts'

export class AiConfigError extends Error {}

const ANTHROPIC_API = 'https://api.anthropic.com/v1'
const ANTHROPIC_BROWSER_HEADER = 'anthropic-dangerous-direct-browser-access'

export interface ModelRef {
  provider: CatalogProvider
  modelId: string
  apiKey: string
  /** Overrides the provider's address (proxies); required for the custom endpoint. */
  baseUrl?: string
}

const host = (url: string) => {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

/** Builds a language model; provider packages are loaded only when first needed. */
export async function createModel(ref: ModelRef): Promise<LanguageModel> {
  const { provider, modelId, apiKey } = ref
  const baseURL = ref.baseUrl?.trim() || provider.api || undefined
  const headers = { ...(provider.headers ?? {}) }
  switch (provider.client) {
    case 'anthropic': {
      // The browser header is Anthropic's own opt-in: it goes to Anthropic's host only, never to another server
      // that merely speaks the same protocol (a proxy, MiniMax).
      if (host(baseURL ?? ANTHROPIC_API) === host(ANTHROPIC_API)) headers[ANTHROPIC_BROWSER_HEADER] = 'true'
      else delete headers[ANTHROPIC_BROWSER_HEADER]
      const { createAnthropic } = await import('@ai-sdk/anthropic')
      return createAnthropic({ apiKey, baseURL, headers })(modelId)
    }
    case 'google': {
      const { createGoogle } = await import('@ai-sdk/google')
      return createGoogle({ apiKey, baseURL, headers })(modelId)
    }
    case 'openai': {
      const { createOpenAI } = await import('@ai-sdk/openai')
      return createOpenAI({ apiKey, baseURL, headers })(modelId)
    }
    case 'openrouter': {
      const { createOpenRouter } = await import('@openrouter/ai-sdk-provider')
      return createOpenRouter({ apiKey, baseURL, headers }).chat(modelId)
    }
    case 'openai-compatible': {
      if (!baseURL)
        throw new AiConfigError(
          provider.id === CUSTOM_PROVIDER
            ? currentMessages().ai.errors.enterEndpoint
            : currentMessages().ai.errors.noAddress(provider.name),
        )
      const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible')
      return createOpenAICompatible({
        name: provider.id,
        baseURL,
        headers,
        ...(apiKey ? { apiKey } : {}),
        supportsStructuredOutputs: true,
      }).chatModel(modelId)
    }
  }
}

export interface StructuredRequest<T> {
  system: string
  prompt: string
  schema: z.ZodType<T>
  signal?: AbortSignal
}

/** One structured call: the answer is parsed and checked against `schema`, or the call throws. */
export async function generateStructured<T>(model: LanguageModel, req: StructuredRequest<T>): Promise<T> {
  const res = await generateText({
    model,
    system: req.system,
    prompt: req.prompt,
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
  if (/401|unauthor|invalid.*key|api key/i.test(msg)) return t.keyRefused
  if (/429|rate|quota|credit/i.test(msg)) return t.quota
  if (/failed to fetch|network|load failed|cors/i.test(msg)) return t.unreachable
  if (/\b404\b|model.*(not found|does not exist|unknown)|unknown model|no such model/i.test(msg))
    return t.unknownModel(msg)
  return msg
}
