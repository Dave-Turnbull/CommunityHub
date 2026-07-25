/** @type {import('tailwindcss').Config} */

/**
 * Every color below reads from a CSS custom property (see resources/css/app.css)
 * instead of a literal value, so a theme is just a set of `--variable` overrides
 * scoped to `[data-theme="..."]` — see docs/theming.md. The `rgb(var(...) /
 * <alpha-value>)` form is required (not a plain `var(...)`) so Tailwind's opacity
 * modifiers (e.g. `bg-primary/50`) keep working.
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
                // The one saturated accent color family — primary/secondary/
                // tertiary, not "DEFAULT/hover/muted", since `secondary`
                // shows up as more than just a hover state (e.g. the active
                // room-rail indicator) — see docs/theming.md.
                accent: {
                    primary:   withOpacity('--color-accent-primary'),
                    secondary: withOpacity('--color-accent-secondary'),
                    tertiary:  withOpacity('--color-accent-tertiary'),
                },
                // Generic background scale — not tied to any one component.
                // Named by prominence, largest-covered-area first (primary is
                // the main content pane, sixth is borders/dividers) rather
                // than by component or elevation metaphor — see
                // docs/theming.md for which role each one plays.
                primary: withOpacity('--primary'),
                second:  withOpacity('--second'),
                third:   withOpacity('--third'),
                fourth:  withOpacity('--fourth'),
                fifth:   withOpacity('--fifth'),
                sixth:   withOpacity('--sixth'),
                // The outer-edge border of a major chrome region (sidebar/top
                // bar/member list) — paired with the `panel` borderWidth key
                // below (`border-r-panel border-panel-border`, etc.). Kept
                // separate from `sixth` (the generic divider/border color) so
                // a theme can make chrome borders more prominent than
                // ordinary dividers without changing every divider in the
                // app — see docs/theming.md.
                'panel-border': withOpacity('--panel-border-color'),
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
                // A theme-controlled width for chrome-region outer borders
                // (`border-r-panel`, `border-b-panel`, ...) — independent of
                // the generic default/thick scale above so a "panel border"
                // toggle doesn't also have to change every hairline divider
                // in the app. 0 in every preset except `black` — see
                // docs/theming.md.
                panel: 'var(--panel-border-width)',
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
