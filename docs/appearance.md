# Appearance implementation and review

#48 adds device-local Gelap, Terang and Ikuti perangkat. A missing, invalid or inaccessible stored preference keeps **dark**. Explicit choices override the OS; system follows live OS changes. Storage events synchronize open tabs. When storage is denied the choice remains usable for the current page, with dark restored after reload.

## Runtime contract

`src/lib/appearance.ts` owns the preference. Its self-contained head script applies data attributes, colour-scheme and theme-color before application JavaScript executes. React uses a stable dark server snapshot and reconciles through useSyncExternalStore; only the existing html attribute hydration boundary is suppressed, not application content. No CSP is configured in this repository. If a deployment adds script-src, authorize this static bootstrap with the deployment's nonce/hash policy along with the existing TanStack scripts.

Changes update CSS variables in place; providers, forms, queries and active tabs are not remounted. The shared selector is available on login and invitation pages and in the app header; #49 moves the authenticated selector into the account popover. Sonner, native inputs, chart axes/line/grid/tooltip, dialog overlays and semantic states consume the same tokens. `bmsc.appearance` stores only one of three non-sensitive strings. Future PWA integration should reuse these values and resolved theme-colour metadata.

## Measured light palette

The candidate action teal was darkened to #076F67 because a teal label over a tinted surface needed greater contrast. Measured using the WCAG sRGB formula; normal text requires 4.5:1 and essential control boundaries 3:1. Status text can also serve as a currentColor border when a component needs one.

| Pair | Foreground | Background | Ratio |
|---|---|---|---|
| Body / page | #102a36 | #f4f7f6 | 13.85:1 |
| Supporting / card | #48606a | #ffffff | 6.65:1 |
| Primary action | #ffffff | #076f67 | 6.04:1 |
| Success | #21633f | #e1f3e8 | 6.23:1 |
| Warning | #785009 | #fff1cd | 6.34:1 |
| Danger | #af3039 | #ffe9eb | 5.48:1 |
| Information | #245b8d | #e5f0ff | 6.17:1 |
| Input boundary / card | #6a807d | #ffffff | 4.20:1 |
| Selected label | #076f67 | #ddf2ed | 5.17:1 |

## Evidence and limits

The Playwright screen suite authenticates synthetic users against a migrated local PostgreSQL database, creates its own club/records, and deletes only those records afterwards. It captures dashboard, practice/attendance and swimmer profile/results at 390×844 and 1440×900 in both themes. It verifies an unsaved distance entry survives theme changes. The shared fixture covers modal, error, empty, status and toast states; 320 px reflow, 200% text and blocked fonts are checked in both themes. CI uploads screenshots in browser-evidence.

Committed comparison: [dark mobile dashboard](design-evidence/appearance-dashboard-dark-mobile.png) · [light mobile dashboard](design-evidence/appearance-dashboard-light-mobile.png) · [dark desktop dashboard](design-evidence/appearance-dashboard-dark-desktop.png) · [light desktop dashboard](design-evidence/appearance-dashboard-light-desktop.png).

**Pending physical review:** Android and iPhone daytime/poolside comparison, actual brightness conditions and soft-keyboard behaviour. Desktop Chromium emulation does not establish sunlight readability. The established dark default is retained until that evidence exists. No changes to authorization, enrollment, attendance semantics or result calculations.
