// Build time: llm-models lists providers and models (models.dev) and checks, with a real CORS preflight from
// the app's origin, which providers a web page can call. The result is src/core/ai/catalog.json.
import { writeFile } from 'node:fs/promises'
import { listProviders, probeBrowserSupportAll, providerBaseUrl, setCacheEnabled } from 'llm-models'
import {
  CATALOG_VERSION,
  type Catalog,
  type CatalogProvider,
  clientFor,
  toCatalogModels,
} from '../src/core/ai/catalog.ts'

const ORIGIN = 'https://maxgfr.github.io'
const OUT = new URL('../src/core/ai/catalog.json', import.meta.url)
/** Gzipped bytes; the catalog is its own lazy chunk, fetched only by the AI screens. */
const BUDGET = 200 * 1024

setCacheEnabled(false)
const providers = await listProviders()
const targets = providers.flatMap((p) => {
  const api = providerBaseUrl({ id: p.id, api: p.api ?? null, npm: p.npm ?? null }) ?? undefined
  const client = clientFor({ id: p.id, npm: p.npm, api })
  if (!client || (client === 'openai-compatible' && !api)) return []
  return [{ p, client, api, target: { id: p.id, api: api ?? null, npm: p.npm ?? null } }]
})
const support = await probeBrowserSupportAll(
  targets.map((t) => t.target),
  { origin: ORIGIN },
)
const kept: CatalogProvider[] = []
for (const { p, client, api } of targets) {
  const s = support[p.id]
  if (!s?.callable) continue
  const models = toCatalogModels(p.id, p.models)
  if (models.length === 0) continue
  const entry: CatalogProvider = { id: p.id, name: p.name, client, models }
  // The native clients know their own default address; only overrides are kept.
  if (client === 'openai-compatible' || (p.api && api)) entry.api = api
  if (s.required_headers && Object.keys(s.required_headers).length > 0) entry.headers = s.required_headers
  if (p.doc) entry.doc = p.doc
  kept.push(entry)
}
kept.sort((a, b) => a.id.localeCompare(b.id))
const catalog: Catalog = { version: CATALOG_VERSION, builtAt: new Date().toISOString(), providers: kept }
// One provider per line: small to ship, and a refresh still reads as a per-provider diff.
const lines = catalog.providers.map((p) => `    ${JSON.stringify(p)}`).join(',\n')
await writeFile(
  OUT,
  `{\n  "version": ${catalog.version},\n  "builtAt": ${JSON.stringify(catalog.builtAt)},\n  "providers": [\n${lines}\n  ]\n}\n`,
)
const bytes = await Bun.file(OUT).bytes()
const gzip = Bun.gzipSync(bytes).byteLength
if (gzip > BUDGET) throw new Error(`catalog.json is ${gzip} bytes gzipped, over the ${BUDGET} byte budget`)
const models = kept.reduce((n, p) => n + p.models.length, 0)
console.log(
  `catalog.json: ${kept.length} browser-callable providers of ${providers.length}, ${models} models, ${bytes.byteLength} bytes, ${gzip} gzipped`,
)
