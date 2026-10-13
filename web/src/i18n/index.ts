import { useAtlasStore, type Locale } from '../state/store'
import { en } from './en'
import { ru } from './ru'

export type Key = keyof typeof en

export const t = (locale: Locale, key: Key): string => (locale === 'ru' ? ru : en)[key]

export const useT = () => {
  const locale = useAtlasStore(s => s.locale)
  return (key: Key) => t(locale, key)
}
