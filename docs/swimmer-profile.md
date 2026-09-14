# Swimmer profile review

#52 reorders the swimmer profile around identity → concise progress → next registered event → records/chart → detailed history, replacing three equal-weight stat boxes and a full attendance table sitting mid-page with a compact summary line and a collapsed disclosure at the bottom. Result editing/filtering/grouping (per-nomor accordions, meet/nomor filters, preview/show-more, edit/delete permissions) is unchanged.

## Interaction contract

- Header keeps the primary permitted action (Catat waktu) filled/prominent; edit (Ubah data) is now outline/secondary via a new `variant` prop on `SwimmerDialog`; delete stays a quiet icon button with its existing confirmation.
- The three stat boxes collapse into one compact labelled line (Kehadiran, Volume, PB tercatat) plus a "PB terbaru" sentence built from already-fetched PB data — no new calculation, no new query. Unrecorded attendance (`total === 0`) still renders as "—", never as "0%".
- Pendaftaran kejuaraan moves directly under the summary, ahead of records/chart, so an upcoming registration is visible without scrolling past history.
- Riwayat kehadiran moves to a collapsed `<details>` at the very bottom; its data, columns and copy are unchanged, just no longer competing with the more time-sensitive content above it.
- Result rows: time is now `text-xl`/`text-2xl` bold tabular numerals (was `text-lg`); the PB row gets a restrained `ok`-tone badge instead of a muted "· PB" text suffix; DQ/DNS/DNF render as a labelled `danger`/`warn` badge instead of plain uppercase text, and never as `0.00` or a fabricated time.

## Review evidence

Browser coverage (`tests/e2e/swimmer-profile.spec.ts`) checks: an empty profile renders unrecorded states correctly (not zeros), the section order (summary → next event → records → history), a long meet name, a 9-row same-nomor group collapsing behind "Lihat semua", the PB badge, a DQ outcome badge with no fabricated time, the attendance history disclosure staying collapsed by default, and a genuine meet+nomor filter-miss offering the existing reset copy rather than "no records ever". `tests/result-list.test.ts` (unchanged assertions) and the full Vitest/Playwright suites pass.

Before: [mobile](design-evidence/profile-before-mobile.png) · [desktop](design-evidence/profile-before-desktop.png).

After: [mobile dark](design-evidence/profile-after-dark-mobile.png) · [mobile light](design-evidence/profile-after-light-mobile.png) · [desktop dark](design-evidence/profile-after-dark-desktop.png) · [desktop light](design-evidence/profile-after-light-desktop.png).

Physical-device and screen-reader-software verification remain pending, consistent with prior visual PRs in this roadmap.
