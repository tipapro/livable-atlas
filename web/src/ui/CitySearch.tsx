import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { searchCities } from '../data/cities'
import type { City } from '../data/format'
import { useT } from '../i18n'
import { useAtlasStore } from '../state/store'
import { IconSearch } from './icons'
import styles from './TopBar.module.css'

export default function CitySearch({ cities, onSelect }: { cities: City[]; onSelect(city: number): void }) {
  const t = useT()
  const locale = useAtlasStore(s => s.locale)
  const input = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(-1) // index into results; -1 = none highlighted
  const [dismissed, setDismissed] = useState(false) // Escape hides the list until the next keystroke
  const results = useMemo(() => searchCities(cities, query), [cities, query])
  const open = results.length > 0 && !dismissed
  const name = (i: number) => (locale === 'ru' && cities[i][1]) || cities[i][0]

  const pick = (i: number) => {
    setQuery('')
    setActive(-1)
    onSelect(i)
    input.current?.focus()
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation() // the open point card must not close
      setDismissed(true)
      setActive(-1)
    } else if (open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      const n = results.length
      setActive(a => (e.key === 'ArrowDown' ? (a + 1) % n : (a <= 0 ? n : a) - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (open && active >= 0) pick(results[active])
    }
  }

  return (
    <div className={styles.search}>
      <IconSearch className={styles.searchIcon} />
      <input
        ref={input}
        type="text"
        role="combobox"
        aria-label={t('ui.search')}
        aria-expanded={open}
        aria-controls="search-results"
        aria-activedescendant={open && active >= 0 ? `search-option-${active}` : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={t('ui.search')}
        value={query}
        onChange={e => {
          setQuery(e.target.value)
          setActive(-1)
          setDismissed(false)
        }}
        onKeyDown={onKey}
        onBlur={() => {
          setDismissed(true) // the list closes when focus leaves; option mousedown is prevented, so picking still works
          setActive(-1)
        }}
      />
      <ul role="listbox" id="search-results" aria-label={t('ui.searchResults')} data-testid="search-results" className={styles.results} hidden={!open}>
        {open &&
          results.map((i, k) => (
            // mousedown would blur the input before the click lands
            <li key={i} id={`search-option-${k}`} role="option" aria-selected={k === active} onMouseDown={e => e.preventDefault()} onClick={() => pick(i)}>
              {name(i)}, {cities[i][2]}
            </li>
          ))}
      </ul>
      <div className={styles.sr} aria-live="polite">
        {query.trim() ? t('ui.resultsCount').replace('{n}', String(results.length)) : ''}
      </div>
    </div>
  )
}
