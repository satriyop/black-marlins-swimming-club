# Account and navigation review

#49 compacts the mobile header to a 64 px minimum at normal text size, with a named 44 px account trigger and club/home link. The header can grow with enlarged text. Full name, email, effective roles, appearance, onboarding help and the actual persisted task-view switch live in a Radix account popover. Missing or failed avatar images use initials. No profile-edit destination or new authorization rule is introduced.

## Interaction contract

- The account control is a labelled button, not an image-only link. The popover has dialog semantics, an explicit close control, Escape handling, focus return and a scrollable height constrained to the available viewport. Closed content is unmounted and unavailable to keyboard focus.
- Effective role labels and the Urus klub / Anak saya switch reuse the implementation already delivered in #35. The switch still persists through `saveClubTaskView`; changing the label does not add/remove permissions. Failed changes are announced. Onboarding help retains its real destination and mutation.
- Keluar calls the existing sign-out function and retains its root redirect. It disables during the request, exposes pending state and offers a readable retryable error. Auth-disabled and gate-marker sessions still omit the action.
- The five existing mobile positions and role-specific destination labels are preserved. Primary links use aria-current=page, an icon background and a stronger label weight. Lainnya identifies an active nested destination; its menu shows the current page and supports Escape/focus return.
- Navigation uses an opaque card surface, 12/16 px labels and 20 px icons at normal text size. Labels wrap rather than disappear. The desktop sidebar uses the same active treatment and can scroll with enlarged text; its width is capped to leave space for page content.
- A ResizeObserver measures the entire bottom navigation including safe-area padding. Content and the sticky practice-editor actions reserve that measured height. Focus/visual-viewport/height changes move an obscured input above the bar. The viewport includes viewport-fit=cover. Listeners, observers, scheduled frames and root CSS state are cleaned up on unmount.

## Review evidence

Browser coverage includes guardian, coach and admin-plus-guardian accounts; normal/missing/failed avatars; full long names and emails; both themes; all primary destinations; nested active navigation; real task-view changes; menu keyboard focus; sign-out pending, failure and successful return to the signed-out screen. The gate-marker cookie reader is simulated because the local HTTP fixture cannot expose a Secure __Host cookie; identity and role data still come from the real authenticated server. This is not a test of a live gate service or secure-cookie transport.

UI fixtures create and remove only their own synthetic club/user/session data in an explicit local PostgreSQL database. Session seeding avoids the shared password rate limit while exercising the application's real session and permission readers. Production auth and rate-limit configuration are untouched.

The suite checks 320 px with 200% text, 844×390 landscape and 1440×900 desktop, plus a focused distance field in a shortened 390 px viewport with an added 34 px bottom inset. Font requests are blocked in automated tests so CDN delays cannot determine pass/fail; these images document the app's fallback font. Normal production font selection remains unchanged.

Before: [mobile dark](design-evidence/navigation-before-dark-mobile.png) · [mobile light](design-evidence/navigation-before-light-mobile.png) · [desktop dark](design-evidence/navigation-before-dark-desktop.png) · [desktop light](design-evidence/navigation-before-light-desktop.png).

After: [mobile dark](design-evidence/navigation-after-dark-mobile.png) · [mobile light](design-evidence/navigation-after-light-mobile.png) · [desktop dark](design-evidence/navigation-after-dark-desktop.png) · [desktop light](design-evidence/navigation-after-light-desktop.png).

Expanded account: [dark](design-evidence/account-dark-mobile.png) · [light](design-evidence/account-light-mobile.png). Complete screen/zoom/modal evidence is uploaded by CI as browser-evidence.

Physical Android/iPhone soft keyboards, installed-app safe areas and poolside readability remain pending. Browser viewport/inset simulations do not establish those device behaviours. Dark remains the default as specified in #48.
