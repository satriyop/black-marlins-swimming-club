# Coach attendance review

#51 replaces the five equally-emphasised status buttons on each roster row with a status badge, a one-tap Hadir action, and a labelled Ubah status select carrying every permitted status. The session-level filter row drops six equal buttons for two primary filters (Semua, Belum dicatat) plus a Status lain overflow select. Session lifecycle, participant add/remove, off-roll history, guardian absence notices and correction requests are unchanged.

## Interaction contract

- Current status is a coloured badge (`ok` for Hadir, `warn` for Izin/Sakit, `danger` for Alfa, `muted` for Belum dicatat) instead of a highlighted button, matching the tokens established in #47.
- Hadir is one tap when permitted and not already the current status; Ubah status always exposes the full permitted set so any status (including reverting to Belum dicatat) stays reachable.
- Jarak selesai collapses behind an Ubah jarak/Hapus jarak disclosure once a distance is saved; an unsaved distance stays open and visible, and is never inferred from the planned set volume.
- Filtering hides non-matching rows with CSS rather than unmounting them, so an in-progress distance draft on one row survives filtering and another row saving. This was verified to regress under the previous unmount-based filter and is covered by a browser test.

## Review evidence

Browser coverage (`tests/e2e/coach-attendance.spec.ts`) seeds 12 on-roll swimmers spanning every status plus one long name and one off-roll swimmer, and exercises: one-tap Hadir, Ubah status switching, an unsaved distance draft surviving both another row's save and a filter change, the saved-distance disclosure, and the Status lain overflow filter. The full existing Playwright and Vitest suites pass unchanged.

First on-roll row height at 390 px dropped from 330 px to 260 px (about 21%) with identical fixture content.

Before: [mobile](design-evidence/attendance-before-mobile.png) · [desktop](design-evidence/attendance-before-desktop.png).

After: [mobile dark](design-evidence/attendance-after-dark-mobile.png) · [mobile light](design-evidence/attendance-after-light-mobile.png) · [desktop dark](design-evidence/attendance-after-dark-desktop.png) · [desktop light](design-evidence/attendance-after-light-desktop.png).

Keyboard/screen-reader operation of the native Ubah status and filter selects relies on standard `<select>` semantics; physical-device and screen-reader-software verification remain pending.
