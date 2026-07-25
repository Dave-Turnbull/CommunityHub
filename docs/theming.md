# Theming

The visual look of the app — background/text colors, corner rounding, border stroke
widths, and typography — is expressed as a fixed set of CSS custom properties, not as
literal values scattered through components. Component code only ever reaches for a
Tailwind utility class (`bg-surface-panel`, `rounded-lg`, `border`, `text-sm`); the
actual pixel/color value behind that utility lives in one place and can be swapped
without touching a single component.

There are two layers on top of that indirection: a fixed set of **built-in presets**
(`classic`, `midnight`, `ocean`, `light`) a user picks from, and **per-variable
overrides** on top of whichever preset they picked — both live in the Settings →
Appearance panel (`AppearanceSettings`), persist per-user server-side, and apply at
runtime without a page reload. See "Runtime presets and the Appearance panel" below.

## How the static foundation fits together

1. **`resources/css/app.css`** defines every variable's *build-time* value, scoped
   to a `[data-theme="..."]` attribute selector (not bare `:root` — see below):
   `:root[data-theme='classic'] { --surface-app: 15 16 21; ... }`. This is the only
   theme ever expressed as an actual CSS rule — see below for why the other three
   presets don't have one.
2. **`resources/views/app.blade.php`** sets `<html data-theme="classic">`, which is
   what makes that block active. This attribute never changes at runtime — it isn't
   how presets/overrides apply (see below).
3. **`tailwind.config.js`** points Tailwind's own theme keys (`colors`, `fontSize`,
   `fontWeight`, `fontFamily`, `borderRadius`, `borderWidth`) at those variables
   instead of literal values, so ordinary utility classes resolve to them.

Color variables are stored as unquoted `"R G B"` triples (`--surface-app: 15 16
21;`), not `#hex` or `rgb(...)`. `tailwind.config.js` wraps each one as
`rgb(var(--x) / <alpha-value>)`, which is what lets Tailwind's opacity modifiers
keep working on a themed color (`bg-surface-app/50`, `ring-inverse/30`) — a plain
`var(--x)` reference can't be modified with a trailing `/50` the way a color
function can.

## Token reference

### Surfaces (backgrounds + borders)

A six-step elevation scale, deepest to lightest. These are the only background
colors used anywhere in the app — nothing is named after the component that
happens to use it (no "sidebar color"), so the same six tokens compose every
screen. Classes: `bg-surface-{name}`, `border-surface-{name}`,
`divide-surface-{name}`, `fill-surface-{name}`, etc.

| Token | Variable | Role |
|---|---|---|
| `surface-app` | `--surface-app` | Deepest layer: full-page auth backdrop, popovers/dropdown menus/context menus floating above everything else |
| `surface-inset` | `--surface-inset` | Sunken strip elements sitting inside a panel: the room rail, form inputs, the user panel strip |
| `surface-panel` | `--surface-panel` | Sidebars (channel/DM/member list), modal dialogs, cards |
| `surface-canvas` | `--surface-canvas` | The main content pane — where messages/settings/room content render |
| `surface-raised` | `--surface-raised` | Hover backgrounds, the message compose box, secondary buttons, pills/tags |
| `surface-subtle` | `--surface-subtle` | Borders and dividers (its most common use), thumbnail placeholders, stronger hover states |

`rounded-full` circular/pill shapes (avatars, the room-rail icon buttons, status
dots) are a **shape**, not a rounding *style*, and stay a literal `9999px` rather
than a themed variable — a future theme changing corner roundedness shouldn't turn
avatars into squares.

### Text

| Token | Variable | Role |
|---|---|---|
| `text-text-primary` | `--text-primary` | Default body/heading text |
| `text-text-secondary` | `--text-secondary` | De-emphasized but still legible text (secondary labels, inactive tab text) |
| `text-text-muted` | `--text-muted` | Placeholder text, timestamps, helper copy |
| `text-text-link` | `--text-link` | Inline link text |
| `text-text-link-hover` | `--text-link-hover` | Link text on hover, paired with `hover:underline` |
| `text-inverse` / `bg-inverse` / `ring-inverse` | `--color-inverse` | Content sitting on top of a solid accent-colored fill — button labels, unread badges, the active-room indicator dot. White in `classic`, but not hardcoded as `white` so a theme with a light accent color can flip it to something else |

