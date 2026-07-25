/** @type {import('tailwindcss').Config} */

/**
 * Every color below reads from a CSS custom property (see resources/css/app.css)
 * instead of a literal value, so a theme is just a set of `--variable` overrides
 * scoped to `[data-theme="..."]` — see docs/theming.md. The `rgb(var(...) /
 * <alpha-value>)` form is required (not a plain `var(...)`) so Tailwind's opacity
 * modifiers (e.g. `bg-surface-app/50`) keep working.
 */
function withOpacity(variable) {
    return `rgb(var(${variable}) / <alpha-value>)`
}

export default {
    content: [
        './resources/js/**/*.{ts,tsx}',
        './resources/views/**/*.blade.php',
    ],
    theme: {
        extend: {
            colors: {
                brand: {
                    DEFAULT: withOpacity('--color-brand'),
                    hover:   withOpacity('--color-brand-hover'),
                    muted:   withOpacity('--color-brand-muted'),
                },
                // Generic surface elevation scale — not tied to any one component.
                // Every screen composes its panels from these six tones; see
                // docs/theming.md for which role is used where.
                surface: {
                    app:    withOpacity('--surface-app'),
                    inset:  withOpacity('--surface-inset'),
                    panel:  withOpacity('--surface-panel'),
                    canvas: withOpacity('--surface-canvas'),
                    raised: withOpacity('--surface-raised'),
                    subtle: withOpacity('--surface-subtle'),
                },
                text: {
                    primary:    withOpacity('--text-primary'),
                    secondary:  withOpacity('--text-secondary'),
                    muted:      withOpacity('--text-muted'),
                    link:       withOpacity('--text-link'),
                    'link-hover': withOpacity('--text-link-hover'),
                },
                status: {
                    online:  withOpacity('--status-online'),
                    idle:    withOpacity('--status-idle'),
                    dnd:     withOpacity('--status-dnd'),
                    offline: withOpacity('--status-offline'),
                },
                danger:  withOpacity('--color-danger'),
                success: withOpacity('--color-success'),
                // Text/icon/fill color for content sitting on top of a solid
                // accent-colored background (buttons, badges, the active-room dot).
                inverse: withOpacity('--color-inverse'),
            },
            fontFamily: {
                sans: 'var(--font-family-sans)',
            },
            fontSize: {
                xxs:  ['var(--text-size-xxs)',  { lineHeight: '0.875rem' }],
                xs:   ['var(--text-size-xs)',   { lineHeight: '1rem' }],
                sm:   ['var(--text-size-sm)',   { lineHeight: '1.25rem' }],
                base: ['var(--text-size-base)', { lineHeight: '1.5rem' }],
                lg:   ['var(--text-size-lg)',   { lineHeight: '1.75rem' }],
                xl:   ['var(--text-size-xl)',   { lineHeight: '1.75rem' }],
                '2xl': ['var(--text-size-2xl)', { lineHeight: '2rem' }],
                '3xl': ['var(--text-size-3xl)', { lineHeight: '2.25rem' }],
            },
            fontWeight: {
                normal:   'var(--font-weight-normal)',
                medium:   'var(--font-weight-medium)',
                semibold: 'var(--font-weight-semibold)',
                bold:     'var(--font-weight-bold)',
            },
            spacing: {
                'room-rail':       '56px',
                'sidebar-channel': '240px',
                'sidebar-members': '240px',
            },
            borderRadius: {
                none: '0px',
                sm:   'var(--radius-sm)',
                DEFAULT: 'var(--radius-md)',
                md:   'var(--radius-md)',
                lg:   'var(--radius-lg)',
                xl:   'var(--radius-xl)',
                '2xl': 'var(--radius-2xl)',
                '3xl': 'var(--radius-3xl)',
                full: '9999px',
            },
            borderWidth: {
                DEFAULT: 'var(--border-width-default)',
                0: '0px',
                2: 'var(--border-width-thick)',
                4: '4px',
                8: '8px',
            },
            keyframes: {
                'fade-in': {
                    from: { opacity: '0', transform: 'translateY(4px)' },
                    to:   { opacity: '1', transform: 'translateY(0)' },
                },
            },
            animation: { 'fade-in': 'fade-in 0.15s ease-out' },
        },
    },
    plugins: [],
}
