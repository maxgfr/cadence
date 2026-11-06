import { Eye, EyeOff, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { useAi } from '../../app/ai.tsx'
import { useT } from '../../app/i18n.tsx'
import {
  type Catalog,
  CUSTOM_PROVIDER,
  findProvider,
  loadBundledCatalog,
  refreshCatalog,
  sortedModels,
  sortedProviders,
} from '../../core/ai/catalog.ts'
import { createModel, describeAiError, generateStructured } from '../../core/ai/client.ts'
import { formatDecimal } from '../../core/i18n/locale.ts'
import { Button } from '../../ui/components/Button.tsx'
import { Field } from '../../ui/components/Field.tsx'
import { IconButton } from '../../ui/components/IconButton.tsx'
import { SelectField } from '../../ui/components/SelectField.tsx'
import { Screen } from '../../ui/shell/Screen.tsx'
import styles from './Settings.module.css'

const ENDPOINT_EXAMPLE = 'http://localhost:11434/v1'

const usd = (n: number) => `$${formatDecimal(n, n >= 1 ? 2 : 3)}`

export function AiSettings() {
  const ai = useAi()
  const t = useT()
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
      setStatus({ ok: false, text: t.ai.chooseProviderAndModel })
      return false
    }
    if (custom && !/^https?:\/\//.test(baseUrl.trim())) {
      setStatus({ ok: false, text: t.ai.enterEndpoint(ENDPOINT_EXAMPLE) })
      return false
    }
    try {
      await ai.save(
        { providerId, modelId: modelId.trim(), ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}) },
        key,
      )
    } catch {
      // Keys are only ever stored encrypted: when that fails, nothing is stored.
      setStatus({ ok: false, text: t.ai.notStored })
      return false
    }
    return true
  }

  return (
    <Screen title={t.ai.title} subtitle={t.ai.subtitle} back={{ href: '/settings', label: t.settings.title }}>
      <div className={styles.privacy}>
        <p>
          <strong>{t.ai.privacyLead}</strong> {t.ai.privacyBody}
        </p>
        <p>{t.ai.keyStays}</p>
      </div>
      <form
        className={styles.form}
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy('save')
          setStatus(undefined)
          if (await save()) setStatus({ ok: true, text: t.ai.saved })
          setBusy(null)
        }}
      >
        <SelectField
          label={t.ai.provider}
          value={providerId}
          options={[
            { value: '', label: catalog ? t.ai.chooseProvider : t.common.loading },
            ...providers.map((p) => ({ value: p.id, label: p.name })),
            { value: CUSTOM_PROVIDER, label: t.ai.customProvider },
          ]}
          hint={catalog ? t.ai.providersHint(providers.length) : undefined}
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
              label={t.ai.endpoint}
              placeholder={ENDPOINT_EXAMPLE}
              hint={t.ai.endpointHint}
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
            <Field
              label={t.ai.model}
              placeholder="llama3.1:8b"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
            />
          </>
        ) : (
          provider && (
            <SelectField
              label={t.ai.model}
              value={modelId}
              options={models.map((m) => ({
                value: m.id,
                label: m.structured ? m.name : t.ai.modelNoStructured(m.name),
              }))}
              hint={
                model
                  ? [
                      model.structured ? t.ai.supportsStructured : t.ai.mayNotReturn,
                      model.cost ? t.ai.cost(usd(model.cost[0]), usd(model.cost[1])) : '',
                      model.context ? t.ai.context(formatDecimal(Math.round(model.context / 1000), 0)) : '',
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
            label={custom ? t.ai.apiKeyOptional : t.ai.apiKey}
            type={showKey ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <IconButton
            icon={showKey ? EyeOff : Eye}
            label={showKey ? t.ai.hideKey : t.ai.showKey}
            onClick={() => setShowKey(!showKey)}
          />
        </div>
        {provider?.doc && (
          <p className={styles.muted}>
            {t.ai.keysAndDocs}{' '}
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
            {t.common.save}
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
                if (!p) throw new Error(t.ai.unknownProvider)
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
                setStatus(out.ok ? { ok: true, text: t.ai.modelReady } : { ok: false, text: t.ai.modelOdd })
              } catch (err) {
                setStatus({ ok: false, text: describeAiError(err) })
              } finally {
                setBusy(null)
              }
            }}
          >
            {t.ai.saveAndTest}
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
                  setStatus({ ok: true, text: t.ai.modelsRefreshed })
                } catch (err) {
                  setStatus({ ok: false, text: describeAiError(err) })
                } finally {
                  setBusy(null)
                }
              }}
            >
              {t.ai.refreshModels}
            </Button>
          )}
        </div>
        {ai.ready && (
          <Button
            variant="plain"
            onClick={async () => {
              try {
                await ai.save({}, '')
              } catch {
                setStatus({ ok: false, text: t.ai.keyNotDeleted })
                return
              }
              setKey('')
              setStatus({ ok: true, text: t.ai.turnedOff })
            }}
          >
            {t.ai.turnOff}
          </Button>
        )}
      </form>
    </Screen>
  )
}
