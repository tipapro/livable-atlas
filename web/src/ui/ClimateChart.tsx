import { useT } from '../i18n'
import { useAtlasStore } from '../state/store'
import type { PointDetail } from '../worker/protocol'
import { fmt, monthNames, unitLabel } from './format'

type Monthly = PointDetail['monthly']
const r1 = (v: number) => Number(v.toFixed(1))
const finite = (a: number[]) => a.filter(Number.isFinite)

// Plot-area geometry in a width x height box; month m is the centre of the m-th twelfth.
export function chartGeometry(m: Monthly, width: number, height: number) {
  const lows = finite(m.tmin), highs = finite(m.tmax)
  // No lows: hang the axis 5° below the lowest high instead of a silent 0.
  const tMin = lows.length ? Math.floor(Math.min(...lows) / 5) * 5 : highs.length ? Math.floor(Math.min(...highs) / 5) * 5 - 5 : 0
  const tMax = highs.length ? Math.max(Math.ceil(Math.max(...highs) / 5) * 5, tMin + 5) : tMin + 5
  const band = width / 12
  const line = (a: number[]) =>
    a.flatMap((v, i) => (Number.isFinite(v) ? [`${r1(band * (i + 0.5))},${r1(height * (1 - (v - tMin) / (tMax - tMin)))}`] : [])).join(' ')
  const pMax = m.prec ? Math.max(0, ...finite(m.prec)) : 0
  const bars = (m.prec ?? []).map((v, i) => {
    const h = pMax > 0 && Number.isFinite(v) ? (height * v) / pMax : 0
    return { x: r1(band * i + band * 0.15), y: r1(height - h), w: r1(band * 0.7), h: r1(h) }
  })
  return { tmax: line(m.tmax), tmin: line(m.tmin), bars, tMin, tMax, pMax }
}

// Extremes and yearly precipitation for the aria-label; null when the series has no finite value.
export function chartSummary(m: Monthly) {
  const hi = finite(m.tmax), lo = finite(m.tmin), pr = m.prec ? finite(m.prec) : []
  return {
    tmax: hi.length ? Math.max(...hi) : null,
    tmin: lo.length ? Math.min(...lo) : null,
    prec: pr.length ? Math.round(pr.reduce((x, v) => x + v, 0)) : null,
  }
}

export const TMAX = 'var(--chart-tmax)', TMIN = 'var(--chart-tmin)', PREC = 'var(--chart-prec)'
const W = 240, H = 100, LEFT = 30, RIGHT = 34, TOP = 6, BOTTOM = 16

export default function ClimateChart({ monthly }: { monthly: Monthly }) {
  const t = useT()
  const locale = useAtlasStore(s => s.locale)
  const g = chartGeometry(monthly, W, H)
  const sm = chartSummary(monthly)
  const parts = [
    sm.tmax !== null && `${t('ui.monthly.tmax')} ${fmt(sm.tmax)}°`,
    sm.tmin !== null && `${t('ui.monthly.tmin')} ${fmt(sm.tmin)}°`,
    sm.prec !== null && `${t('ui.monthly.prec')} ${sm.prec} ${unitLabel(locale, 'mm')}`,
  ].filter(Boolean)
  const summary = t('ui.monthlyClimate') + (parts.length ? `: ${parts.join(', ')}` : '')
  return (
    <svg viewBox={`0 0 ${LEFT + W + RIGHT} ${TOP + H + BOTTOM}`} role="img" aria-label={summary} fontSize="8">
      <g transform={`translate(${LEFT} ${TOP})`}>
        <rect width={W} height={H} fill="none" style={{ stroke: 'var(--c-border)' }} />
        {g.bars.map((b, i) => (
          <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} style={{ fill: PREC }}>
            {Number.isFinite(monthly.prec![i]) && <title>{`${monthNames(locale)[i]}: ${fmt(monthly.prec![i])} ${unitLabel(locale, 'mm')}`}</title>}
          </rect>
        ))}
        <polyline points={g.tmax} fill="none" style={{ stroke: TMAX }} strokeWidth="1.5" />
        <polyline points={g.tmin} fill="none" style={{ stroke: TMIN }} strokeWidth="1.5" />
        <text x={-3} y={4} textAnchor="end">{g.tMax}°</text>
        <text x={-3} y={H} textAnchor="end">{g.tMin}°</text>
        {g.bars.length > 0 && <text x={W + 3} y={4}>{Math.round(g.pMax)} {unitLabel(locale, 'mm')}</text>}
        {monthNames(locale).map((n, i) => (
          <text key={i} x={(W / 12) * (i + 0.5)} y={H + 11} textAnchor="middle">{n.replace('.', '').slice(0, 3)}</text>
        ))}
      </g>
    </svg>
  )
}
