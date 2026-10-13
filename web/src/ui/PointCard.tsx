import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flatIndex, type City, type CountryName } from '../data/format'
import { nearestCity } from '../data/cities'
import { useT, type Key } from '../i18n'
import { scoreColor } from '../render/paint'
import { breakdown } from '../scoring/breakdown'
import { FACTORS } from '../scoring/factors'
import { MAX_PINNED, useAtlasStore } from '../state/store'
import type { PointDetail } from '../worker/protocol'
import ClimateChart, { PREC, TMAX, TMIN } from './ClimateChart'
import { coordsLabel, fmt, unitLabel } from './format'
import { IconClose } from './icons'
import styles from './PointCard.module.css'

interface Props {
  point: { lat: number; lon: number }
  detail: PointDetail | null | undefined // undefined = loading, null = no land cell
  cities: City[]
  countries: [string, CountryName][]
  tone: number[] | null // equalised palette of the score map; the badge follows the map colour
  onClose(): void
}

const SHORT = 5 // breakdown rows shown before "Show all"
// Escape in a text field belongs to the field.
const editable = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || (el instanceof HTMLInputElement && !/^(button|checkbox|radio|range|submit|reset)$/.test(el.type)) || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)
const UNIT = Object.fromEntries(FACTORS.map(d => [d.id, d.unit]))

export default function PointCard({ point, detail, cities, countries, tone, onClose }: Props) {
  const t = useT()
  const locale = useAtlasStore(s => s.locale)
  const factors = useAtlasStore(s => s.factors)
  const city = useMemo(() => nearestCity(cities, point.lat, point.lon), [cities, point.lat, point.lon])
  const card = useRef<HTMLElement>(null)
  // The focused ✕ (or the Place tab) unmounts with the card; hand focus to the map instead of <body>.
  const close = useCallback(() => {
    const at = document.activeElement
    onClose()
    if (!at || at === document.body || card.current?.contains(at)) document.querySelector<HTMLElement>('.maplibregl-canvas')?.focus()
  }, [onClose])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !editable(e.target) && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])
  const local = (n: { name: string; nameRu: string | null }) => (locale === 'ru' && n.nameRu) || n.name

  const coords = coordsLabel(point.lat, point.lon, t('ui.compass'))
  const pinned = useAtlasStore(s => s.pinned)
  const pin = useAtlasStore(s => s.pin)
  const isPinned = pinned.some(q => flatIndex(q.lat, q.lon) === flatIndex(point.lat, point.lon))
  const inWorld = Math.abs(point.lat) <= 90 // clicks arrive wrapped, so only a click beyond the poles has no nearest city
  const c = inWorld ? cities[city.index] : undefined
  const country = detail?.country == null ? null : countries[detail.country]
  const score = detail?.sample.score ?? 255

  const [all, setAll] = useState(false)
  const rows = detail ? breakdown(detail.sample, factors) : []
  const shown = all ? rows : rows.slice(0, SHORT)
  const hasScore = score <= 100
  const shade = hasScore && tone ? tone[score] : score
  const canPin = detail != null && score !== 255 && !isPinned && pinned.length < MAX_PINNED

  return (
    <aside ref={card} className={styles.card} data-testid="point-card" aria-label={t('ui.pointDetails')}>
      <div className={styles.head}>
        {detail === undefined ? (
          <span className={styles.badge} aria-hidden="true">…</span>
        ) : (
          <span
            className={`${styles.badge} ${hasScore ? (shade >= 50 ? styles.onLight : styles.onDark) : ''}`}
            style={hasScore ? { background: scoreColor(shade) } : undefined}
            data-testid="card-score"
            title={t('ui.score')}
          >
            {hasScore ? score : t('ui.noData')}
          </span>
        )}
        <div className={styles.place}>
          {c && (
            <strong>{local({ name: c[0], nameRu: c[1] })}, {fmt(city.km)} {unitLabel(locale, 'km')}</strong>
          )}
          {country && <span>{local(country[1])}</span>}
          <small>{coords}</small>
        </div>
        <button type="button" className="icon-btn" aria-label={t('ui.close')} onClick={close}><IconClose /></button>
      </div>
      {detail === undefined && <p role="status">{t('ui.loading')}</p>}
      {detail && (
        <>
          <table className={styles.table}>
            <thead>
              <tr><th>{t('ui.factor')}</th><th>{t('ui.value')}</th><th>{t('ui.score')}</th><th>{t('ui.lost')}</th></tr>
            </thead>
            <tbody>
              {shown.map(r => (
                <tr key={r.id}>
                  <td title={t(`desc.${r.id}` as Key)}>{t(`factor.${r.id}` as Key)}{r.key && <small className={styles.keyTag}> {t('ui.keyTag')}</small>}</td>
                  <td>{fmt(r.value)} {unitLabel(locale, UNIT[r.id])}</td>
                  <td>
                    <span className={styles.bar} aria-hidden="true">
                      <span style={{ width: `${r.s * 100}%` }} />
                    </span>
                    {Math.round(r.s * 100)}
                  </td>
                  <td>{r.lost ? `−${r.lost}` : 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > SHORT && (
            <button type="button" className={`btn-ghost ${styles.toggle}`} aria-expanded={all} onClick={() => setAll(!all)}>
              {all ? t('ui.showLess') : t('ui.showAll').replace('{n}', String(rows.length))}
            </button>
          )}
          <ClimateChart monthly={detail.monthly} />
          <div className={styles.legend}>
            <span><i style={{ background: TMAX }} />{t('ui.monthly.tmax')}</span>
            <span><i style={{ background: TMIN }} />{t('ui.monthly.tmin')}</span>
            {detail.monthly.prec && <span><i style={{ background: PREC }} />{t('ui.monthly.prec')}</span>}
          </div>
        </>
      )}
      <button
        type="button"
        className="btn-primary"
        disabled={!canPin}
        title={!isPinned && pinned.length >= MAX_PINNED ? t('ui.compareFull') : undefined}
        onClick={() => pin(point)}
      >
        {isPinned ? t('ui.comparePinned') : t('ui.compareAdd')}
      </button>
    </aside>
  )
}
