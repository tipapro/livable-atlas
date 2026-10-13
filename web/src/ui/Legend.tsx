import { scoreColor } from '../render/paint'
import { useT } from '../i18n'
import { modeRange, type MapMode } from '../scoring/modes'
import { useAtlasStore } from '../state/store'
import { fmt, unitLabel } from './format'
import type { Scale } from '../worker/protocol'
import styles from '../App.module.css'

const gradient = `linear-gradient(to right, ${Array.from({ length: 11 }, (_, i) => scoreColor(i * 10)).join(', ')})`

export default function Legend({ mode, scale }: { mode: MapMode; scale: Scale | null }) {
  const t = useT()
  const locale = useAtlasStore(s => s.locale)
  const contrast = useAtlasStore(s => s.contrast)
  const setContrast = useAtlasStore(s => s.setContrast)
  const range = mode === 'score' ? null : modeRange(mode)
  const labels = range ? [fmt(range.min), fmt(range.max)] : scale?.labels ?? [0, 100] // five labels sit at tone 0, 25, 50, 75, 100
  return (
    <div className={styles.legend} aria-label={t('ui.legend')}>
      {!range && (
        <label className={styles.contrast}>
          <input type="checkbox" checked={contrast} onChange={e => setContrast(e.target.checked)} />
          {t('ui.contrast')}
        </label>
      )}
      <div className={styles.scale}>
        <span className={styles.ramp} style={{ background: gradient }} />
        <div className={styles.labels}>
          {labels.map((l, i) => <span key={i}>{l}</span>)}
        </div>
      </div>
      {range && <span>{unitLabel(locale, range.unit)}</span>}
    </div>
  )
}
