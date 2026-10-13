import type { Ref } from 'react'
import type { City } from '../data/format'
import { useT } from '../i18n'
import { useAtlasStore } from '../state/store'
import CitySearch from './CitySearch'
import { IconGlobe, IconInfo } from './icons'
import styles from './TopBar.module.css'

interface Props {
  cities: City[]
  onSelect(city: number): void
  aboutDisabled: boolean
  onAbout(): void
  aboutRef: Ref<HTMLButtonElement>
}

export default function TopBar({ cities, onSelect, aboutDisabled, onAbout, aboutRef }: Props) {
  const t = useT()
  const locale = useAtlasStore(s => s.locale)
  const setLocale = useAtlasStore(s => s.setLocale)
  const other = locale === 'en' ? 'RU' : 'EN'
  return (
    <div className={styles.bar}>
      <span className={styles.side} />
      <h1 className={styles.sr}>Livable Atlas</h1>
      <CitySearch cities={cities} onSelect={onSelect} />
      <div className={`${styles.side} ${styles.actions}`}>
        <button type="button" className={styles.chip} data-testid="locale-toggle" aria-label={`${t('ui.language')}: ${other}`} onClick={() => setLocale(locale === 'en' ? 'ru' : 'en')}>
          <IconGlobe />
          <span className={styles.label}>{other}</span>
        </button>
        <button type="button" className={styles.chip} ref={aboutRef} data-testid="about-open" aria-label={t('ui.about')} disabled={aboutDisabled} onClick={onAbout}>
          <IconInfo />
          <span className={styles.label}>{t('ui.about')}</span>
        </button>
      </div>
    </div>
  )
}
