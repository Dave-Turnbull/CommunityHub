# Theming

[← All docs](README.md) · See also: [service-layer.md](service-layer.md)

The visual look of the app — background/text colors, corner rounding, border stroke
widths, and typography — is expressed as a fixed set of CSS custom properties, not as
literal values scattered through components. Component code only ever reaches for a
Tailwind utility class (`bg-second`, `rounded-lg`, `border`, `text-sm`); the
actual pixel/color value behind that utility lives in one place and can be swapped
without touching a single component.

There are two layers on top of that indirection: a fixed set of **built-in presets**
(`classic`, `midnight`, `ocean`, `light`, `black`) a user picks from, and
**per-variable overrides** on top of whichever preset they picked — both live in the
Settings → Appearance panel (`AppearanceSettings`), persist per-user server-side, and
apply at runtime without a page reload. See "Runtime presets and the Appearance
panel" below.

## How the static foundation fits together

1. **`resources/css/app.css`** defines every variable's *build-time* value, scoped
   to a `[data-theme="..."]` attribute selector (not bare `:root` — see below):
   `:root[data-theme='classic'] { --primary: 37 39 47; ... }`. This is the only
   theme ever expressed as an actual CSS rule — see below for why the other presets
   don't have one.
2. **`resources/views/app.blade.php`** sets `<html data-theme="classic">`, which is
   what makes that block active. This attribute never changes at runtime — it isn't
   how presets/overrides apply (see below).
3. **`tailwind.config.js`** points Tailwind's own theme keys (`colors`, `fontSize`,
   `fontWeight`, `fontFamily`, `borderRadius`, `borderWidth`) at those variables
   instead of literal values, so ordinary utility classes resolve to them.

Color variables are stored as unquoted `"R G B"` triples (`--primary: 37 39 47;`),
not `#hex` or `rgb(...)`. `tailwind.config.js` wraps each one as `rgb(var(--x) /
<alpha-value>)`, which is what lets Tailwind's opacity modifiers keep working on a
themed color (`bg-primary/50`, `ring-inverse/30`) — a plain `var(--x)` reference
can't be modified with a trailing `/50` the way a color function can.

## Token reference

### Backgrounds (+ borders)

Six background tones, named by how much of the screen each one typically covers,
**largest first** — `primary` is the biggest single visible surface (the main
content pane), `sixth` is the smallest (borders/dividers are just 1–2px lines).
Nothing is named after the component that happens to use it (no "sidebar color"),
so the same six tokens compose every screen. Classes: `bg-{name}`,
`border-{name}`, `divide-{name}`, `fill-{name}`, etc.

| Token | Variable | Role |
|---|---|---|
| `primary` | `--primary` | The main content pane — where messages/settings/room content render. The single largest surface on almost every screen. |
| `second` | `--second` | Sidebars (channel/DM/member list), modal dialogs, cards |
| `third` | `--third` | Sunken strip elements sitting inside a panel: the room rail, form inputs, the user panel strip |
| `fourth` | `--fourth` | The deepest/rearmost layer: full-page auth backdrop, popovers/dropdown menus/context menus floating above everything else. Also `<body>`'s own background, though normally fully covered by the other five. |
| `fifth` | `--fifth` | Hover backgrounds, the message compose box, secondary buttons, pills/tags |
| `sixth` | `--sixth` | Borders and dividers (its most common use), thumbnail placeholders, stronger hover states |

`rounded-full` circular/pill shapes (avatars, the room-rail icon buttons, status
dots) are a **shape**, not a rounding *style*, and stay a literal `9999px` rather
than a themed variable — a future theme changing corner roundedness shouldn't turn
avatars into squares.

**Naming caveat:** `primary`/`second`/etc. are top-level Tailwind color keys (not
nested under a `surface` group), so `bg-primary`, `border-primary`, and so on exist
exactly as written — matching how every other consumer of this palette (`border-`,
`divide-`, `fill-`) already works. The one thing to know: Tailwind auto-generates
*every* utility prefix for *every* top-level color, so a `text-primary` class also
technically exists (background color `primary` applied as a text color) — this is
never what you want; the actual primary **text** color is namespaced separately as
`text-text-primary` (see below). Nobody in this codebase uses bare `text-primary`
today; keep it that way rather than reaching for it by pattern-matching off
`bg-primary`.

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

