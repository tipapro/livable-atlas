import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>

const Svg = (p: P & { d: string }) => {
  const { d, ...rest } = p
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <path d={d} />
    </svg>
  )
}

export const IconSearch = (p: P) => <Svg d="M8.5 15a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM13.2 13.2 18 18" {...p} />
export const IconSettings = (p: P) => <Svg d="M3 6h9M16 6h1M3 14h1M8 14h9M14 3.5v5M6 11.5v5" {...p} />
export const IconCities = (p: P) => <Svg d="M3 17V8l5-3v12M8 17V3l6 3v11M2 17h16M11 8.5h1M11 11.5h1" {...p} />
export const IconCompare = (p: P) => <Svg d="M7 3 3 7l4 4M3 7h14M13 9l4 4-4 4M17 13H3" {...p} />
export const IconInfo = (p: P) => <Svg d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM10 9v5M10 6.2v.1" {...p} />
export const IconClose = (p: P) => <Svg d="M5 5l10 10M15 5 5 15" {...p} />
// Points down; rotate it for the other directions.
export const IconChevron = (p: P) => <Svg d="m5 8 5 5 5-5" {...p} />
export const IconGlobe = (p: P) => <Svg d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM2 10h16M10 2c2.5 2.2 3.5 5 3.5 8s-1 5.8-3.5 8c-2.5-2.2-3.5-5-3.5-8s1-5.8 3.5-8Z" {...p} />
export const IconPin = (p: P) => <Svg d="M10 18s6-5.2 6-9.5a6 6 0 0 0-12 0C4 12.8 10 18 10 18ZM10 10.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" {...p} />
