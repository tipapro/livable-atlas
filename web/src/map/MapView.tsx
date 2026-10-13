import { type CanvasSource, Map as MapLibre, Marker, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n'
import { MERCATOR_COORDS } from '../render/paint'
import { MOBILE } from '../ui/useMedia'
import styles from '../App.module.css'

// Vite's dep pre-bundling breaks maplibre's default worker URL, so point it at the shipped worker file.
setWorkerUrl(workerUrl)

interface Props {
  pixels: { data: Uint8ClampedArray; size: number } | null
  onClick(lat: number, lon: number): void
  marker: { lat: number; lon: number } | null
  focus: { lat: number; lon: number; key: number } | null // fly there whenever key changes
  onBasemap(failed: boolean): void // true on a MapLibre error before load, false once it loads
}

export default function MapView({ pixels, onClick, marker, focus, onBasemap }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibre | null>(null)
  const canvas = useRef(document.createElement('canvas'))
  const onClickRef = useRef(onClick)
  onClickRef.current = onClick
  const onBasemapRef = useRef(onBasemap)
  onBasemapRef.current = onBasemap
  const t = useT()
  const [loaded, setLoaded] = useState(false)
  const [tiles, setTiles] = useState(false) // tiles or the style are being fetched
  const [failed, setFailed] = useState(false) // the basemap error is shown instead of the chip

  useEffect(() => {
    const m = new MapLibre({
      container: container.current!,
      style: 'https://tiles.openfreemap.org/styles/positron',
      center: [0, 30],
      zoom: 1.5,
      renderWorldCopies: true,
      attributionControl: { compact: true },
      canvasContextAttributes: { preserveDrawingBuffer: import.meta.env.DEV }, // lets the e2e read pixels back
    })
    map.current = m
    if (import.meta.env.DEV) Object.assign(window, { __map: m }) // e2e hook
    let ready = false
    // An error before load means the style or its first tiles failed; load clears it again.
    m.on('error', () => {
      if (ready) return
      setFailed(true)
      onBasemapRef.current(true)
    })
    m.on('load', () => {
      ready = true
      setFailed(false)
      onBasemapRef.current(false)
      // Mobile: start the attribution collapsed, as MapLibre does after the first drag; expanded it covers the dock.
      if (matchMedia(MOBILE).matches) m.getContainer().querySelector('.maplibregl-compact-show')?.classList.remove('maplibregl-compact-show')
      const firstSymbol = m.getStyle().layers.find(l => l.type === 'symbol')?.id
      m.addSource('score', { type: 'canvas', canvas: canvas.current, coordinates: MERCATOR_COORDS, animate: false })
      m.addLayer(
        { id: 'score', type: 'raster', source: 'score', paint: { 'raster-opacity': 0.75, 'raster-resampling': 'nearest' } },
        firstSymbol,
      )
      setLoaded(true)
    })
    m.on('dataloading', () => setTiles(true))
    m.on('idle', () => setTiles(false))
    m.on('click', e => {
      const { lat, lng } = e.lngLat.wrap() // a click on a world copy still means the same cell
      onClickRef.current(lat, lng)
    })
    return () => {
      m.remove()
      map.current = null
      setLoaded(false)
    }
  }, [])

  useEffect(() => {
    const m = map.current
    if (!loaded || !m || !pixels) return
    canvas.current.width = canvas.current.height = pixels.size
    canvas.current.getContext('2d')!.putImageData(new ImageData(pixels.data as Uint8ClampedArray<ArrayBuffer>, pixels.size, pixels.size), 0, 0)
    // An animate:false canvas source only re-reads the canvas while playing; pause again after one frame.
    const source = m.getSource<CanvasSource>('score')!
    source.play()
    m.once('render', () => source.pause())
  }, [pixels, loaded])

  useEffect(() => {
    // Mobile: the city lands in the middle of the map left above the half-height sheet. offset does not persist, unlike padding.
    if (focus) map.current?.flyTo({ center: [focus.lon, focus.lat], zoom: 7, offset: matchMedia(MOBILE).matches ? [0, -innerHeight * 0.25] : [0, 0] })
  }, [focus])

  const pin = useRef<Marker | null>(null)
  useEffect(() => {
    const m = map.current
    if (!m || !marker) return void pin.current?.remove()
    pin.current ??= new Marker()
    pin.current.setLngLat([marker.lon, marker.lat]).addTo(m)
  }, [marker, loaded])
  useEffect(() => () => void pin.current?.remove(), [])

  return (
    <>
      <div ref={container} className={styles.map} />
      {!loaded && !failed && <div className={styles.mapChip} data-testid="map-loading">{t('ui.loadingMap')}</div>}
      {loaded && tiles && <div className={styles.spinner} data-testid="tiles-spinner" aria-hidden="true" />}
    </>
  )
}
