import type { City, CountryName, Manifest } from './data/format'
import { dataBase } from './data/load'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useT } from './i18n'
import { isModeAvailable } from './scoring/modes'
import { SAN_DIEGO } from './scoring/presets'
import type { PointSample } from './scoring/score'
import { SAVE_FAILED, useAtlasStore } from './state/store'
import About from './ui/About'
import ErrorScreen from './ui/ErrorScreen'
import CompareTable from './ui/CompareTable'
import Legend from './ui/Legend'
import { IconClose } from './ui/icons'
import LoadingCard from './ui/LoadingCard'
import ModeBar from './ui/ModeBar'
import PointCard from './ui/PointCard'
import SettingsPanel from './ui/SettingsPanel'
import SidePanel from './ui/SidePanel'
import TopBar from './ui/TopBar'
import TopCities from './ui/TopCities'
import { MOBILE, NARROW, useMedia } from './ui/useMedia'
import { AtlasClient } from './worker/client'
import type { PointDetail, Scale } from './worker/protocol'
import styles from './App.module.css'

const MapView = lazy(() => import('./map/MapView').catch(() => ({ default: MapLoadError })))

function MapLoadError() {
  const t = useT()
  return <div className={styles.status} role="alert"><span>{t('ui.mapLoadError')}</span><button type="button" onClick={() => location.reload()}>{t('ui.retry')}</button></div>
}

