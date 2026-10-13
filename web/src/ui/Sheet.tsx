import { useRef, type PointerEvent, type ReactNode } from 'react'
import { useT } from '../i18n'
import styles from './Sheet.module.css'

export type SheetHeight = 'peek' | 'half' | 'full'
const NEXT = { peek: 'half', half: 'full', full: 'peek' } as const

// Mobile bottom sheet. The handle cycles the heights; dragging it snaps to the nearest one on release.
export default function Sheet({ height, onHeight, children }: { height: SheetHeight; onHeight(h: SheetHeight): void; children: ReactNode }) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ y: number; h: number; moved: boolean } | null>(null)
  // The heights in px, as in Sheet.module.css.
  const snaps = () => {
    const total = ref.current!.parentElement!.clientHeight
    return { peek: parseFloat(getComputedStyle(ref.current!).getPropertyValue('--sheet-peek')), half: total / 2, full: total - 60 }
  }
  const release = () => {
    ref.current!.style.height = ref.current!.style.transition = ''
  }

  const onDown = (e: PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { y: e.clientY, h: ref.current!.offsetHeight, moved: false }
  }
  const onMove = (e: PointerEvent) => {
    const d = drag.current
    if (!d || !e.currentTarget.hasPointerCapture(e.pointerId)) return
    const dy = d.y - e.clientY
    d.moved ||= Math.abs(dy) > 4
    if (!d.moved) return
    const { peek, full } = snaps()
    ref.current!.style.transition = 'none' // follow the finger, not the animation
    ref.current!.style.height = `${Math.min(Math.max(d.h + dy, peek), full)}px`
  }
  const onUp = () => {
    if (!drag.current?.moved) return
    const h = ref.current!.offsetHeight
    const s = snaps()
    release()
    onHeight((Object.keys(s) as SheetHeight[]).reduce((a, b) => (Math.abs(s[b] - h) < Math.abs(s[a] - h) ? b : a)))
  }
  const onCancel = () => {
    drag.current = null
    release()
  }

  return (
    <div ref={ref} className={`${styles.sheet} ${styles[height]}`} data-testid="sheet" data-height={height}>
      <button
        type="button"
        className={styles.handle}
        aria-label={t('ui.resize')}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onCancel}
        onClick={() => {
          // A drag ends in a click too; only a plain click (or Enter/Space) cycles.
          const dragged = drag.current?.moved
          drag.current = null
          if (!dragged) onHeight(NEXT[height])
        }}
      />
      {children}
    </div>
  )
}
