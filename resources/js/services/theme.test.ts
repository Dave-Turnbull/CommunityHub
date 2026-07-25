import { describe, expect, it, beforeEach } from 'vitest'
import {
    THEME_VARIABLES,
    THEME_PRESETS,
    THEME_PRESET_META,
    DEFAULT_PRESET,
    resolveThemeValues,
    applyThemeValues,
    tripletToHex,
    hexToTriplet,
} from './theme'

describe('theme token catalogue', () => {
    it('defines every variable for every preset, with no drift between them', () => {
        const variableKeys = THEME_VARIABLES.map((v) => v.key).sort()

        for (const presetName of Object.keys(THEME_PRESETS)) {
            const presetKeys = Object.keys(THEME_PRESETS[presetName]).sort()
            expect(presetKeys).toEqual(variableKeys)
        }
    })

    it('has preset metadata for every preset and vice versa', () => {
        expect(THEME_PRESET_META.map((m) => m.key).sort()).toEqual(Object.keys(THEME_PRESETS).sort())
    })

    it('includes the default preset', () => {
        expect(THEME_PRESETS[DEFAULT_PRESET]).toBeDefined()
    })
})

describe('resolveThemeValues', () => {
    it('returns the preset as-is when there are no overrides', () => {
        expect(resolveThemeValues('classic', {})).toEqual(THEME_PRESETS.classic)
    })

    it('lets overrides win over the preset default', () => {
        const resolved = resolveThemeValues('classic', { '--color-accent-primary': '1 2 3' })
        expect(resolved['--color-accent-primary']).toBe('1 2 3')
        expect(resolved['--radius-md']).toBe(THEME_PRESETS.classic['--radius-md'])
    })

    it('falls back to the default preset for an unknown preset name', () => {
        expect(resolveThemeValues('not-a-real-preset', {})).toEqual(THEME_PRESETS[DEFAULT_PRESET])
    })
})

describe('applyThemeValues', () => {
    beforeEach(() => {
        document.documentElement.removeAttribute('style')
    })

    it('sets every value as a CSS custom property on the root element', () => {
        applyThemeValues({ '--color-accent-primary': '1 2 3', '--radius-md': '10px' })

        expect(document.documentElement.style.getPropertyValue('--color-accent-primary')).toBe('1 2 3')
        expect(document.documentElement.style.getPropertyValue('--radius-md')).toBe('10px')
    })

    it('overwrites a previously-applied value rather than leaving it stale', () => {
        applyThemeValues({ '--color-accent-primary': '1 2 3' })
        applyThemeValues({ '--color-accent-primary': '9 9 9' })

        expect(document.documentElement.style.getPropertyValue('--color-accent-primary')).toBe('9 9 9')
    })
})

describe('hex/triplet conversion', () => {
    it('converts a triplet to hex', () => {
        expect(tripletToHex('88 101 242')).toBe('#5865f2')
    })

    it('converts hex to a triplet', () => {
        expect(hexToTriplet('#5865f2')).toBe('88 101 242')
    })

    it('round-trips every color in every preset', () => {
        for (const preset of Object.values(THEME_PRESETS)) {
            for (const variable of THEME_VARIABLES.filter((v) => v.control === 'color')) {
                const triplet = preset[variable.key]
                expect(hexToTriplet(tripletToHex(triplet))).toBe(triplet)
            }
        }
    })
})
