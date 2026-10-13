import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useT } from '../i18n'
import { TABS, useAtlasStore, type Tab } from '../state/store'
import { IconChevron, IconCities, IconCompare, IconSettings } from './icons'
import Sheet, { type SheetHeight } from './Sheet'
import { MOBILE, useMedia } from './useMedia'
import styles from './SidePanel.module.css'

interface Props {
  settings: ReactNode
  cities: ReactNode
  compare: ReactNode
  place: ReactNode // the point card, shown as a fourth tab on MOBILE
  point: { lat: number; lon: number } | null // a new point opens the Place tab
  pinnedCount: number
  forceRail: boolean // the card needs the room (NARROW); not persisted
  onLeaveRail(): void // the user opens the panel while forceRail: the card gives way
}

const ICONS = { settings: IconSettings, cities: IconCities, compare: IconCompare }
type View = Tab | 'place'

export default function SidePanel({ settings, cities, compare, place, point, pinnedCount, forceRail, onLeaveRail }: Props) {
  const t = useT()
  const ui = useAtlasStore(s => s.ui)
  const { setPanel, setTab } = useAtlasStore.getState()
  const tabRefs = useRef<Partial<Record<View, HTMLButtonElement | null>>>({})
  const expandRef = useRef<HTMLButtonElement>(null)
  const mobile = useMedia(MOBILE)
  const rail = !mobile && (ui.panel === 'rail' || forceRail)
  // Mobile sheet: height and the Place tab are local; a new point selects Place at half height.
  const [height, setHeight] = useState<SheetHeight>('peek')
  const [onPlace, setOnPlace] = useState(false)
  const [seen, setSeen] = useState<Props['point']>(null)
  if (point !== seen) {
    setSeen(point)
    if (point) {
      setOnPlace(true)
      setHeight('half')
    }
  }
  // Opening a place from the Cities list, or closing it from the Place tab, unmounts the focused element:
  // hand focus to the Place tab, or back to the remaining tab, instead of <body>. Only on a change, never on first render.
  const prevSeen = useRef(seen)
  useEffect(() => {
    if (prevSeen.current === seen) return
    prevSeen.current = seen
    if (mobile && document.activeElement === document.body) tabRefs.current[seen ? 'place' : ui.tab]?.focus()
  }, [mobile, seen, ui.tab])
  const views: View[] = mobile && point ? [...TABS, 'place'] : TABS
  const current: View = mobile && point && onPlace ? 'place' : ui.tab // closing the card falls back to the store tab
  const select = (view: View) => {
    setOnPlace(view === 'place')
    if (view !== 'place') setTab(view)
  }
  // The switch swaps the subtree, so the clicked button unmounts; move focus to its counterpart.
  // Only after a user action in the panel: never on first render or when an opening card forces the rail.
  const moved = useRef(false)
  useEffect(() => {
    if (!moved.current) return
    moved.current = false
    ;(rail ? expandRef.current : tabRefs.current[ui.tab])?.focus()
  }, [rail, ui.tab])
  const label = (tab: View) => (tab === 'compare' && pinnedCount > 0 ? `${t('ui.compare')} (${pinnedCount})` : t(`ui.${tab}`))
  const open = (tab: Tab) => {
    moved.current = true
    if (forceRail) onLeaveRail()
    setTab(tab)
  }

  if (rail) {
    return (
      <aside className={`${styles.panel} ${styles.rail}`} aria-label={t('ui.panel')}>
        <button type="button" ref={expandRef} className="icon-btn" aria-label={t('ui.expand')} aria-expanded={false} onClick={() => open(ui.tab)}>
          <IconChevron style={{ transform: 'rotate(-90deg)' }} />
        </button>
        {TABS.map(tab => {
          const Icon = ICONS[tab]
          return (
            <button key={tab} type="button" className={`icon-btn ${tab === ui.tab ? styles.current : ''}`} aria-label={label(tab)} onClick={() => open(tab)}>
              <Icon />
            </button>
          )
        })}
      </aside>
    )
  }

  // Automatic activation: the arrow keys move focus and select the tab.
  const onKey = (e: KeyboardEvent) => {
    const i = views.indexOf(current)
    const n = views.length
    const next = { ArrowRight: views[(i + 1) % n], ArrowLeft: views[(i + n - 1) % n], Home: views[0], End: views[n - 1] }[e.key]
    if (!next) return
    e.preventDefault()
    select(next)
    tabRefs.current[next]?.focus()
  }

  const panel = (
    <aside className={mobile ? styles.inSheet : styles.panel} aria-label={t('ui.panel')}>
      <div className={styles.head}>
        <div role="tablist" className={styles.tabs} onKeyDown={onKey}>
          {views.map(tab => (
            <button
              key={tab}
              ref={el => void (tabRefs.current[tab] = el)}
              type="button"
              role="tab"
              id={`tab-${tab}`}
              className={styles.tab}
              aria-selected={tab === current}
              aria-controls="side-tabpanel"
              tabIndex={tab === current ? 0 : -1}
              onClick={() => {
                select(tab)
                if (height === 'peek') setHeight('half') // a tab tapped at peek shows its content
              }}
            >
              {label(tab)}
            </button>
          ))}
        </div>
        {!mobile && (
          <button type="button" className="icon-btn" aria-label={t('ui.collapse')} aria-expanded={true} onClick={() => { moved.current = true; setPanel('rail') }}>
            <IconChevron style={{ transform: 'rotate(90deg)' }} />
          </button>
        )}
      </div>
      <div role="tabpanel" id="side-tabpanel" aria-labelledby={`tab-${current}`} className={styles.body} hidden={mobile && height === 'peek'}>
        {{ settings, cities, compare, place }[current]}
      </div>
    </aside>
  )
  return mobile ? <Sheet height={height} onHeight={setHeight}>{panel}</Sheet> : panel
}
