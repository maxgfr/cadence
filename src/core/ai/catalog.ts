import { z } from 'zod'

/**
 * The AI model catalog: providers a web page can call directly (checked with a CORS preflight from the app's
 * origin at build time by `scripts/build-catalog.ts`, with `llm-models`), each with its models.
 */

export const CATALOG_VERSION = 1

/** The client package that speaks to a provider. */
export const ClientKind = z.enum(['anthropic', 'openai', 'google', 'openrouter', 'openai-compatible'])
export type ClientKind = z.infer<typeof ClientKind>

export const CatalogModel = z.object({
  id: z.string(),
  name: z.string(),
  /** Structured output or tool calling: what program generation needs. */
  structured: z.boolean(),
  context: z.number().optional(),
  /** USD per million tokens, input then output. */
  cost: z.tuple([z.number(), z.number()]).optional(),
  released: z.string().optional(),
})
export type CatalogModel = z.infer<typeof CatalogModel>

export const CatalogProvider = z.object({
  id: z.string(),
  name: z.string(),
  client: ClientKind,
  api: z.string().optional(),
  /** Headers the provider requires before a browser may read its answers. */
  headers: z.record(z.string(), z.string()).optional(),
  doc: z.string().optional(),
  models: z.array(CatalogModel),
})
export type CatalogProvider = z.infer<typeof CatalogProvider>

export const Catalog = z.object({
  version: z.literal(CATALOG_VERSION),
  builtAt: z.string(),
  providers: z.array(CatalogProvider),
})
export type Catalog = z.infer<typeof Catalog>

/** Provider id of the user's own OpenAI-compatible endpoint (Ollama, LM Studio, a proxy). */
export const CUSTOM_PROVIDER = 'custom'

export const CUSTOM_PROVIDER_INFO: CatalogProvider = {
  id: CUSTOM_PROVIDER,
  name: 'Custom endpoint (OpenAI-compatible)',
  client: 'openai-compatible',
  models: [],
}

/** Offered first: the big vendors' own APIs and the main aggregator. */
export const RECOMMENDED_PROVIDERS: readonly string[] = ['anthropic', 'openai', 'google', 'openrouter', 'mistral']

/** Which client speaks to a provider, from its id and npm package; undefined when none of ours does. */
export function clientFor(p: {
  id: string
  npm?: string | undefined
  api?: string | undefined
}): ClientKind | undefined {
  if (p.id === 'anthropic' || p.npm === '@ai-sdk/anthropic') return 'anthropic'
  if (p.id === 'openai' || p.npm === '@ai-sdk/openai') return 'openai'
  if (p.id === 'google' || p.npm === '@ai-sdk/google') return 'google'
  if (p.id === 'openrouter' || p.npm === '@openrouter/ai-sdk-provider') return 'openrouter'
  if (p.npm === '@ai-sdk/openai-compatible' || p.api) return 'openai-compatible'
  return undefined
}

/** The catalog bundled with the app, in its own lazily loaded chunk. */
export async function loadBundledCatalog(): Promise<Catalog> {
  const mod = await import('./catalog.json')
  return Catalog.parse(mod.default)
}

/** Providers in the order the picker shows them: recommended first, then by name. */
export function sortedProviders(catalog: Catalog): CatalogProvider[] {
  const rank = (id: string) => {
    const i = RECOMMENDED_PROVIDERS.indexOf(id)
    return i < 0 ? RECOMMENDED_PROVIDERS.length : i
  }
  return [...catalog.providers].sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name))
}

/** Models in the order the picker shows them: structured output first, newest first. */
export function sortedModels(provider: CatalogProvider): CatalogModel[] {
  return [...provider.models].sort(
    (a, b) =>
      Number(b.structured) - Number(a.structured) ||
      (b.released ?? '').localeCompare(a.released ?? '') ||
      a.name.localeCompare(b.name),
  )
}

export function findProvider(catalog: Catalog, id: string): CatalogProvider | undefined {
  if (id === CUSTOM_PROVIDER) return CUSTOM_PROVIDER_INFO
  return catalog.providers.find((p) => p.id === id)
}

/**
 * Fresh model lists through `llm-models` in the browser (models.dev answers any origin). Browser reachability
 * cannot be probed from a page, so only providers the bundled catalog already vetted are kept, with their
 * vetted address and headers.
 */
export async function refreshCatalog(previous: Catalog, now: Date = new Date()): Promise<Catalog> {
  const { listProviders } = await import('llm-models/browser')
  const fresh = await listProviders()
  const byId = new Map(fresh.map((p) => [p.id, p]))
  const providers = previous.providers.map((old) => {
    const p = byId.get(old.id)
    if (!p) return old
    const models = toCatalogModels(p.id, p.models)
    return { ...old, models: models.length > 0 ? models : old.models }
  })
  return { version: CATALOG_VERSION, builtAt: now.toISOString(), providers }
}

export interface ModelInfoLike {
  id: string
  name: string
  sources?: { openrouter?: boolean; models_dev?: boolean }
  /** The provider's own id, from llm-models once it publishes it (maxgfr/llm-models#3); null-ish when not served. */
  api_id?: string
  context_length?: number
  cost?: { input: number; output: number }
  capabilities?: { structured_output?: boolean; tool_call?: boolean }
  release_date?: string
}

/**
 * The id the provider's own API expects. `llm-models` lists models as `<provider>/<model>` and folds OpenRouter's
 * variants (`:batch`, dotted names) into the vendor's list; only models.dev entries are the provider's own, and their
 * native id is the part after the prefix. OpenRouter's list is its own API's ids either way.
 */
export function nativeModelId(providerId: string, m: ModelInfoLike): string | undefined {
  if ('api_id' in m) return m.api_id
  const prefix = `${providerId}/`
  if (providerId === 'openrouter')
    return m.sources?.models_dev && m.id.startsWith(prefix) ? m.id.slice(prefix.length) : m.id
  if (m.sources && !m.sources.models_dev) return undefined
  return m.id.startsWith(prefix) ? m.id.slice(prefix.length) : m.id
}

/** The provider's models as the catalog keeps them: native ids only. */
export function toCatalogModels(providerId: string, models: readonly ModelInfoLike[]): CatalogModel[] {
  const out: CatalogModel[] = []
  const seen = new Set<string>()
  for (const m of models) {
    const id = nativeModelId(providerId, m)
    if (id === undefined || seen.has(id)) continue
    seen.add(id)
    out.push(toCatalogModel({ ...m, id }))
  }
  return out
}

export function toCatalogModel(m: ModelInfoLike): CatalogModel {
  const out: CatalogModel = {
    id: m.id,
    name: m.name,
    structured: Boolean(m.capabilities?.structured_output || m.capabilities?.tool_call),
  }
  if (m.context_length) out.context = m.context_length
  if (m.cost) out.cost = [m.cost.input, m.cost.output]
  if (m.release_date) out.released = m.release_date
  return out
}
