import { useMemo } from 'react'
import type { City } from '../data/format'
import { nearestCity } from '../data/cities'
import { useT, type Key } from '../i18n'
import { FACTORS } from '../scoring/factors'
import { NODATA, type PointSample } from '../scoring/score'
import { useAtlasStore, type LatLon } from '../state/store'
import { coordsLabel, fmt, unitLabel } from './format'
import { IconClose } from './icons'
import styles from './CompareTable.module.css'

// true where s equals the row maximum; nothing is "best" with fewer than two values or when they all tie.
export function bestInRow(s: (number | null)[]): boolean[] {
  const v = s.filter((x): x is number => x !== null)
  const max = Math.max(...v)
  return s.map(x => v.length >= 2 && x === max && v.some(y => y !== max))
}

interface Props {
  points: LatLon[]
  samples: (PointSample | null | undefined)[] // undefined = loading, null = no land cell
  cities: City[]
}

export default function CompareTable({ points, samples, cities }: Props) {
  const t = useT()
  const locale = useAtlasStore(s => s.locale)
  const unpin = useAtlasStore(s => s.unpin)
  const nearest = useMemo(() => points.map(p => cities[nearestCity(cities, p.lat, p.lon).index]), [points, cities])
  const score = (p: PointSample | null | undefined) => (p && p.score <= 100 ? p.score : null)
  const cell = (key: number, best: boolean, children: React.ReactNode) => (
    <td key={key} className={best ? styles.best : undefined}>
      {children}
      {best && <span className={styles.sr}> ({t('ui.best')})</span>}
    </td>
  )
  const totals = bestInRow(samples.map(score))
  const rows = FACTORS.filter(d => samples.some(p => p?.factors[d.id]))
  if (!points.length) return <p className={styles.empty}>{t('ui.compareEmpty')}</p>

  return (
    <div className={styles.wrap} data-testid="compare">
      <table className={styles.table}>
        <thead>
          <tr>
            <th>{t('ui.factor')}</th>
            {points.map((p, i) => {
              const c = nearest[i]
              const coords = coordsLabel(p.lat, p.lon, t('ui.compass'))
              const name = c ? (locale === 'ru' && c[1]) || c[0] : coords
              return (
                <th key={i} data-testid="compare-col">
                  {name}
                  {c && <small>{coords}</small>}
                  <button type="button" className="icon-btn" aria-label={`${t('ui.remove')}: ${name}`} onClick={() => unpin(i)}><IconClose /></button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">{t('ui.score')}</th>
            {samples.map((p, i) => (
              cell(i, totals[i], p === undefined ? t('ui.loading') : p === null || p.score === NODATA ? t('ui.noData') : p.score)
            ))}
          </tr>
          {rows.map(d => {
            const best = bestInRow(samples.map(p => p?.factors[d.id]?.s ?? null))
            return (
              <tr key={d.id}>
                <th scope="row">{t(`factor.${d.id}` as Key)}</th>
                {samples.map((p, i) => {
                  const f = p?.factors[d.id]
                  return cell(i, best[i], f ? `${fmt(f.value)} ${unitLabel(locale, d.unit)}` : '—')
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
