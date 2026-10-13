import { useSyncExternalStore } from 'react'

export const MOBILE = '(max-width: 767px)' // the side panel and the card move into a bottom sheet
export const NARROW = '(max-width: 1023px)' // no room for the city list beside the card

export const useMedia = (query: string) =>
  useSyncExternalStore(
    cb => {
      const m = matchMedia(query)
      m.addEventListener('change', cb)
      return () => m.removeEventListener('change', cb)
    },
    () => matchMedia(query).matches,
  )
