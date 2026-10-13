import type { Manifest } from '../data/format'
import { useT } from '../i18n'
import type { Key } from '../i18n'
import { FACTORS, GROUPS, isAvailable } from '../scoring/factors'
import { MONTHLY_RANGE, parseMode, type MonthlyVar } from '../scoring/modes'
import { useAtlasStore } from '../state/store'
import { monthNames } from './format'
import styles from './ModeBar.module.css'

export default function ModeBar({ manifest, precFailed }: { manifest: Manifest; precFailed: boolean }) {
  const t = useT()
  const mapMode = useAtlasStore(s => s.mapMode)
  const month = useAtlasStore(s => s.month)
  const locale = useAtlasStore(s => s.locale)
  const { setMapMode, setMonth } = useAtlasStore.getState()
  const monthly = (Object.keys(MONTHLY_RANGE) as MonthlyVar[]).filter(v => v in manifest.monthly && !(v === 'prec' && precFailed))

  return (
    <div className={styles.bar} data-testid="mode-bar">
      <select
        data-testid="mode-select"
        aria-label={t('ui.mapMode')}
        value={mapMode}
        onChange={e => setMapMode(parseMode(e.target.value) ?? 'score')}
      >
        <option value="score">{t('ui.score')}</option>
        {GROUPS.map(g => {
          const defs = FACTORS.filter(f => f.group === g && isAvailable(f.id, manifest))
          return (
            defs.length > 0 && (
              <optgroup key={g} label={t(`group.${g}` as Key)}>
                {defs.map(f => (
                  <option key={f.id} value={`factor:${f.id}`}>
                    {t(`factor.${f.id}` as Key)}
                  </option>
                ))}
              </optgroup>
            )
          )
        })}
        {monthly.length > 0 && (
          <optgroup label={t('ui.monthlyClimate')}>
            {monthly.map(v => (
              <option key={v} value={`monthly:${v}`}>
                {t(`ui.monthly.${v}`)}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      {mapMode.startsWith('monthly:') && (
        <label className={styles.month}>
          <input type="range" min={1} max={12} step={1} aria-label={t('ui.month')} aria-valuetext={monthNames(locale)[month - 1]} value={month} onChange={e => setMonth(e.target.valueAsNumber)} />
          <output>{monthNames(locale)[month - 1]}</output>
        </label>
      )}
    </div>
  )
}