`accent-primary`/`accent-secondary`/`accent-tertiary` are named as a color
*family* rather than "DEFAULT/hover/muted" on purpose: `secondary` isn't only a
hover state (that was the confusing part of the old `brand-hover` name) — it also
shows up as a resting/active color in its own right (the room-rail's active-room
background, `MessageRow`'s pinned-reply rail). Naming it by role (`secondary`)
rather than by trigger (`hover`) matches what it's actually used for.

| Token | Variable | Role |
|---|---|---|
| `accent-primary` | `--color-accent-primary` | The one saturated accent color: primary buttons, focus rings, links' surrounding UI, the default room-rail state |
| `accent-secondary` | `--color-accent-secondary` | A resting/active/hover variant of the accent — button hover states, but also non-hover active states like the room-rail's active-room background |
| `accent-tertiary` | `--color-accent-tertiary` | A muted, low-emphasis variant — currently just the scrollbar thumb's hover color |
| `status-online` / `status-idle` / `status-dnd` / `status-offline` | `--status-*` | Presence dots |
| `danger` | `--color-danger` | Destructive actions, error text |
| `success` | `--color-success` | Confirmations, the "create a room" affordance |

The CSS `accent-color` utility (`accent-*`, used to tint native `<input
type="range">`/checkbox controls) would collide with this group's own generated
class names (`accent-accent-primary` — Tailwind flattens the nested color path),
so range sliders use an arbitrary value instead:
`accent-[rgb(var(--color-accent-primary))]`. Don't reach for `accent-accent-primary`
even though Tailwind generates it — it works, but reads as a typo.

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

### Panel border

A separate width + color pair for the outer edge of a **major chrome region or
floating surface** — `RoomRail` (top bar), `ChannelSidebar`/`DMSidebar` (left
sidebar), `MemberList` (right member list), `UserPanel` (the strip at the bottom
of the sidebar), and `MessageInput` (the message compose box). These are the
regions a user orients by, or elements that sit visually "on top of" a pane
rather than flush against it; everywhere else (dividers inside a form, the
message-header rule) keeps using `sixth`/`border-width-default` as before. Kept
deliberately separate from those generic tokens — see "Why this exists" below.

| Class | Variable | Default (`classic`) |
|---|---|---|
| `border-panel` / `border-t-panel` / `border-r-panel` / `border-b-panel` / `border-l-panel` | `--panel-border-width` | 0px |
| `border-panel-border` | `--panel-border-color` | `56 58 66` (same tone as `sixth`) |

Usage is the pair together, width restricted to whichever side actually touches
an adjacent panel — except for a standalone element like the compose box, which
takes the border on all four sides (plain `border-panel`, not a directional
variant): `border-b-panel border-panel-border` on `RoomRail`, `border-r-panel
border-panel-border` on the left sidebars, `border-l-panel border-panel-border`
on `MemberList`, `border-t-panel border-panel-border` on `UserPanel`,
`border-panel border-panel-border` on `MessageInput`.

`--panel-border-width` steps in **quarter pixels** (0, 0.25, 0.5, ... up to 4px),
finer than every other width token in this app (`--border-width-default`/
`-thick` and the radius scale are whole pixels). The Appearance panel renders it
as a slider *and* a paired, editable number input, both bound to the same value
(`ThemeVariable.showNumberInput` — see `theme.ts`); this is the one token in the
whole set with two controls. Validated server-side by `ThemeTokens::
DECIMAL_PX_KEYS` (up to 2 decimal places) rather than the whole-pixel `PX_KEYS`
group every other radius/border-width token uses.

**Why this exists.** Every preset except `black` differentiates adjacent chrome
panels purely through the background scale (`primary` vs. `second` vs. `third`
are visibly different shades), so `--panel-border-width` defaults to `0px` — the
border geometrically exists but is invisible, same as leaving it off entirely.
`black` sets every background tier to identical pure black (see below), which
means the background scale can no longer do that differentiating job at all —
without a real border, the sidebar/top bar/main pane/member list would visually
merge into one undifferentiated region. `black` sets a hairline
`--panel-border-width: 0.25px` (color `#1E1E1E`, `--panel-border-color: 30 30
30` — deliberately subtle, not a loud grey line) specifically to restore that
separation without it reading as a heavy outline. A user can also turn this on
manually for any preset from the Appearance panel's "Panel Border" group — e.g.
someone who prefers `classic`'s colors but wants crisper panel edges.

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
per built-in preset: `classic`, `midnight`, `ocean`, `light`, `black`). `classic`'s
values here are a straight copy of `app.css`'s `:root[data-theme='classic']` block;
the other four presets exist **only as data in this file** — there is no
`[data-theme='midnight']` CSS block anywhere, and there doesn't need to be, because
presets never apply by changing the `data-theme` attribute. They apply by writing
directly onto `<html>`'s inline `style` — `applyThemeValues()` calls
`document.documentElement.style.setProperty(key, value)` for every variable. An
inline style always wins over any stylesheet rule regardless of selector
specificity, so this reliably shadows the `classic` CSS defaults for whichever
variables the current preset/overrides touch, without ever needing to flip
`data-theme` or add a new CSS rule.

`black` is a true-OLED-black preset: `--primary` through `--fifth` (every
background tone) are all `0 0 0`, `--sixth` (borders/dividers) is a mid grey, and
text is off-white rather than pure white — a deliberate example of a preset that
doesn't vary the background *scale* at all (unlike the other four, where each tier
is a visibly different shade). Because nothing distinguishes one panel's
background from another's, `black` is also the only built-in preset with a
nonzero `--panel-border-width` (a hairline 0.25px) — see "Panel border" above —
otherwise the sidebar, top bar, main pane, and member list would visually merge into a single
undifferentiated black region.

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
first whether one of the tokens above already fits (most things do; the background
scale in particular is meant to cover every background in the app). If it genuinely
doesn't, see "Adding a brand-new token" above for the full checklist (both the
static `app.css`/`tailwind.config.js` wiring and the Appearance-panel/backend
allow-list wiring) rather than writing a one-off literal value into a component's
`className`.
