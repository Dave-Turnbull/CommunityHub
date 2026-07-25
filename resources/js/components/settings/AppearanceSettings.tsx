import { useEffect, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { fetchThemePreference, updateThemePreference } from '@/services/api'
import { useTheme } from '@/stores'
import {
    THEME_GROUPS,
    THEME_VARIABLES,
    THEME_PRESETS,
    THEME_PRESET_META,
    resolveThemeValues,
    applyThemeValues,
    tripletToHex,
    hexToTriplet,
    type ThemeVariable,
} from '@/services/theme'

const PRESET_SWATCH_KEYS = ['--surface-app', '--surface-panel', '--color-brand', '--text-primary']

export function AppearanceSettings() {
    const preset = useTheme((s) => s.preset)
    const overrides = useTheme((s) => s.overrides)
    const hydrate = useTheme((s) => s.hydrate)
    const setPreset = useTheme((s) => s.setPreset)
    const setOverride = useTheme((s) => s.setOverride)
    const [loaded, setLoaded] = useState(false)
    const saveTimeout = useRef<ReturnType<typeof setTimeout>>()

    useEffect(() => {
        fetchThemePreference().then((preference) => {
            hydrate(preference.preset, preference.overrides)
            applyThemeValues(resolveThemeValues(preference.preset, preference.overrides))
            setLoaded(true)
        })

        return () => clearTimeout(saveTimeout.current)
    }, [hydrate])

    const values = useMemo(() => resolveThemeValues(preset, overrides), [preset, overrides])

    // Applying to the DOM happens on every tick for instant feedback; saving
    // to the server is debounced so dragging a slider doesn't fire a PUT per
    // frame — only once, shortly after the user stops moving it.
    const persist = (nextPreset: string, nextOverrides: Record<string, string>) => {
        clearTimeout(saveTimeout.current)
        saveTimeout.current = setTimeout(() => {
            updateThemePreference({ preset: nextPreset, overrides: nextOverrides })
        }, 400)
    }

    const applyPreset = (name: string) => {
        setPreset(name)
        applyThemeValues(resolveThemeValues(name, {}))
        persist(name, {})
    }

    const changeVariable = (key: string, value: string) => {
        setOverride(key, value)
        const next = { ...overrides, [key]: value }
        applyThemeValues(resolveThemeValues(preset, next))
        persist(preset, next)
    }

    if (!loaded) {
        return <p className="text-sm text-text-muted">Loading…</p>
    }

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-3">
                    Presets
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {THEME_PRESET_META.map((meta) => {
                        const swatch = THEME_PRESETS[meta.key]
                        const active = preset === meta.key && Object.keys(overrides).length === 0

                        return (
                            <button
                                key={meta.key}
                                type="button"
                                onClick={() => applyPreset(meta.key)}
                                className={clsx(
                                    'text-left rounded-lg border p-3 transition-colors duration-100 bg-surface-panel',
                                    active ? 'border-brand' : 'border-surface-subtle hover:border-brand',
                                )}
                            >
                                <div className="flex gap-1 mb-2">
                                    {PRESET_SWATCH_KEYS.map((key) => (
                                        <span
                                            key={key}
                                            className="w-5 h-5 rounded-full border border-surface-subtle"
                                            style={{ backgroundColor: tripletToHex(swatch[key]) }}
                                        />
                                    ))}
                                </div>
                                <p className="text-sm font-medium text-text-primary">{meta.label}</p>
                                <p className="text-xs text-text-muted mt-0.5">{meta.description}</p>
                            </button>
                        )
                    })}
                </div>
            </div>

            {THEME_GROUPS.map((group) => (
                <div key={group} className="bg-surface-panel rounded-lg p-5">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-4">
                        {group}
                    </h3>
                    <div className="space-y-4">
                        {THEME_VARIABLES.filter((variable) => variable.group === group).map((variable) => (
                            <ThemeVariableControl
                                key={variable.key}
                                variable={variable}
                                value={values[variable.key]}
                                onChange={(value) => changeVariable(variable.key, value)}
                            />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    )
}

interface ControlProps {
    variable: ThemeVariable
    value: string
    onChange: (value: string) => void
}

function ThemeVariableControl({ variable, value, onChange }: ControlProps) {
    if (variable.control === 'color') {
        const hex = tripletToHex(value)

        return (
            <label className="flex items-center justify-between gap-4">
                <span className="text-sm text-text-primary">{variable.label}</span>
                <span className="flex items-center gap-2">
                    <input
                        type="color"
                        value={hex}
                        onChange={(e) => onChange(hexToTriplet(e.target.value))}
                        aria-label={variable.label}
                        className="w-8 h-8 rounded border border-surface-subtle bg-surface-inset cursor-pointer"
                    />
                    <span className="text-xs text-text-muted font-mono w-16">{hex}</span>
                </span>
            </label>
        )
    }

    if (variable.control === 'select') {
        return (
            <label className="flex items-center justify-between gap-4">
                <span className="text-sm text-text-primary">{variable.label}</span>
                <select
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    aria-label={variable.label}
                    className="bg-surface-inset border border-surface-subtle rounded px-2 py-1.5 text-sm text-text-primary focus:outline-none focus:border-brand transition-colors duration-100"
                >
                    {variable.options?.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                </select>
            </label>
        )
    }

    const numeric = parseFloat(value) || 0

    if (variable.control === 'slider') {
        return (
            <label className="flex items-center justify-between gap-4">
                <span className="text-sm text-text-primary">{variable.label}</span>
                <span className="flex items-center gap-3">
                    <input
                        type="range"
                        min={variable.min}
                        max={variable.max}
                        step={variable.step}
                        value={numeric}
                        onChange={(e) => onChange(`${e.target.value}${variable.unit}`)}
                        aria-label={variable.label}
                        className="w-32 accent-brand"
                    />
                    <span className="text-xs text-text-muted font-mono w-14 text-right">
                        {numeric}{variable.unit}
                    </span>
                </span>
            </label>
        )
    }

    return (
        <label className="flex items-center justify-between gap-4">
            <span className="text-sm text-text-primary">{variable.label}</span>
            <input
                type="number"
                min={variable.min}
                max={variable.max}
                step={variable.step}
                value={numeric}
                onChange={(e) => onChange(`${e.target.value}${variable.unit}`)}
                aria-label={variable.label}
                className="w-20 bg-surface-inset border border-surface-subtle rounded px-2 py-1 text-sm text-text-primary text-right focus:outline-none focus:border-brand transition-colors duration-100"
            />
        </label>
    )
}
