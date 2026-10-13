import { TOP_N } from '../data/cities'
import type { City } from '../data/format'
import { useT } from '../i18n'
import { useAtlasStore } from '../state/store'
import styles from './SidePanel.module.css'

interface Props {
  cities: City[]
  top: [number, number][] // [city index, score], best first
  onSelect(city: number): void
}

export default function TopCities({ cities, top, onSelect }: Props) {
  const t = useT()
  const locale = useAtlasStore(s => s.locale)
  const heading = t('ui.topCities').replace('{n}', String(TOP_N))
  return (
    <>
      <h3 className={styles.heading}>{heading}</h3>
      <ol className={styles.top} aria-label={heading} data-testid="top-list">
        {top.map(([i, score]) => (
          <li key={i}>
            <button type="button" className="btn-ghost" onClick={() => onSelect(i)}>
              <span>{(locale === 'ru' && cities[i][1]) || cities[i][0]}, {cities[i][2]}</span>
              <strong>{score}</strong>
            </button>
          </li>
        ))}
      </ol>
    </>
  )
}
