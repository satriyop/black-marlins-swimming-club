# Invitation screen review

#53 audited the shared form primitives (`input.tsx`, `dialog.tsx`) and the other named form entry points (`practice-editor.tsx`, `result-dialog.tsx`, `undangan.tsx`, `event_.$id.tsx`) against the issue's shared-form specification and found them already compliant from prior visual work (#47–#51): 16 px control text and 14 px labels via `Field`, sectioned fieldsets with sentence-case headings, one primary action with a sticky footer on the long practice editor, inline submit errors, and a zoom-safe scrollable `Dialog` with a labelled close action and correct focus handling. No changes were needed there.

The genuine gap was `terima.tsx`, the invitation/welcome screen, which the issue's invitation specification calls out explicitly.

## Interaction contract

- Heading switches from the Bebas Neue display font to `text-page-title` (Manrope) — a functional page title, not a brand/achievement moment.
- Pending state now orders club name → role → account instruction/action → expiry and email hint as secondary information below the action, instead of bundling expiry into the identity card before the user has even seen the primary action.
- Every non-default state (expired, revoked, invalid, already-accepted, wrong-account, and successful acceptance) now renders through a shared `StatusCard` with an icon and a semantic tone (`warn` for expired, `danger` for revoked/invalid, `info` for already-accepted, `ok` for success), instead of all states sharing the same plain paragraph. The account-mismatch error surfaced after a failed accept attempt gets the same warning treatment instead of undifferentiated red text.
- No functional change: token validation, the swimmer-account password form (including its existing show/hide checkbox), Google sign-in/out flows, and the accept mutation are untouched.

## Review evidence

Browser coverage (`tests/e2e/invitation-screen.spec.ts`) seeds real `invites` rows for expired, revoked, already-accepted, and pending states, and drives an actual accept attempt with both a mismatched and a matching signed-in account to confirm the distinct-warning and success paths render correctly — not just a screenshot check. The full Vitest and Playwright suites pass unchanged.

Before: [pending mobile](design-evidence/invite-before-pending-mobile.png) · [pending desktop](design-evidence/invite-before-pending-desktop.png) · [expired mobile](design-evidence/invite-before-expired-mobile.png) · [accepted mobile](design-evidence/invite-before-accepted-mobile.png).

After: [pending mobile](design-evidence/invite-after-pending-mobile.png) · [pending desktop](design-evidence/invite-after-pending-desktop.png) · [expired mobile](design-evidence/invite-after-expired-mobile.png) · [expired desktop](design-evidence/invite-after-expired-desktop.png) · [accepted mobile](design-evidence/invite-after-accepted-mobile.png) · [accepted desktop](design-evidence/invite-after-accepted-desktop.png).

Public-preview screenshots use only synthetic clubs/invites created and deleted by the test itself; no child identity is shown or implied at this state. Light-theme and physical-device verification remain pending, consistent with prior visual PRs in this roadmap.