### Accent, status, and feedback colors

| Token | Variable | Role |
|---|---|---|
| `brand` / `brand-hover` / `brand-muted` | `--color-brand*` | The one saturated accent color: primary buttons, active nav state, focus rings, links' surrounding UI |
| `status-online` / `status-idle` / `status-dnd` / `status-offline` | `--status-*` | Presence dots |
| `danger` | `--color-danger` | Destructive actions, error text |
| `success` | `--color-success` | Confirmations, the "create a room" affordance |

### Corner rounding

`tailwind.config.js` overrides Tailwind's own `borderRadius` scale to read from
variables, so existing classes (`rounded`, `rounded-md`, `rounded-lg`, `rounded-xl`,
`rounded-2xl`) are already themed — no component needed a class rename.

| Class | Variable | Default (`classic`) |
|---|---|---|
| `rounded-sm` | `--radius-sm` | 2px |
| `rounded` / `rounded-md` | `--radius-md` | 4px |
| `rounded-lg` | `--radius-lg` | 8px |
| `rounded-xl` | `--radius-xl` | 12px |
| `rounded-2xl` | `--radius-2xl` | 16px |
| `rounded-3xl` | `--radius-3xl` | 24px |

### Border/divider stroke width

| Class | Variable | Default (`classic`) |
|---|---|---|
| `border` / `border-b` / `border-l` / `border-r` (1×) | `--border-width-default` | 1px |
| `border-2` / `border-b-2` / `border-l-2` / `border-r-2` | `--border-width-thick` | 2px |

### Typography

| Class | Variable | Default (`classic`) |
|---|---|---|
| `font-sans` (and the base `<html>` font) | `--font-family-sans` | `'Inter', system-ui, sans-serif` |
| `font-normal` / `font-medium` / `font-semibold` / `font-bold` | `--font-weight-*` | 400 / 500 / 600 / 700 |
| `text-xxs` … `text-3xl` | `--text-size-xxs` … `--text-size-3xl` | Tailwind's stock rem scale (unchanged values, now variable-backed) |

## Runtime presets and the Appearance panel

`resources/js/services/theme.ts` is the frontend's own copy of the full token set —
`THEME_VARIABLES` (every CSS variable, plus which kind of control edits it and its
valid range/options) and `THEME_PRESETS` (a complete value for every variable, once
per built-in preset: `classic`, `midnight`, `ocean`, `light`). `classic`'s values
here are a straight copy of `app.css`'s `:root[data-theme='classic']` block; the
other three presets exist **only as data in this file** — there is no
`[data-theme='midnight']` CSS block anywhere, and there doesn't need to be, because
presets never apply by changing the `data-theme` attribute. They apply by writing
directly onto `<html>`'s inline `style` — `applyThemeValues()` calls
`document.documentElement.style.setProperty(key, value)` for every variable. An
inline style always wins over any stylesheet rule regardless of selector
specificity, so this reliably shadows the `classic` CSS defaults for whichever
variables the current preset/overrides touch, without ever needing to flip
`data-theme` or add a new CSS rule.

**Presets vs. overrides.** `useTheme` (`resources/js/stores/index.ts`) holds two
things: `preset` (a key into `THEME_PRESETS`) and `overrides` (a flat map of
individual variables the user has tweaked away from that preset — e.g. `{
'--radius-lg': '20px' }`). `resolveThemeValues(preset, overrides)` is `{
...THEME_PRESETS[preset], ...overrides }` — overrides always win. Clicking a preset
card in the Appearance panel calls `setPreset(name)`, which **clears** `overrides`
— it's a full reset to that preset's own values, not a merge. Changing any single
color/slider/dropdown control instead calls `setOverride(key, value)`, which only
ever touches that one entry.

