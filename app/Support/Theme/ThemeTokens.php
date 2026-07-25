<?php

namespace App\Support\Theme;

/**
 * Backend mirror of resources/js/services/theme.ts's THEME_VARIABLES/THEME_PRESETS —
 * the authoritative allow-list ThemePreferenceController validates an incoming
 * `overrides` map against before it's stored. Keep both lists in sync: a key
 * added to one and not the other means either a value nobody can ever set (added
 * frontend-only) or a value the Appearance panel can't render a control for
 * (added backend-only). See docs/theming.md.
 *
 * Every value is validated against a strict shape for its group (never just
 * "is a string") — these ultimately reach the browser via
 * `style.setProperty()`, which can't itself be used to break out of a CSS
 * custom property's value the way string-concatenated CSS could, but a
 * malformed value would still silently no-op the variable everywhere it's
 * used, so the allow-list is about correctness as much as safety.
 */
class ThemeTokens
{
    public const PRESETS = ['classic', 'midnight', 'ocean', 'light', 'black'];

    /**
     * "R G B" triples, e.g. "88 101 242" — see app.css's comment on why not
     * #hex. `--primary`..`--sixth` are the background scale, named by
     * prominence (largest-covered-area first) rather than by component or
     * elevation metaphor — see docs/theming.md.
     */
    public const COLOR_KEYS = [
        '--color-accent-primary', '--color-accent-secondary', '--color-accent-tertiary',
        '--primary', '--second', '--third', '--fourth', '--fifth', '--sixth',
        '--panel-border-color',
        '--text-primary', '--text-secondary', '--text-muted',
        '--text-link', '--text-link-hover',
        '--status-online', '--status-idle', '--status-dnd', '--status-offline',
        '--color-danger', '--color-success', '--color-inverse',
    ];

    /** Plain integer pixels, e.g. "8px". */
    public const PX_KEYS = [
        '--radius-sm', '--radius-md', '--radius-lg', '--radius-xl', '--radius-2xl', '--radius-3xl',
        '--border-width-default', '--border-width-thick',
    ];

    /**
     * Pixels with up to two decimal places, e.g. "0.25px" — `--panel-border-width`
     * is a quarter-pixel slider (the outer edge of a major chrome region:
     * sidebar/top bar/member list), fine enough that whole-pixel `PX_KEYS`
     * precision would reject its own default value. See docs/theming.md.
     */
    public const DECIMAL_PX_KEYS = [
        '--panel-border-width',
    ];

    /** Decimal rem, e.g. "1.125rem". */
    public const REM_KEYS = [
        '--text-size-xxs', '--text-size-xs', '--text-size-sm', '--text-size-base',
        '--text-size-lg', '--text-size-xl', '--text-size-2xl', '--text-size-3xl',
    ];

    /** One of the standard numeric weight steps. */
    public const WEIGHT_KEYS = [
        '--font-weight-normal', '--font-weight-medium', '--font-weight-semibold', '--font-weight-bold',
    ];

    public const FONT_FAMILY_KEY = '--font-family-sans';

    /**
     * The only font stacks selectable from the Appearance panel's dropdown.
     * font-family is the one free-text-shaped value in the whole token set —
     * rather than accept (and have to sanitize) arbitrary CSS, it's a closed
     * list like every other dropdown-backed token.
     */
    public const FONT_FAMILY_OPTIONS = [
        "'Inter', system-ui, sans-serif",
        "'Poppins', system-ui, sans-serif",
        "'Roboto', system-ui, sans-serif",
        "system-ui, -apple-system, 'Segoe UI', sans-serif",
        "'Georgia', 'Times New Roman', serif",
        "'JetBrains Mono', 'Courier New', monospace",
    ];

    /** @return list<string> every CSS variable name the Appearance panel can override. */
    public static function allKeys(): array
    {
        return [
            ...self::COLOR_KEYS,
            ...self::PX_KEYS,
            ...self::DECIMAL_PX_KEYS,
            ...self::REM_KEYS,
            ...self::WEIGHT_KEYS,
            self::FONT_FAMILY_KEY,
        ];
    }

    /** Whether $value is a well-formed value for the CSS variable $key. */
    public static function isValidValue(string $key, string $value): bool
    {
        if (in_array($key, self::COLOR_KEYS, true)) {
            if (! preg_match('/^(\d{1,3}) (\d{1,3}) (\d{1,3})$/', $value, $m)) {
                return false;
            }

            return (int) $m[1] <= 255 && (int) $m[2] <= 255 && (int) $m[3] <= 255;
        }

        if (in_array($key, self::PX_KEYS, true)) {
            return (bool) preg_match('/^\d{1,3}px$/', $value);
        }

        if (in_array($key, self::DECIMAL_PX_KEYS, true)) {
            return (bool) preg_match('/^\d{1,3}(\.\d{1,2})?px$/', $value);
        }

        if (in_array($key, self::REM_KEYS, true)) {
            return (bool) preg_match('/^\d(\.\d{1,4})?rem$/', $value);
        }

        if (in_array($key, self::WEIGHT_KEYS, true)) {
            return in_array($value, ['100', '200', '300', '400', '500', '600', '700', '800', '900'], true);
        }

        if ($key === self::FONT_FAMILY_KEY) {
            return in_array($value, self::FONT_FAMILY_OPTIONS, true);
        }

        return false;
    }
}
