import { useEffect, useState, type CSSProperties, type InputHTMLAttributes } from 'react'
import { useT } from '../i18n'
import type { Key } from '../i18n'
import type { ComfortSettings, FactorDef } from '../scoring/factors'
import { useAtlasStore } from '../state/store'
import { fmt, unitLabel } from './format'
import { IconChevron } from './icons'
import styles from './SettingsPanel.module.css'

const COMFORT_FIELDS: Exclude<keyof ComfortSettings, 'sunBonus'>[] = ['dayLo', 'dayHi', 'nightMin', 'dewMax']

// Log factors are dragged on log10(value) so the slider is usable across five orders of magnitude.
const toPos = (def: FactorDef, v: number) => (def.log ? Math.log10(Math.max(v, def.min)) : v)
const fromPos = (def: FactorDef, p: number) => (def.log ? Number((10 ** p).toPrecision(3)) : p)

// Keeps the typed text locally so "-" or an empty field can exist mid-edit; the store only sees valid numbers.
function NumField({ value, onCommit, ...rest }: { value: number; onCommit(n: number): void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(cur => (cur !== '' && Number(cur) === value ? cur : String(value))), [value])
  return (
    <input
      {...rest}
      type="number"
      value={text}
      onChange={e => {
        setText(e.target.value)
        const n = e.target.valueAsNumber
        if (!Number.isNaN(n)) onCommit(n)
      }}
      onBlur={() => setText(String(value))}
    />
  )
}

interface Props {
  def: FactorDef
  available: boolean
  refValue: number | null
}

export default function FactorRow({ def, available, refValue }: Props) {
  const t = useT()
  const locale = useAtlasStore(st => st.locale)
  const unit = unitLabel(locale, def.unit)
  const [open, setOpen] = useState(false)
  const s = useAtlasStore(st => st.factors[def.id])
  const comfort = useAtlasStore(st => st.comfort)
  const setFactor = useAtlasStore(st => st.setFactor)
  const setComfort = useAtlasStore(st => st.setComfort)
  const name = t(`factor.${def.id}` as Key)
  const min = toPos(def, def.min)
  const max = toPos(def, def.max)
  const step = def.log ? 0.01 : def.step
  const expanded = open && available
  const marker = refValue === null ? null : Math.min(1, Math.max(0, (toPos(def, refValue) - min) / (max - min)))
  const valueText = (v: number) => `${fmt(v)} ${unit}`

  const bound = (key: 'lo' | 'hi', label: Key) => (
    <label className={styles.field}>
      <span>{t(label)}</span>
      <input
        type="range"
        aria-label={`${name} — ${t(label)}`}
        min={min}
        max={max}
        step={step}
        value={toPos(def, s[key])}
        aria-valuetext={valueText(s[key])}
        disabled={!available}
        onChange={e => setFactor(def.id, { [key]: fromPos(def, e.target.valueAsNumber) })}
      />
      <output>{fmt(s[key])}</output>
    </label>
  )

  return (
    <div className={styles.row} data-testid={`factor-${def.id}`}>
      <div className={styles.head}>
        <span className={styles.name}>{name}</span>
        {!available && <span className={styles.noData}>{t('ui.noData')}</span>}
      </div>
      <div className={styles.controls}>
        <input
          type="range"
          aria-label={`${name} — ${t('ui.aria.weight')}`}
          min={0}
          max={5}
          step={1}
          value={s.weight}
          disabled={!available}
          onChange={e => setFactor(def.id, { weight: e.target.valueAsNumber })}
        />
        <output>{s.weight}</output>
        <label className={styles.critical}>
          <input
            type="checkbox"
            aria-label={`${name} — ${t('ui.aria.critical')}`}
            checked={s.critical}
            disabled={!available}
            onChange={e => setFactor(def.id, { critical: e.target.checked })}
          />
          {t('ui.critical')}
        </label>
        <button
          type="button"
          className="icon-btn"
          aria-expanded={expanded}
          aria-label={name}
          disabled={!available}
          onClick={() => setOpen(!open)}
        >
          <IconChevron style={{ transform: expanded ? undefined : 'rotate(-90deg)' }} />
        </button>
      </div>
      {expanded && (
        <div className={styles.details}>
          <p className={styles.desc}>{t(`desc.${def.id}` as Key)}</p>
          {bound('lo', 'ui.aria.from')}
          {bound('hi', 'ui.aria.to')}
          {marker !== null && (
            <div className={styles.ref}>
              <span>CA</span>
              <div className={styles.refTrack} style={{ '--pos': marker } as CSSProperties}>
                <span className={styles.tick} />
                {valueText(refValue!)}
              </div>
            </div>
          )}
          <label className={styles.field}>
            <span>
              {t('ui.tolerance')}, {def.log ? t('ui.decades') : unit}
            </span>
            <NumField min={0} step={def.log ? 0.1 : def.step} value={s.tol} onCommit={n => setFactor(def.id, { tol: n })} />
          </label>
          {def.id === 'comfort_months' &&
            COMFORT_FIELDS.map(k => (
              <label key={k} className={styles.field}>
                <span>{t(`ui.comfort.${k}`)}</span>
                <NumField step={0.5} value={comfort[k]} onCommit={n => setComfort({ [k]: n })} />
              </label>
            ))}
          {def.id === 'cold_feel' && (
            <label className={styles.field}>
              <span>{t('ui.sunBonus')}</span>
              <NumField step={0.5} value={comfort.sunBonus} onCommit={n => setComfort({ sunBonus: n })} />
            </label>
          )}
        </div>
      )}
    </div>
  )
}
