/**
 * The Appearance panel's token catalogue: every CSS custom property defined
 * in resources/css/app.css, what kind of control edits it, and the full
 * value set for each built-in preset. This is the frontend half of the
 * allow-list — App\Support\Theme\ThemeTokens is the backend mirror the API
 * validates `overrides` against; keep both in sync. See docs/theming.md.
 */

export type ThemeControlType = 'color' | 'select' | 'slider' | 'number'

export interface ThemeSelectOption {
    label: string
    value: string
}

export interface ThemeVariable {
    key: string
    label: string
    group: string
    control: ThemeControlType
    unit?: 'px' | 'rem'
    min?: number
    max?: number
    step?: number
    options?: ThemeSelectOption[]
    /** `control: 'slider'` only — also render a paired, editable number input alongside the slider. */
    showNumberInput?: boolean
}

export const FONT_FAMILY_OPTIONS: ThemeSelectOption[] = [
    { label: 'Inter (sans)', value: "'Inter', system-ui, sans-serif" },
    { label: 'Poppins (sans)', value: "'Poppins', system-ui, sans-serif" },
    { label: 'Roboto (sans)', value: "'Roboto', system-ui, sans-serif" },
    { label: 'System UI (sans)', value: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
    { label: 'Georgia (serif)', value: "'Georgia', 'Times New Roman', serif" },
    { label: 'JetBrains Mono (monospace)', value: "'JetBrains Mono', 'Courier New', monospace" },
]

const FONT_WEIGHT_OPTIONS: ThemeSelectOption[] = [100, 200, 300, 400, 500, 600, 700, 800, 900]
    .map((w) => ({ label: String(w), value: String(w) }))

const SIZE_SLIDER = { control: 'slider' as const, unit: 'rem' as const, min: 0.5, max: 3, step: 0.0625 }
const RADIUS_SLIDER = { control: 'slider' as const, unit: 'px' as const, min: 0, max: 32, step: 1 }
const BORDER_NUMBER = { control: 'number' as const, unit: 'px' as const, min: 0, max: 8, step: 1 }
// Fine-grained quarter-pixel control (0, 0.25, 0.5, ...) — a hairline panel
// border is meant to be adjustable finer than a whole pixel at a time, unlike
// the integer-stepped border widths above.
const PANEL_BORDER_WIDTH_SLIDER = {
    control: 'slider' as const, unit: 'px' as const, min: 0, max: 4, step: 0.25, showNumberInput: true,
}

export const THEME_VARIABLES: ThemeVariable[] = [
    // Accent — a color family, not "DEFAULT/hover/muted": `secondary` shows
    // up in more than just hover states (e.g. the active room-rail
    // indicator), so it's named for what it is rather than when it's used.
    { key: '--color-accent-primary', label: 'Accent — Primary', group: 'Accent', control: 'color' },
    { key: '--color-accent-secondary', label: 'Accent — Secondary', group: 'Accent', control: 'color' },
    { key: '--color-accent-tertiary', label: 'Accent — Tertiary', group: 'Accent', control: 'color' },

    // Backgrounds — six tones, ordered by how much of the screen each one
    // typically covers, largest first. See docs/theming.md.
    { key: '--primary', label: 'Primary background', group: 'Backgrounds', control: 'color' },
    { key: '--second', label: 'Secondary background', group: 'Backgrounds', control: 'color' },
    { key: '--third', label: 'Third background', group: 'Backgrounds', control: 'color' },
    { key: '--fourth', label: 'Fourth background', group: 'Backgrounds', control: 'color' },
    { key: '--fifth', label: 'Fifth background', group: 'Backgrounds', control: 'color' },
    { key: '--sixth', label: 'Sixth background (borders)', group: 'Backgrounds', control: 'color' },

    // Text
    { key: '--text-primary', label: 'Primary text', group: 'Text', control: 'color' },
    { key: '--text-secondary', label: 'Secondary text', group: 'Text', control: 'color' },
    { key: '--text-muted', label: 'Muted text', group: 'Text', control: 'color' },
    { key: '--text-link', label: 'Link', group: 'Text', control: 'color' },
    { key: '--text-link-hover', label: 'Link (hover)', group: 'Text', control: 'color' },
    { key: '--color-inverse', label: 'Inverse (on-accent) text', group: 'Text', control: 'color' },

    // Status & feedback
    { key: '--status-online', label: 'Online', group: 'Status & Feedback', control: 'color' },
    { key: '--status-idle', label: 'Idle', group: 'Status & Feedback', control: 'color' },
    { key: '--status-dnd', label: 'Do Not Disturb', group: 'Status & Feedback', control: 'color' },
    { key: '--status-offline', label: 'Offline', group: 'Status & Feedback', control: 'color' },
    { key: '--color-danger', label: 'Danger', group: 'Status & Feedback', control: 'color' },
    { key: '--color-success', label: 'Success', group: 'Status & Feedback', control: 'color' },

    // Typography
    { key: '--font-family-sans', label: 'Font family', group: 'Typography', control: 'select', options: FONT_FAMILY_OPTIONS },
    { key: '--font-weight-normal', label: 'Weight — Normal', group: 'Typography', control: 'select', options: FONT_WEIGHT_OPTIONS },
    { key: '--font-weight-medium', label: 'Weight — Medium', group: 'Typography', control: 'select', options: FONT_WEIGHT_OPTIONS },
    { key: '--font-weight-semibold', label: 'Weight — Semibold', group: 'Typography', control: 'select', options: FONT_WEIGHT_OPTIONS },
    { key: '--font-weight-bold', label: 'Weight — Bold', group: 'Typography', control: 'select', options: FONT_WEIGHT_OPTIONS },
    { key: '--text-size-xxs', label: 'Size — XXS', group: 'Typography', ...SIZE_SLIDER },
    { key: '--text-size-xs', label: 'Size — XS', group: 'Typography', ...SIZE_SLIDER },
    { key: '--text-size-sm', label: 'Size — SM', group: 'Typography', ...SIZE_SLIDER },
    { key: '--text-size-base', label: 'Size — Base', group: 'Typography', ...SIZE_SLIDER },
    { key: '--text-size-lg', label: 'Size — LG', group: 'Typography', ...SIZE_SLIDER },
    { key: '--text-size-xl', label: 'Size — XL', group: 'Typography', ...SIZE_SLIDER },
    { key: '--text-size-2xl', label: 'Size — 2XL', group: 'Typography', ...SIZE_SLIDER },
    { key: '--text-size-3xl', label: 'Size — 3XL', group: 'Typography', ...SIZE_SLIDER },

    // Corner rounding
    { key: '--radius-sm', label: 'Radius — SM', group: 'Corner Rounding', ...RADIUS_SLIDER },
    { key: '--radius-md', label: 'Radius — MD', group: 'Corner Rounding', ...RADIUS_SLIDER },
    { key: '--radius-lg', label: 'Radius — LG', group: 'Corner Rounding', ...RADIUS_SLIDER },
    { key: '--radius-xl', label: 'Radius — XL', group: 'Corner Rounding', ...RADIUS_SLIDER },
    { key: '--radius-2xl', label: 'Radius — 2XL', group: 'Corner Rounding', ...RADIUS_SLIDER },
    { key: '--radius-3xl', label: 'Radius — 3XL', group: 'Corner Rounding', ...RADIUS_SLIDER },

    // Border width — a plain number input rather than a slider: the usable
    // range is a handful of integer pixels, too small for a slider to be
    // more precise than typing the value.
    { key: '--border-width-default', label: 'Default border width', group: 'Border Width', ...BORDER_NUMBER },
    { key: '--border-width-thick', label: 'Thick border width', group: 'Border Width', ...BORDER_NUMBER },

    // Panel border — the outer edge of a major chrome region (sidebar/top
    // bar/member list). 0 width by default in every preset except `black`,
    // where the background scale can't differentiate panels on its own —
    // see docs/theming.md.
    { key: '--panel-border-width', label: 'Panel border width', group: 'Panel Border', ...PANEL_BORDER_WIDTH_SLIDER },
    { key: '--panel-border-color', label: 'Panel border color', group: 'Panel Border', control: 'color' },
]

export const THEME_GROUPS = [
    'Accent', 'Backgrounds', 'Text', 'Status & Feedback', 'Typography', 'Corner Rounding', 'Border Width',
    'Panel Border',
] as const

export const DEFAULT_PRESET = 'classic'

const TYPE_SCALE = {
    '--font-weight-normal': '400',
    '--font-weight-medium': '500',
    '--font-weight-semibold': '600',
    '--font-weight-bold': '700',
    '--text-size-xxs': '0.6875rem',
    '--text-size-xs': '0.75rem',
    '--text-size-sm': '0.875rem',
    '--text-size-base': '1rem',
    '--text-size-lg': '1.125rem',
    '--text-size-xl': '1.25rem',
    '--text-size-2xl': '1.5rem',
    '--text-size-3xl': '1.875rem',
}

const HAIRLINE_BORDERS = {
    '--border-width-default': '1px',
    '--border-width-thick': '2px',
}

/**
 * Every preset defines every variable — resolveThemeValues() never has to
 * fall back to a second source, and switching presets is always a complete,
 * well-defined theme rather than a partial one layered over leftovers.
 */
export const THEME_PRESETS: Record<string, Record<string, string>> = {
    // The look this app has always had — see resources/css/app.css.
    classic: {
        '--color-accent-primary': '88 101 242',
        '--color-accent-secondary': '71 82 196',
        '--color-accent-tertiary': '78 80 88',
        '--primary': '37 39 47',
        '--second': '30 32 40',
        '--third': '23 25 31',
        '--fourth': '15 16 21',
        '--fifth': '46 48 56',
        '--sixth': '56 58 66',
        '--text-primary': '242 243 245',
        '--text-secondary': '181 186 193',
        '--text-muted': '128 132 142',
        '--text-link': '0 175 244',
        '--text-link-hover': '61 199 255',
        '--status-online': '35 165 90',
        '--status-idle': '240 178 50',
        '--status-dnd': '242 63 67',
        '--status-offline': '128 132 142',
        '--color-danger': '242 63 67',
        '--color-success': '35 165 90',
        '--color-inverse': '255 255 255',
        '--font-family-sans': "'Inter', system-ui, sans-serif",
        ...TYPE_SCALE,
        '--radius-sm': '2px',
        '--radius-md': '4px',
        '--radius-lg': '8px',
        '--radius-xl': '12px',
        '--radius-2xl': '16px',
        '--radius-3xl': '24px',
        ...HAIRLINE_BORDERS,
        '--panel-border-width': '0px',
        '--panel-border-color': '56 58 66',
    },
    // Deep violet accent on a near-black scale, softer/rounder than classic.
    midnight: {
        '--color-accent-primary': '139 92 246',
        '--color-accent-secondary': '124 58 237',
        '--color-accent-tertiary': '76 67 89',
        '--primary': '33 31 59',
        '--second': '26 24 48',
        '--third': '19 18 32',
        '--fourth': '11 10 18',
        '--fifth': '42 39 73',
        '--sixth': '54 49 89',
        '--text-primary': '244 242 251',
        '--text-secondary': '195 189 224',
        '--text-muted': '138 131 171',
        '--text-link': '167 139 250',
        '--text-link-hover': '196 181 253',
        '--status-online': '52 211 153',
        '--status-idle': '251 191 36',
        '--status-dnd': '248 113 113',
        '--status-offline': '138 131 171',
        '--color-danger': '248 113 113',
        '--color-success': '52 211 153',
        '--color-inverse': '255 255 255',
        '--font-family-sans': "'Poppins', system-ui, sans-serif",
        ...TYPE_SCALE,
        '--radius-sm': '4px',
        '--radius-md': '8px',
        '--radius-lg': '12px',
        '--radius-xl': '16px',
        '--radius-2xl': '24px',
        '--radius-3xl': '32px',
        ...HAIRLINE_BORDERS,
        '--panel-border-width': '0px',
        '--panel-border-color': '54 49 89',
    },
    // Cool teal/blue accent, tighter corners, cooler-toned grays.
    ocean: {
        '--color-accent-primary': '14 165 233',
        '--color-accent-secondary': '2 132 199',
        '--color-accent-tertiary': '59 85 104',
        '--primary': '26 50 63',
        '--second': '20 40 50',
        '--third': '15 30 36',
        '--fourth': '10 20 24',
        '--fifth': '33 62 77',
        '--sixth': '43 77 94',
        '--text-primary': '234 246 250',
        '--text-secondary': '169 200 211',
        '--text-muted': '111 147 161',
        '--text-link': '56 189 248',
        '--text-link-hover': '125 211 252',
        '--status-online': '45 212 191',
        '--status-idle': '251 191 36',
        '--status-dnd': '251 113 133',
        '--status-offline': '111 147 161',
        '--color-danger': '251 113 133',
        '--color-success': '45 212 191',
        '--color-inverse': '255 255 255',
        '--font-family-sans': "'Roboto', system-ui, sans-serif",
        ...TYPE_SCALE,
        '--radius-sm': '2px',
        '--radius-md': '4px',
        '--radius-lg': '6px',
        '--radius-xl': '8px',
        '--radius-2xl': '10px',
        '--radius-3xl': '12px',
        ...HAIRLINE_BORDERS,
        '--panel-border-width': '0px',
        '--panel-border-color': '43 77 94',
    },
    // The one light theme — proves the token set generalizes past "dark UI".
    light: {
        '--color-accent-primary': '79 70 229',
        '--color-accent-secondary': '67 56 202',
        '--color-accent-tertiary': '165 166 246',
        '--primary': '249 250 251',
        '--second': '255 255 255',
        '--third': '255 255 255',
        '--fourth': '243 244 246',
        '--fifth': '238 240 243',
        '--sixth': '217 220 225',
        '--text-primary': '17 24 39',
        '--text-secondary': '75 85 99',
        '--text-muted': '156 163 175',
        '--text-link': '79 70 229',
        '--text-link-hover': '67 56 202',
        '--status-online': '22 163 74',
        '--status-idle': '217 119 6',
        '--status-dnd': '220 38 38',
        '--status-offline': '156 163 175',
        '--color-danger': '220 38 38',
        '--color-success': '22 163 74',
        '--color-inverse': '255 255 255',
        '--font-family-sans': "system-ui, -apple-system, 'Segoe UI', sans-serif",
        ...TYPE_SCALE,
        '--radius-sm': '2px',
        '--radius-md': '4px',
        '--radius-lg': '6px',
        '--radius-xl': '8px',
        '--radius-2xl': '10px',
        '--radius-3xl': '12px',
        ...HAIRLINE_BORDERS,
        '--panel-border-width': '0px',
        '--panel-border-color': '217 220 225',
    },
    // True OLED black: every background tone is pure black — only the grey
    // border/divider tone and off-white text give the UI any shape at all.
    // This is the one preset where the background scale alone can't tell
    // adjacent panels apart, so panel-border-width turns on (a hairline
    // 0.25px) instead of the 0px every other preset uses — see docs/theming.md.
    black: {
        '--color-accent-primary': '47 129 247',
        '--color-accent-secondary': '31 111 235',
        '--color-accent-tertiary': '77 77 77',
        '--primary': '0 0 0',
        '--second': '0 0 0',
        '--third': '0 0 0',
        '--fourth': '0 0 0',
        '--fifth': '0 0 0',
        '--sixth': '82 82 82',
        '--text-primary': '245 245 245',
        '--text-secondary': '179 179 179',
        '--text-muted': '128 128 128',
        '--text-link': '77 166 255',
        '--text-link-hover': '128 193 255',
        '--status-online': '46 160 67',
        '--status-idle': '210 153 34',
        '--status-dnd': '248 81 73',
        '--status-offline': '110 118 129',
        '--color-danger': '248 81 73',
        '--color-success': '46 160 67',
        '--color-inverse': '255 255 255',
        '--font-family-sans': "'Inter', system-ui, sans-serif",
        ...TYPE_SCALE,
        '--radius-sm': '0px',
        '--radius-md': '2px',
        '--radius-lg': '4px',
        '--radius-xl': '6px',
        '--radius-2xl': '8px',
        '--radius-3xl': '10px',
        ...HAIRLINE_BORDERS,
        '--panel-border-width': '0.25px',
        '--panel-border-color': '30 30 30',
    },
}

export interface ThemePresetMeta {
    key: string
    label: string
    description: string
}

export const THEME_PRESET_META: ThemePresetMeta[] = [
    { key: 'classic', label: 'Classic', description: 'The original CommunityHub look.' },
    { key: 'midnight', label: 'Midnight', description: 'Deep violet accent, soft rounded corners.' },
    { key: 'ocean', label: 'Ocean', description: 'Cool blue-teal accent, tighter corners.' },
    { key: 'light', label: 'Light', description: 'A bright, high-contrast light theme.' },
    { key: 'black', label: 'Pure Black', description: 'Pure black backgrounds, grey borders, off-white text.' },
]

/** The full, resolved value for every token: the preset's value, then any per-variable override on top. */
export function resolveThemeValues(preset: string, overrides: Record<string, string>): Record<string, string> {
    const base = THEME_PRESETS[preset] ?? THEME_PRESETS[DEFAULT_PRESET]
    return { ...base, ...overrides }
}

/** Writes every value onto <html>'s inline style, live-previewing (or applying) a theme immediately. */
export function applyThemeValues(values: Record<string, string>): void {
    const root = document.documentElement
    for (const [key, value] of Object.entries(values)) {
        root.style.setProperty(key, value)
    }
}

export function tripletToHex(triplet: string): string {
    const parts = triplet.trim().split(/\s+/).map(Number)
    const toHex = (n: number) => Math.max(0, Math.min(255, n || 0)).toString(16).padStart(2, '0')
    return `#${toHex(parts[0])}${toHex(parts[1])}${toHex(parts[2])}`
}

export function hexToTriplet(hex: string): string {
    const clean = hex.replace('#', '')
    const r = parseInt(clean.slice(0, 2), 16)
    const g = parseInt(clean.slice(2, 4), 16)
    const b = parseInt(clean.slice(4, 6), 16)
    return `${r} ${g} ${b}`
}
