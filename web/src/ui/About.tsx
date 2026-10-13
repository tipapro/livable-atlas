import { useEffect, useRef } from 'react'
import type { Manifest } from '../data/format'
import { useT } from '../i18n'
import { useAtlasStore } from '../state/store'
import { IconClose } from './icons'
import styles from './About.module.css'

interface Props {
  sources: Manifest['sources']
  onClose(): void
}

export default function About({ sources, onClose }: Props) {
  const t = useT()
  const locale = useAtlasStore(s => s.locale)
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  // Leave the modal state first: while it lasts the page is inert and onClose could not return focus to it.
  const close = () => {
    dialogRef.current?.close()
    onClose()
  }
  useEffect(() => {
    dialogRef.current?.showModal() // native modal: the page behind is inert to pointer and focus
    closeRef.current?.focus()
  }, [])
  useEffect(() => {
    // Capture phase, so the point card behind never sees this Escape.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      e.preventDefault() // no native cancel on top: close() already handles it
      close()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  // Minimal focus trap: Tab wraps between the first and last focusable element.
  const trap = (e: React.KeyboardEvent<HTMLDialogElement>) => {
    if (e.key !== 'Tab') return
    const f = e.currentTarget.querySelectorAll<HTMLElement>('button, a[href]')
    const edge = e.shiftKey ? f[0] : f[f.length - 1]
    if (document.activeElement === edge) {
      e.preventDefault()
      ;(e.shiftKey ? f[f.length - 1] : f[0]).focus()
    }
  }

  return (
    <dialog ref={dialogRef} className={styles.dialog} aria-label={t('about.title')} data-testid="about" onKeyDown={trap}>
      <div className={styles.head}>
        <strong>{t('about.title')}</strong>
        <button type="button" className="icon-btn" ref={closeRef} aria-label={t('ui.close')} onClick={close}><IconClose /></button>
      </div>
      <p>{t('about.model')}</p>
      <p><a href={`${import.meta.env.BASE_URL}${locale === 'ru' ? 'about-ru.html' : 'about.html'}`}>{t('about.guide')}</a></p>
      <h3>{t('about.sources')}</h3>
      <ul>
        {Object.entries(sources).map(([id, s]) => (
          <li key={id}>
            <a href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a>
            <small>{s.license}</small>
            <small>{t('about.period')}: {s.period} · {t('about.retrieved')} {s.retrieved}</small>
            <small>{s.citation}</small>
          </li>
        ))}
      </ul>
      <p>{t('about.license')}</p>
    </dialog>
  )
}