export default function App() {
  const t = useT()
  const factors = useAtlasStore(s => s.factors)
  const comfort = useAtlasStore(s => s.comfort)
  const groups = useAtlasStore(s => s.groups)
  const strength = useAtlasStore(s => s.strength)
  const mapMode = useAtlasStore(s => s.mapMode)
  const month = useAtlasStore(s => s.month)
  const contrast = useAtlasStore(s => s.contrast)
  const [attempt, setAttempt] = useState(0)
  const [client, setClient] = useState<AtlasClient | null>(null)
  const [fatal, setFatal] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [basemapFailed, setBasemapFailed] = useState(false) // kept apart from toast: the next render clears worker toasts
  const [saveFailed, setSaveFailed] = useState(false) // localStorage refused a write (store.ts); shown until closed
  useEffect(() => {
    const onFail = () => setSaveFailed(true)
    window.addEventListener(SAVE_FAILED, onFail)
    return () => window.removeEventListener(SAVE_FAILED, onFail)
  }, [])
  const [pixels, setPixels] = useState<{ data: Uint8ClampedArray; size: number } | null>(null)
  const [scale, setScale] = useState<Scale | null>(null)
  const [renders, setRenders] = useState(0)
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [cities, setCities] = useState<City[]>([])
  const [countries, setCountries] = useState<[string, CountryName][]>([])
  // reference: the San Diego sample, shown as the "CA" marker in the settings panel.
  const [reference, setReference] = useState<PointSample | null>(null)
  const [point, setPoint] = useState<{ lat: number; lon: number } | null>(null)
  const [top, setTop] = useState<[number, number][]>([])
  const [focus, setFocus] = useState<{ lat: number; lon: number; key: number } | null>(null)
  const pinned = useAtlasStore(s => s.pinned)
  const [about, setAbout] = useState(false)
  const aboutRef = useRef<HTMLButtonElement>(null)
  const [sampled, setSampled] = useState<{ points: typeof pinned; samples: (PointSample | null)[] }>()
  const [detail, setDetail] = useState<PointDetail | null | undefined>()
  const [progress, setProgress] = useState<{ loaded: number; total: number | null }>({ loaded: 0, total: null })
  const [precState, setPrecState] = useState<{ error: string | null } | null>(null) // null = prec.bin not settled yet
  const [precDismissed, setPrecDismissed] = useState(false) // the user closed the prec error until the next load attempt

  const toastError = useCallback((e: unknown) => setToast(String(e instanceof Error ? e.message : e)), [])

  useEffect(() => {
    const worker = new Worker(new URL('./worker/atlas.worker.ts', import.meta.url), { type: 'module' })
    const c = new AtlasClient(worker)
    let dead = false
    let loaded = false
    const fail = (message: string) => !dead && setFatal(message)
    // After load the map keeps its render, so a late worker error is only a toast.
    worker.onerror = e => {
      const message = e.message || 'worker error'
      if (loaded) setToast(message)
      else fail(message)
    }
    c.onError = setToast
    c.onProgress = (loaded, total) => setProgress({ loaded, total })
    c.onPrec = error => setPrecState({ error })
    c.onScored = (data, size, ms, top, scale) => {
      if (import.meta.env.DEV) console.debug('ms', ms)
      setToast(null)
      setPixels({ data, size })
      setTop(top)
      setScale(scale)
      setRenders(n => n + 1)
    }
    c.init(dataBase(import.meta.env.BASE_URL, location.href)).then(({ manifest, cities, countries }) => {
      if (dead) return
      loaded = true
      setManifest(manifest)
      setCities(cities)
      setCountries(countries)
      setClient(c)
    }, e => fail(e instanceof Error ? e.message : String(e)))
    return () => {
      dead = true
      worker.terminate()
      setClient(null)
    }
  }, [attempt])

  // A saved mode whose data this build lacks falls back to the score.
  useEffect(() => {
    if (manifest && !isModeAvailable(mapMode, manifest)) useAtlasStore.getState().setMapMode('score')
  }, [manifest, mapMode])

  // A prec.bin that failed to load cannot be mapped: fall back to the score (the status line says why).
  const precError = precState?.error ?? null
  useEffect(() => {
    if (precError !== null && mapMode === 'monthly:prec') useAtlasStore.getState().setMapMode('score')
  }, [precError, mapMode])

  useEffect(() => client?.score({ factors, comfort, groups, strength }, { mode: mapMode, month, contrast }), [client, factors, comfort, groups, strength, mapMode, month, contrast])

  // The CA reference marker follows comfort_months, which depends on the comfort params.
  useEffect(() => {
    if (!client) return
    let stale = false
    const { factors, groups, strength } = useAtlasStore.getState() // read, not subscribed: the marker shows values, which only comfort changes
    client.sample(SAN_DIEGO.lat, SAN_DIEGO.lon, { factors, comfort, groups, strength }).then(r => !stale && setReference(r)).catch(toastError)
    return () => {
      stale = true
    }
  }, [client, comfort, toastError])

  // Re-request the open card's point whenever the settings change; a result for an earlier click or settings is dropped.
  useEffect(() => {
    if (!client || !point) return
    let stale = false
    client.detail(point.lat, point.lon, { factors, comfort, groups, strength }).then(d => !stale && setDetail(d)).catch(toastError)
    return () => {
      stale = true
    }
  }, [client, point, factors, comfort, groups, strength, precState, toastError]) // precState: the card answers before prec.bin is in, then asks again

  // Same for the pinned points; the table shows the previous samples until the new ones arrive.
  useEffect(() => {
    if (!client) return
    let stale = false
    Promise.all(pinned.map(p => client.sample(p.lat, p.lon, { factors, comfort, groups, strength }))).then(samples => !stale && setSampled({ points: pinned, samples })).catch(toastError)
    return () => {
      stale = true
    }
  }, [client, pinned, factors, comfort, groups, strength, toastError])
  const closeAbout = useCallback(() => {
    setAbout(false)
    aboutRef.current?.focus()
  }, [])

  const onClick = useCallback((lat: number, lon: number) => {
    setDetail(undefined)
    setPoint({ lat, lon })
  }, [])
  const onCity = useCallback((i: number) => {
    const c = cities[i]
    setFocus(f => ({ lat: c[3], lon: c[4], key: (f?.key ?? 0) + 1 }))
    onClick(c[3], c[4])
  }, [cities, onClick])
  const onClose = useCallback(() => {
    setPoint(null)
    setDetail(undefined)
  }, [])

  const locale = useAtlasStore(s => s.locale)
  useEffect(() => void (document.documentElement.lang = locale), [locale])
  const panel = useAtlasStore(s => s.ui.panel)
  const forceRail = useMedia(NARROW) && !!point // no room for the panel beside the card
  const mobile = useMedia(MOBILE) // the card moves into the bottom sheet's Place tab

  if (fatal) {
    return (
      <ErrorScreen
        message={fatal}
        onRetry={() => {
          setFatal(null)
          // A retried load starts clean: loading status, data-renders back to 0, no stale card.
          setPixels(null)
          setRenders(0)
          setToast(null)
          setBasemapFailed(false)
          setPoint(null)
          setFocus(null)
          setTop([])
          setScale(null)
          setDetail(undefined)
          setReference(null)
          setPrecState(null)
          setPrecDismissed(false)
          setProgress({ loaded: 0, total: null })
          setManifest(null)
          setAttempt(a => a + 1)
        }}
      />
    )
  }

  const card = point && <PointCard point={point} detail={detail} cities={cities} countries={countries} tone={scale?.tone ?? null} onClose={onClose} />
  const precMessage = precError !== null && !precDismissed ? `${t('ui.precError')} (${precError})` : null
  const saveMessage = saveFailed ? t('ui.saveFailed') : null
  const status = toast ?? (basemapFailed ? t('ui.basemapError') : null) ?? saveMessage ?? precMessage
  return (
    <main className={`${styles.app} ${panel === 'rail' || forceRail ? styles.railed : ''}`} data-testid="app" data-renders={renders}>
      {/* DOM order is the keyboard order: top bar, panel, map, card, dock */}
      <TopBar cities={cities} onSelect={onCity} aboutDisabled={!manifest} onAbout={() => setAbout(true)} aboutRef={aboutRef} />
      {manifest && (
        <SidePanel
          settings={<SettingsPanel manifest={manifest} reference={reference} />}
          cities={<TopCities cities={cities} top={top} onSelect={onCity} />}
          compare={<CompareTable points={pinned} samples={pinned.map((_, i) => (sampled?.points === pinned ? sampled.samples[i] : undefined))} cities={cities} />}
          place={mobile && card}
          point={point}
          pinnedCount={pinned.length}
          forceRail={forceRail}
          onLeaveRail={onClose}
        />
      )}
      <Suspense fallback={<div className={styles.mapChip} data-testid="map-loading">{t('ui.loadingMap')}</div>}>
        <MapView pixels={pixels} onClick={onClick} marker={point} focus={focus} onBasemap={setBasemapFailed} />
      </Suspense>
      {!mobile && card}
      <div className={styles.dock} data-testid="dock">
        {manifest && <ModeBar manifest={manifest} precFailed={precError !== null} />}
        <Legend mode={mapMode} scale={scale} />
      </div>
      {!pixels && <LoadingCard loaded={progress.loaded} total={progress.total} />}
      {status && (
        <div className={`${styles.status} ${point && !mobile ? styles.beside : ''}`} role="status">
          <span>{status}</span>
          {(status === precMessage || status === saveMessage) && (
            <button type="button" className="icon-btn" aria-label={t('ui.close')} onClick={() => (status === saveMessage ? setSaveFailed(false) : setPrecDismissed(true))}><IconClose /></button>
          )}
        </div>
      )}
      {about && manifest && <About sources={manifest.sources} onClose={closeAbout} />}
    </main>
  )
}