**Persistence.** `theme_preferences` (migration
`2024_01_01_000024_create_theme_preferences_table.php`, model `ThemePreference`) is
one row per user: `preset` (string) + `overrides` (json). No row means "classic, no
overrides" — the CSS defaults already cover that for free, same pattern as
`NotificationPreference`'s DEFAULTS fallback. `UserSettingsService::
themePreference()`/`updateThemePreference()` read/write it; `Api\
ThemePreferenceController` (`GET`/`PUT /api/theme-preference`) is a thin
validate-then-call-the-service layer, same shape as every other settings
controller — see `docs/service-layer.md`.

**Validation.** `App\Support\Theme\ThemeTokens` is the backend's mirror of
`theme.ts`'s `THEME_VARIABLES`/`THEME_PRESETS` — an allow-list of every valid CSS
variable name, grouped by shape (`COLOR_KEYS` want an `"R G B"` triple with each
channel ≤255, `PX_KEYS` want `\d+px`, `REM_KEYS` want `\d(\.\d+)?rem`,
`WEIGHT_KEYS` want one of the standard 100–900 steps, and `--font-family-sans` must
be one of a fixed `FONT_FAMILY_OPTIONS` list rather than arbitrary text).
`ThemePreferenceController::update` rejects any override whose key isn't in the
allow-list or whose value doesn't match its group's shape. This is about
correctness as much as safety: nothing here reaches the browser as
string-concatenated CSS (`applyThemeValues` only ever calls the CSSOM
`setProperty()`, which can't be used to break out of a custom property's value the
way building a raw `<style>` string could), but a malformed value would still
silently no-op that variable everywhere it's used.

**Applying on load.** `app.tsx` fetches the signed-in user's theme preference once
per login (`syncTheme()`, the same dedupe-by-user-id shape as the existing
`syncPresence()` for WebSocket presence) and calls `applyThemeValues(
resolveThemeValues(...))` immediately — this is what makes the theme show up on
every page, not just Settings. There's a brief flash of the `classic` CSS defaults
before that fetch resolves, same tradeoff this app already accepts for e.g. mic
sensitivity (`useMicSensitivity` — see CLAUDE.md trap #42); nothing pre-renders the
theme server-side. Logging out clears the inline `style` attribute entirely so a
shared machine falls back to `classic` rather than showing the previous user's
theme.

**Adding a built-in preset:** add an entry to `THEME_PRESETS` in `theme.ts`
(every key `THEME_VARIABLES` lists — `theme.test.ts` asserts no preset is
missing any) and matching metadata to `THEME_PRESET_META`, then add the same
key to `ThemeTokens::PRESETS` on the backend. No CSS or Tailwind config change —
presets are pure runtime data.

**Adding a brand-new token:** still needs the static three-step wiring described
above (an `app.css` default, a `tailwind.config.js` theme key, and component
classes using it) — but also needs: an entry in `THEME_VARIABLES` (so the
Appearance panel renders a control for it) with a value for it in every entry of
`THEME_PRESETS`; the matching CSS variable name added to the right group in
`ThemeTokens` (`COLOR_KEYS`/`PX_KEYS`/`REM_KEYS`/`WEIGHT_KEYS`, or a new group with
its own `isValidValue` branch) on the backend.

## What's deliberately *not* tokenized

- **Layout dimensions** — `w-sidebar-channel`, `h-room-rail`, spacing/padding
  utilities. These are structural, not stylistic; a theme changes how things look,
  not the app's layout. (`spacing.room-rail`/`spacing.sidebar-*` in
  `tailwind.config.js` are layout constants, not theme tokens, and stay as literal
  pixel values.)
- **Box shadows** (`shadow-lg`, `shadow-xl`, `shadow-2xl`) — used only for
  modal/dropdown elevation, already generic Tailwind defaults, not something this
  app's look has ever varied.
- **Transition durations** (`duration-100`, `duration-200`, ...) — animation timing,
  not a visual style choice.

## Adding a new themed value

If a new component needs a color/radius/border-width/font value that doesn't map to
an existing token, don't hardcode a literal Tailwind class or raw CSS value — check
first whether one of the tokens above already fits (most things do; the surface scale
in particular is meant to cover every background in the app). If it genuinely
doesn't, see "Adding a brand-new token" above for the full checklist (both the
static `app.css`/`tailwind.config.js` wiring and the Appearance-panel/backend
allow-list wiring) rather than writing a one-off literal value into a component's
`className`.
