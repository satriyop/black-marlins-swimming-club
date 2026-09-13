# BMSC design system

The club retains navy/teal branding. Manrope handles operational UI; Bebas Neue is reserved for the brand and exceptional achievement headings. IBM Plex Mono with tabular numerals is for race times. Screen-level custom headings migrate in the later visual issues.

## Typography and layout

| Role | Size / line height | Weight |
|---|---|---|
| Page title | 28/36 mobile; 32/40 desktop | 700 |
| Section title | 20/28 | 700 |
| Card title | 16/24 | 600 |
| Body and controls | 16/24 | 400–600 |
| Supporting text / labels | 14/20 | 400 / 600 |
| Nonessential metadata | 12/16 | 400 |

Use `text-page-title`, `text-section-title`, and `text-card-title`. Shared `PageHeader` and `EmptyState` are re-exported from AppShell for API compatibility and can be imported from `components/ui/page-header` by standalone fixtures. Do not use a smaller font merely to fit a control.

Spacing: 4/8/12/16/24/32 px. Mobile page inset 16 px; desktop 24–32 px. Section separation 24–32 px; cards 16–20 px. Small nested radius 8 px; buttons/inputs 12 px; normal cards and dialogs 16 px. One featured card may use 20 px. Status/segmented indicators can be pills. Prefer divided rows to repeatedly nested cards.

## Semantic colour and states

Page (`background`), content (`card`) and raised (`popover`) surfaces have separate tokens. `input` is a stronger control boundary than decorative `border`; `ring` identifies keyboard focus.

| Badge tone | Meaning |
|---|---|
| pool | Brand/context highlight; not a success signal |
| ok | Confirmed successful outcome |
| warn | Attention / pending action |
| danger | Error or cancellation |
| info | Informational state |
| muted | Neutral / completed without a success assertion |

Always write the actual state label. Unmarked attendance is not absence; a completed session is not proof every athlete attended. Use filled primary actions, outlined secondary actions, quiet tertiary actions and red destructive actions; selection is not save success.

All shared buttons, inputs and close controls retain a minimum 44 px target. Wrapping labels increase height instead of overflowing. Keyboard focus uses an offset outline; reduced-motion preference disables decorative transitions/animations. Existing nested screen structures are addressed by subsequent screen issues.

## Dark palette measurements

Computed using the WCAG sRGB relative-luminance formula (opaque values; unrounded values checked against thresholds). The browser suite additionally measures rendered/composited badge and control text. Decorative separators do not use the control-boundary token.

| Pair | Foreground | Background | Ratio |
|---|---|---|---|
| Body on page | #e8f1f4 | #061018 | 16.73:1 |
| Supporting on card | #8aa0aa | #0c1c26 | 6.36:1 |
| Primary action | #04201c | #2ec4b6 | 7.89:1 |
| Success | #8ce0ae | #123326 | 8.77:1 |
| Warning | #f2cf7a | #382d15 | 9.00:1 |
| Danger | #e86b6b | #381e25 | 4.89:1 |
| Information | #9acbff | #162f49 | 8.04:1 |
| Input boundary / card | #718996 | #0c1c26 | 4.73:1 |

Normal text target is at least 4.5:1; qualifying large text and essential non-text boundaries at least 3:1. Disabled controls are visibly inactive rather than used as contrast evidence. These checks are scoped to changed components, not a whole-product accessibility certification.

## Review fixture and evidence

Run `node scripts/visual-fixture.mjs`, then open `http://127.0.0.1:3012/tests/fixtures/visual.html`. This builds the real shared components with Vite into a temporary directory and serves only a local fixture; no production route or auth bypass is introduced. Ctrl-C removes the temporary build.

`npm run test:e2e` starts the built app plus this fixture. The existing app server requires a local/CI DATABASE_URL with schema migrated. Tests exercise label interaction, dialog keyboard close/focus return, retry, rendered contrast, narrow screens and 200% text with blocked remote fonts. Screenshots are under test-results. The fixture includes selected, disabled/pending, error, long-label and modal states.

[Before mobile](design-evidence/foundation-before-mobile.png) · [After mobile](design-evidence/foundation-after-mobile.png) · [Before desktop](design-evidence/foundation-before-desktop.png) · [After desktop](design-evidence/foundation-after-desktop.png).

Before/after fixture data is identical; the after fixture also demonstrates the new information badge. These are local browser images, not evidence of physical-device sunlight readability. Application-specific layout redesigns belong to #49–53.
