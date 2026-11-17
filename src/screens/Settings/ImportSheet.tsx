import { useEffect, useState } from 'react'
import { useData } from '../../app/data.tsx'
import { useT } from '../../app/i18n.tsx'
import { useToast } from '../../app/toast.tsx'
import { formatDay, toIsoDate } from '../../core/model/dates.ts'
import type { Backup, BackupPart } from '../../core/model/schemas.ts'
import { type ImportMode, type ImportPlan, partsOf } from '../../core/storage/backup.ts'
import type { CollectionName } from '../../core/storage/store.ts'
import { Button } from '../../ui/components/Button.tsx'
import { Segmented } from '../../ui/components/Segmented.tsx'
import { Sheet } from '../../ui/components/Sheet.tsx'
import { BackupParts } from './BackupParts.tsx'
import styles from './Settings.module.css'

/** What an import took, in the order of the parts. */
const SUMMARY: readonly CollectionName[] = ['sessions', 'exercises', 'disciplines', 'programs', 'goals', 'notes']

/** Imports the parts of a backup file the athlete keeps ticked, added to the device's data or in place of them. */
export function ImportSheet({ file, onClose }: { file: Backup | undefined; onClose: () => void }) {
  const data = useData()
  const t = useT()
  const toast = useToast()
  const b = t.settings.backupSheet
  const [parts, setParts] = useState<BackupPart[]>([])
  const [mode, setMode] = useState<ImportMode>('add')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (file) {
      setParts(partsOf(file))
      setMode('add')
    }
  }, [file])

  const summary = (plan: ImportPlan) => {
    const what = SUMMARY.filter((c) => plan.counts[c] > 0).map((c) => b[c](plan.counts[c]))
    if (plan.settings) what.push(b.settings)
    return what.length === 0 ? b.nothingNew : b.imported(what.join(', '))
  }

  return (
    <Sheet open={file !== undefined} title={b.importTitle} onClose={onClose}>
      {file && (
        <div className={styles.sheet}>
          <p className={styles.muted}>
            {b.exportedOn(formatDay(toIsoDate(new Date(file.exportedAt)), new Date().getFullYear()))}
          </p>
          <BackupParts
            legend={b.importLegend}
            value={parts}
            onChange={setParts}
            lists={file}
            available={partsOf(file)}
          />
          <div className={styles.mode}>
            <Segmented
              label={b.mode}
              options={[
                { value: 'add', label: b.add },
                { value: 'replace', label: b.replace },
              ]}
              value={mode}
              onChange={setMode}
            />
            <p className={styles.muted}>{mode === 'add' ? b.addHint : b.replaceHint}</p>
          </div>
          <Button
            variant="primary"
            size="large"
            full
            disabled={parts.length === 0}
            loading={busy}
            onClick={async () => {
              setBusy(true)
              try {
                const plan = await data.importBackup(file, parts, mode)
                if (plan) toast(summary(plan))
                onClose()
              } finally {
                setBusy(false)
              }
            }}
          >
            {b.import}
          </Button>
        </div>
      )}
    </Sheet>
  )
}
