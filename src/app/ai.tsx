import type { LanguageModel } from 'ai'
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useData } from './data.tsx'

/** Device-only AI settings; stored with the key in the secrets store, never exported. */
export interface AiConfig {
  providerId?: string
  modelId?: string
  /** Overrides the provider's address; required for the custom endpoint. */
  baseUrl?: string
}

const CONFIG_KEY = 'ai.config'
const KEY_KEY = 'ai.key'

interface Ai {
  config: AiConfig
  hasKey: boolean
  /** A provider and model are chosen (and a key, unless it is the keyless custom endpoint). */
  ready: boolean
  save(config: AiConfig, apiKey: string | undefined): Promise<void>
  getKey(): Promise<string>
  /** Builds the configured model; loads the AI code on first use. */
  model(): Promise<LanguageModel>
}

const AiContext = createContext<Ai | null>(null)

export function useAi(): Ai {
  const a = useContext(AiContext)
  if (!a) throw new Error('useAi outside AiProvider')
  return a
}

function parseConfig(raw: string | undefined): AiConfig {
  if (!raw) return {}
  try {
    const v = JSON.parse(raw) as Record<string, unknown>
    const out: AiConfig = {}
    if (typeof v.providerId === 'string' && v.providerId) out.providerId = v.providerId
    if (typeof v.modelId === 'string' && v.modelId) out.modelId = v.modelId
    if (typeof v.baseUrl === 'string' && v.baseUrl) out.baseUrl = v.baseUrl
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
    async (next: AiConfig, apiKey: string | undefined) => {
      await store.putSecret(CONFIG_KEY, JSON.stringify(next))
      if (apiKey !== undefined) await store.putSecret(KEY_KEY, apiKey.trim())
      setConfig(next)
      if (apiKey !== undefined) setHasKey(apiKey.trim() !== '')
    },
    [store],
  )

  const getKey = useCallback(async () => (await store.getSecret(KEY_KEY)) ?? '', [store])

  const model = useCallback(async () => {
    const [{ createModel, AiConfigError }, { loadBundledCatalog, findProvider }] = await Promise.all([
      import('../core/ai/client.ts'),
      import('../core/ai/catalog.ts'),
    ])
    if (!config.providerId || !config.modelId)
      throw new AiConfigError('Choose a provider and a model in Settings › AI.')
    const catalog = await loadBundledCatalog()
    const provider = findProvider(catalog, config.providerId)
    if (!provider)
      throw new AiConfigError('The chosen provider is no longer in the catalog. Choose another in Settings › AI.')
    return createModel({
      provider,
      modelId: config.modelId,
      apiKey: await getKey(),
      ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
    })
  }, [config, getKey])

  const value = useMemo<Ai>(() => {
    const ready = Boolean(config.providerId && config.modelId && (hasKey || config.providerId === 'custom'))
    return { config, hasKey, ready, save, getKey, model }
  }, [config, hasKey, save, getKey, model])

  return <AiContext.Provider value={value}>{children}</AiContext.Provider>
}
