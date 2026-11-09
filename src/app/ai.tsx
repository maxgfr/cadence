import type { LanguageModel, ToolSet } from 'ai'
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ModelRef } from '../core/ai/client.ts'
import { currentMessages } from '../core/i18n/index.ts'
import { useData } from './data.tsx'

/** Device-only AI settings; stored encrypted with the key in the secrets store, never exported. */
export interface AiConfig {
  providerId?: string
  modelId?: string
  /** Overrides the provider's address; required for the custom endpoint. */
  baseUrl?: string
  /** When they were last saved here (ISO): a sync keeps the most recent on both devices. */
  savedAt?: string
}

const CONFIG_KEY = 'ai.config'
const KEY_KEY = 'ai.key'

interface Ai {
  config: AiConfig
  hasKey: boolean
  /** A provider and model are chosen (and a key, unless it is the keyless custom endpoint). */
  ready: boolean
  /** Stores them, dated now, or `savedAt` (as saved on the other device, for a sync). */
  save(config: AiConfig, apiKey: string | undefined, savedAt?: string): Promise<void>
  getKey(): Promise<string>
  /** Builds the configured model; loads the AI code on first use. */
  model(): Promise<LanguageModel>
  /** The configured model's own web search; empty when it has none. */
  searchTools(): Promise<ToolSet>
}

const AiContext = createContext<Ai | null>(null)

export function useAi(): Ai {
  const a = useContext(AiContext)
  if (!a) throw new Error('useAi outside AiProvider')
  return a
}

export function parseConfig(raw: string | undefined): AiConfig {
  if (!raw) return {}
  try {
    const v = JSON.parse(raw) as Record<string, unknown>
    const out: AiConfig = {}
    if (typeof v.providerId === 'string' && v.providerId) out.providerId = v.providerId
    if (typeof v.modelId === 'string' && v.modelId) out.modelId = v.modelId
    if (typeof v.baseUrl === 'string' && v.baseUrl) out.baseUrl = v.baseUrl
    if (typeof v.savedAt === 'string' && v.savedAt) out.savedAt = v.savedAt
    return out
  } catch {
    return {}
  }
}

export function AiProvider({ children }: { children: ReactNode }) {
  const { store } = useData()
  const [config, setConfig] = useState<AiConfig>({})
  const [hasKey, setHasKey] = useState(false)

  useEffect(() => {
    Promise.all([store.getSecret(CONFIG_KEY), store.getSecret(KEY_KEY)]).then(([c, k]) => {
      setConfig(parseConfig(c))
      setHasKey(Boolean(k))
    })
  }, [store])

  const save = useCallback(
    async (config: AiConfig, apiKey: string | undefined, savedAt = new Date().toISOString()) => {
      const next = { ...config, savedAt }
      // The key first: when it cannot be stored, nothing claims to be set up.
      if (apiKey !== undefined) await store.putSecret(KEY_KEY, apiKey.trim())
      await store.putSecret(CONFIG_KEY, JSON.stringify(next))
      setConfig(next)
      if (apiKey !== undefined) setHasKey(apiKey.trim() !== '')
    },
    [store],
  )

  const getKey = useCallback(async () => (await store.getSecret(KEY_KEY)) ?? '', [store])

  const modelRef = useCallback(async (): Promise<ModelRef> => {
    const [{ AiConfigError }, { loadBundledCatalog, findProvider }] = await Promise.all([
      import('../core/ai/client.ts'),
      import('../core/ai/catalog.ts'),
    ])
    if (!config.providerId || !config.modelId) throw new AiConfigError(currentMessages().ai.errors.notSetUp)
    const catalog = await loadBundledCatalog()
    const provider = findProvider(catalog, config.providerId)
    if (!provider) throw new AiConfigError(currentMessages().ai.errors.providerGone)
    return {
      provider,
      modelId: config.modelId,
      apiKey: await getKey(),
      ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
    }
  }, [config, getKey])

  const model = useCallback(async () => {
    const { createModel } = await import('../core/ai/client.ts')
    return createModel(await modelRef())
  }, [modelRef])

  const searchTools = useCallback(async () => {
    const { searchToolsFor } = await import('../core/ai/client.ts')
    return searchToolsFor(await modelRef())
  }, [modelRef])

  const value = useMemo<Ai>(() => {
    const ready = Boolean(config.providerId && config.modelId && (hasKey || config.providerId === 'custom'))
    return { config, hasKey, ready, save, getKey, model, searchTools }
  }, [config, hasKey, save, getKey, model, searchTools])

  return <AiContext.Provider value={value}>{children}</AiContext.Provider>
}
