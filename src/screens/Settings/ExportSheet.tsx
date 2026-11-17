import { useEffect, useState } from 'react'
import { useData } from '../../app/data.tsx'
import { useT } from '../../app/i18n.tsx'
import type { BackupPart } from '../../core/model/schemas.ts'
import { BACKUP_PARTS, exportBackup, isWhole } from '../../core/storage/backup.ts'
import { Button } from '../../ui/components/Button.tsx'
import { Sheet } from '../../ui/components/Sheet.tsx'
import { download } from '../../ui/download.ts'
import { BackupParts } from './BackupParts.tsx'
import styles from './Settings.module.css'

/** Exports all of the athlete's data, or the parts they tick. */
export function ExportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const data = useData()
  const t = useT()
  const b = t.settings.backupSheet
  const [parts, setParts] = useState<BackupPart[]>([...BACKUP_PARTS])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) setParts([...BACKUP_PARTS])
  }, [open])

  return (
    <Sheet open={open} title={b.exportTitle} onClose={onClose}>
      <div className={styles.sheet}>
        <BackupParts legend={b.exportLegend} value={parts} onChange={setParts} lists={data} />
        <Button
          variant="primary"
          size="large"
          full
          disabled={parts.length === 0}
          loading={busy}
          onClick={async () => {
            setBusy(true)
            try {
              const backup = await exportBackup(data.store, new Date(), parts)
              const name = isWhole(parts) ? 'backup' : parts.join('-')
              download(`cadence-${name}-${data.today}.json`, JSON.stringify(backup, null, 2), 'application/json')
              onClose()
            } finally {
              setBusy(false)
            }
          }}
        >
          {b.export}
        </Button>
      </div>
    </Sheet>
  )
}
