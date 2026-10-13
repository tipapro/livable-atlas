import type { Manifest } from '../data/format'
import { useT } from '../i18n'
import type { Key } from '../i18n'
import { FACTORS, GROUPS, isAvailable } from '../scoring/factors'
import type { PointSample } from '../scoring/score'
import { useAtlasStore } from '../state/store'
import FactorRow from './FactorRow'
import styles from './SettingsPanel.module.css'

export default function SettingsPanel({ manifest, reference }: { manifest: Manifest; reference: PointSample | null }) {
  const t = useT()
  const presetId = useAtlasStore(s => s.presetId)
  const userPresets = useAtlasStore(s => s.userPresets)
  const groups = useAtlasStore(s => s.groups)
  const strength = useAtlasStore(s => s.strength)
  const { applyPreset, resetToPreset, savePreset, deletePreset, setGroup, setStrength } = useAtlasStore.getState()
  const isUser = Object.hasOwn(userPresets, presetId)

  const save = () => {
    const name = window.prompt(t('ui.saveAs'))?.trim()
    if (name && (!Object.hasOwn(userPresets, name) || window.confirm(t('ui.overwrite')))) savePreset(name)
  }

  return (
    <>
      <div className={styles.presets}>
        <select aria-label={t('ui.preset')} value={presetId} onChange={e => applyPreset(e.target.value)}>
          <option value="california">{t('ui.californiaPreset')}</option>
          {Object.keys(userPresets).map(name => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <button type="button" onClick={save}>
          {t('ui.saveAs')}
        </button>
        <button type="button" disabled={!isUser} onClick={() => deletePreset(presetId)}>
          {t('ui.delete')}
        </button>
        <button type="button" onClick={resetToPreset}>
          {t('ui.reset')}
        </button>
      </div>
      <label className={styles.strength}>
        <span>{t('ui.strength')}</span>
        <input type="range" aria-label={t('ui.strength')} min={0} max={1} step={0.05} value={strength} onChange={e => setStrength(e.target.valueAsNumber)} />
        <output>{strength}</output>
      </label>
      {GROUPS.map(g => (
        <section key={g}>
          <div className={styles.group}>
            <h3>{t(`group.${g}` as Key)}</h3>
            <input
              type="range"
              aria-label={`${t(`group.${g}` as Key)} — ${t('ui.aria.groupWeight')}`}
              min={0}
              max={5}
              step={0.5}
              value={groups[g]}
              onChange={e => setGroup(g, e.target.valueAsNumber)}
            />
            <output>{groups[g]}</output>
          </div>
          {FACTORS.filter(f => f.group === g).map(def => (
            <FactorRow key={def.id} def={def} available={isAvailable(def.id, manifest)} refValue={reference?.factors[def.id]?.value ?? null} />
          ))}
        </section>
      ))}
    </>
  )
}
