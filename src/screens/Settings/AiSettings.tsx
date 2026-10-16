import { Eye, EyeOff, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { useAi } from '../../app/ai.tsx'
import {
  type Catalog,
  CUSTOM_PROVIDER,
  CUSTOM_PROVIDER_INFO,
  findProvider,
  loadBundledCatalog,
  refreshCatalog,
  sortedModels,
  sortedProviders,
} from '../../core/ai/catalog.ts'
import { createModel, describeAiError, generateStructured } from '../../core/ai/client.ts'
import { Button } from '../../ui/components/Button.tsx'
import { Field } from '../../ui/components/Field.tsx'
import { IconButton } from '../../ui/components/IconButton.tsx'
import { SelectField } from '../../ui/components/SelectField.tsx'
import { Screen } from '../../ui/shell/Screen.tsx'
import styles from './Settings.module.css'

const usd = (n: number) => (n >= 1 ? `$${Math.round(n * 100) / 100}` : `$${Math.round(n * 1000) / 1000}`)

export function AiSettings() {
  const ai = useAi()
  const [catalog, setCatalog] = useState<Catalog>()
  const [providerId, setProviderId] = useState(ai.config.providerId ?? '')
  const [modelId, setModelId] = useState(ai.config.modelId ?? '')
  const [baseUrl, setBaseUrl] = useState(ai.config.baseUrl ?? '')
  const [key, setKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; text: string }>()
  const [busy, setBusy] = useState<'save' | 'test' | 'refresh' | null>(null)

  useEffect(() => {
    loadBundledCatalog().then(setCatalog)
  }, [])
  useEffect(() => {
    setProviderId(ai.config.providerId ?? '')
    setModelId(ai.config.modelId ?? '')
    setBaseUrl(ai.config.baseUrl ?? '')
  }, [ai.config])
  useEffect(() => {
    ai.getKey().then(setKey)
  }, [ai])

  const providers = useMemo(() => (catalog ? sortedProviders(catalog) : []), [catalog])
  const provider = catalog ? findProvider(catalog, providerId) : undefined
  const models = provider ? sortedModels(provider) : []
  const model = models.find((m) => m.id === modelId)
  const custom = providerId === CUSTOM_PROVIDER

  async function save(): Promise<boolean> {
    if (!providerId || !modelId.trim()) {
      setStatus({ ok: false, text: 'Choose a provider and a model.' })
      return false
    }
    if (custom && !/^https?:\/\//.test(baseUrl.trim())) {
      setStatus({ ok: false, text: 'Enter the endpoint address, such as http://localhost:11434/v1.' })
      return false
    }
    await ai.save({ providerId, modelId: modelId.trim(), ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}) }, key)
    return true
  }

  return (
    <Screen
      title="AI"
      subtitle="Optional. Cadence works fully without it."
      back={{ href: '/settings', label: 'Settings' }}
    >
      <div className={styles.privacy}>
        <p>
          <strong>Your model, your key.</strong> AI designs programs, adjusts weeks and proposes exercises; it never
          saves anything itself, every result is a draft you edit. Requests go straight from this device to the provider
          you choose, with the training summary shown before you send it.
        </p>
        <p>The key stays in this browser. It is never exported in backups and never sent anywhere but that provider.</p>
      </div>
      <form
        className={styles.form}
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy('save')
          setStatus(undefined)
          if (await save()) setStatus({ ok: true, text: 'Saved.' })
          setBusy(null)
        }}
      >
        <SelectField
          label="Provider"
          value={providerId}
          options={[
            { value: '', label: catalog ? 'Choose a provider' : 'Loading…' },
            ...providers.map((p) => ({ value: p.id, label: p.name })),
            { value: CUSTOM_PROVIDER, label: CUSTOM_PROVIDER_INFO.name },
          ]}
          hint={catalog ? `${providers.length} providers reachable from a browser, list from llm-models.` : undefined}
          onChange={(e) => {
            setProviderId(e.target.value)
            const p = catalog ? findProvider(catalog, e.target.value) : undefined
            setModelId(p ? (sortedModels(p)[0]?.id ?? '') : '')
            setStatus(undefined)
          }}
        />
        {custom ? (
          <>
            <Field
              label="Endpoint address"
              placeholder="http://localhost:11434/v1"
              hint="Any OpenAI-compatible server: Ollama, LM Studio, a proxy. Local servers work from a browser on the same computer."
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
            <Field
              label="Model"
              placeholder="llama3.1:8b"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
            />
          </>
        ) : (
          provider && (
            <SelectField
              label="Model"
              value={modelId}
              options={models.map((m) => ({
                value: m.id,
                label: `${m.name}${m.structured ? '' : ' (no structured output)'}`,
              }))}
              hint={
                model
                  ? [
                      model.structured ? 'Supports structured output' : 'May not return a usable program',
                      model.cost ? `${usd(model.cost[0])} / ${usd(model.cost[1])} per million tokens in / out` : '',
                      model.context ? `${Math.round(model.context / 1000)}K context` : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : undefined
              }
              onChange={(e) => setModelId(e.target.value)}
            />
          )
        )}
        <div className={styles.keyRow}>
          <Field
            label={custom ? 'API key (optional)' : 'API key'}
            type={showKey ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <IconButton
            icon={showKey ? EyeOff : Eye}
            label={showKey ? 'Hide key' : 'Show key'}
            onClick={() => setShowKey(!showKey)}
          />
        </div>
        {provider?.doc && (
          <p className={styles.muted}>
            Keys and docs:{' '}
            <a href={provider.doc} target="_blank" rel="noreferrer">
              {new URL(provider.doc).host}
            </a>
          </p>
        )}
        {status && (
          <p className={status.ok ? styles.ok : styles.error} role={status.ok ? 'status' : 'alert'}>
            {status.text}
          </p>
        )}
        <div className={styles.row}>
          <Button type="submit" variant="primary" loading={busy === 'save'}>
            Save
          </Button>
          <Button
            variant="secondary"
            loading={busy === 'test'}
            onClick={async () => {
              setBusy('test')
              setStatus(undefined)
              try {
                if (!(await save()) || !catalog) return
                const p = findProvider(catalog, providerId)
                if (!p) throw new Error('Unknown provider')
                const m = await createModel({
                  provider: p,
                  modelId: modelId.trim(),
                  apiKey: key.trim(),
                  ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
                })
                const out = await generateStructured(m, {
                  system: 'You answer with JSON only.',
                  prompt: 'Reply with {"ok": true}.',
                  schema: z.object({ ok: z.boolean() }),
                })
                setStatus(
                  out.ok
                    ? { ok: true, text: 'The model answered. AI program design is ready.' }
                    : { ok: false, text: 'The model answered oddly.' },
                )
              } catch (err) {
                setStatus({ ok: false, text: describeAiError(err) })
              } finally {
                setBusy(null)
              }
            }}
          >
            Save and test
          </Button>
          {catalog && (
            <Button
              variant="plain"
              loading={busy === 'refresh'}
              icon={<RefreshCw size={18} strokeWidth={1.75} aria-hidden="true" />}
              onClick={async () => {
                setBusy('refresh')
                try {
                  setCatalog(await refreshCatalog(catalog))
                  setStatus({ ok: true, text: 'Model lists refreshed.' })
                } catch (err) {
                  setStatus({ ok: false, text: describeAiError(err) })
                } finally {
                  setBusy(null)
                }
              }}
            >
              Refresh models
            </Button>
          )}
        </div>
        {ai.ready && (
          <Button
            variant="plain"
            onClick={async () => {
              await ai.save({}, '')
              setKey('')
              setStatus({ ok: true, text: 'AI turned off and the key deleted from this device.' })
            }}
          >
            Turn AI off and delete the key
          </Button>
        )}
      </form>
    </Screen>
  )
}
