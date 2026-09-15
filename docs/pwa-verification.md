# Installed app verification — issue #27

Browser automation checks the production build with synthetic accounts. It cannot prove that Safari and Chrome return from Google to a home-screen app on a physical phone. Record the results below for the **same deployed release SHA** on one Android phone and one iPhone. A written observation from the tester is valid evidence; screenshots are optional. Use an authorized adult test account and a synthetic swimmer account. Do not put passwords, invite tokens, athlete details, or session cookies in this document or screenshots.

## Release and devices

| Field | Android | iPhone |
| --- | --- | --- |
| Release SHA and app URL | Pending | Pending |
| Test date and tester | Pending | Pending |
| Device and OS version | Pending | Pending |
| Browser and version | Chrome: Pending | Safari: Pending |
| Install method | Chrome Install app | Safari Share → Add to Home Screen |
| Overall result | **Unverified** | **Unverified** |

## Run on each installed app

Record **Pass**, **Fail**, or **Blocked** with a short observed result for every row. “Pass” means the expected behavior happened on the physical installed app. For any failure, include steps, the visible error, and whether it repeats after reopening. Retest after a new release SHA.

| Step | Expected result | Android observed | iPhone observed |
| --- | --- | --- | --- |
| Install and launch from the home-screen icon | Correct icon/title; login or authorized home opens inside the installed app. | Pending | Pending |
| Adult Google sign-in from a protected link | Google opens; completion returns to the app and the requested same-origin page. | Pending | Pending |
| Cancel Google sign-in, then retry | A readable error returns to login; retry works; no blank screen or loop. | Pending | Pending |
| Close the app fully and reopen | The same account remains signed in until its session expires; correct role home opens. | Pending | Pending |
| Open an invitation link in browser, then installed app | Valid invite remains usable; expired/revoked/invalid links explain the state and offer a way back. | Pending | Pending |
| Sign out; reopen and use Back | Protected details do not appear in the installed app, browser history, or offline fallback. | Pending | Pending |
| Switch to another authorized test account | Only the new account and its permitted children/club data appear; old protected links are denied. | Pending | Pending |
| Expire/revoke the test session and reopen a protected link | Login appears with a safe return to the original same-origin page after signing in. | Pending | Pending |
| Turn on airplane mode, reopen, reconnect | Public offline page appears; no private details are cached; normal pages recover after reconnect. | Pending | Pending |
| Install a newer release, close/reopen | Update notice or reload moves to the new release without losing the session or trapping navigation. | Pending | Pending |
| Back navigation and an external link | Back stays predictable; external links open normally without leaking a login return path. | Pending | Pending |

## Automated evidence

CI runs the production-build Playwright suite on every PR and main push. `tests/e2e/pwa-auth-journey.spec.ts` covers password invite → login → deep-link reopen, logout/back/account isolation, and expired-session return. `tests/e2e/pwa-install.spec.ts` and `tests/e2e/pwa-offline.spec.ts` cover install metadata, public-only offline fallback, and worker updates. Existing role and invitation tests cover guardian/coach/combined navigation and accepted/expired/revoked/mismatched invitations. CI evidence is separate from the physical-device rows above.

Issue #27 remains open until both Android and iPhone rows are complete on the same release and any failures are resolved.
