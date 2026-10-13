import type { Locale } from '../state/store'

export const fmt = (v: number) => String(Number(v.toPrecision(3)))

const RU_UNITS: Record<string, string> = {
  mm: 'мм', h: 'ч', days: 'дн.', 'W/m²': 'Вт/м²', 'm/s': 'м/с', mo: 'мес.', km: 'км', m: 'м', '/decade': '/10 лет',
  min: 'мин', 'people/km²': 'чел./км²', index: 'индекс', '/100k': '/100 тыс.', ratio: 'отн.', 'µg/m³': 'мкг/м³',
}

export const unitLabel = (locale: Locale, unit: string) => (locale === 'ru' ? RU_UNITS[unit] ?? unit : unit)

export const monthNames = (locale: Locale) =>
  Array.from({ length: 12 }, (_, m) => new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(Date.UTC(2001, m, 1)))

// compass is the 4-letter N S E W string of the active locale.
export const coordsLabel = (lat: number, lon: number, compass: string) => {
  const la = Math.round(lat * 100) / 100, lo = Math.round(lon * 100) / 100 // hemisphere from the rounded value, so -0.001 reads 0.00° N
  return `${Math.abs(la).toFixed(2)}° ${compass[la < 0 ? 1 : 0]}, ${Math.abs(lo).toFixed(2)}° ${compass[lo < 0 ? 3 : 2]}`
}
