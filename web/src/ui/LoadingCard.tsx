import { useRef } from 'react'
import { useT } from '../i18n'
import styles from '../App.module.css'

export default function LoadingCard({ loaded, total }: { loaded: number; total: number | null }) {
  const t = useT()
  // Totals grow as headers arrive; the shown percentage never goes back.
  const shown = useRef(0)
  if (total) shown.current = Math.max(shown.current, Math.min(100, Math.round((loaded / total) * 100)))
  return (
    <div className={styles.loadingCard} data-testid="loading-card">
      <div>
        {/* Live region on the static text only: the percentage changes up to 10x a second. */}
        <span role="status">{t('ui.loadingData')}</span>
        {total ? <span aria-hidden="true"> {shown.current} %</span> : null}
      </div>
      <progress max={100} value={total ? shown.current : undefined} aria-label={t('ui.loadingData')} />
    </div>
  )
}
