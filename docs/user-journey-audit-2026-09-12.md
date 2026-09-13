# User journey audit: guardian, staff + guardian, and coach

Reviewed 2026-09-12 at commit `0674858dd819b276801bea782db71d1eeb67e8fb`.

**Verdict: the app provides useful daily actions, but none of the three journeys is fully complete from invitation through orientation, ordinary work, correction, and ongoing access management.** The most substantial gaps are workflow gaps, not visual styling. A PWA would make access easier but would preserve these same gaps.

This is an assessment of current executable code, UI copy, and local runtime behaviour. It does not assume a person understands a page just because its controls exist. Statements about likely confusion are UX judgments; recorded screens and database behaviours are observations.

## Evidence and limits

- Read the invitation, authentication, access, navigation, dashboard, practice, swimmer, competition, announcement, and membership code.
- Executed 34 targeted tests across seven files: 28 existing tests plus six temporary scenario probes. All passed. The probes assert observed current behaviour, including defects; passing does not mean the journeys are correct.
- Walked three new fixture identities through invitation preview, authenticated acceptance, first dashboard, and attendance in a local Chromium browser at 390 × 844. Captured 11 screen observations, including guardian profile and coach invitation denial, with zero page errors.
- Browser fixtures used local password credentials to establish adult sessions. The public screens correctly offered Google. **Live Google OAuth, actual invitation delivery, production state, and real mobile devices were not exercised.** No production writes or messages were sent.
- The six probes reproduced: automatic acceptance of both adult roles; a new athlete missing an existing session roll; inability to retract absence plus overwriting historical attendance; guardian inability to delete their test result; entry creation for a cancelled meet; automatic read receipt on opening an important notice.
- Temporary verification code and generated route changes were removed. Only this report is an intended repository change.

## 1. Guardian journey

### What the guardian should accomplish

Understand which child or children the account represents; know the next practice and any changes; report an absence and correct it if plans change; understand competition participation; follow progress; and know where to resolve a missing child or incorrect record. Creating a child's login or inviting another guardian is optional family administration, not the primary first task.

### Current journey, screen by screen

| Step | What appears and what can be done | Is the step complete? |
|---|---|---|
| Admin prepares access | Admin creates a swimmer, then selects Wali, one swimmer, and an email in Undangan. The app generates a link and explicitly asks the sender to share it manually. | Functional, but one-child-at-a-time creation and no guided “swimmer created → invite family” handoff. |
| Guardian opens the link | Terima undangan, club name, Wali perenang, masked recipient email, expiry, and Masuk dengan Google. Wrong-account switching and expired-link instructions exist. | A clear sign-in choice, but no explanation of the guardian's tasks. Child identity is not exposed in the public preview, which is reasonable; there is no authenticated child-confirmation step either. |
| Guardian accepts | Signed-in email is shown; the button says Terima sebagai wali perenang. Success says Undangan diterima, Anda sudah dapat membuka klub, and Buka klub. | Technical acceptance works; the success screen gives no child-specific next step. |
| First home screen | Greeting/date, unread notices if any, practice time/location/focus and Kehadiran & izin anak, upcoming competitions, progress, then Anak saya. Bottom navigation says Hari Ini, Latihan, Perenang, Kejuaraan, Lainnya. | Useful daily CTA. Family identity appears well below it; there is no welcome, “these are your children,” or “missing a child?” action. |
| Report absence | Practice opens on Kehadiran. Only linked children are listed. Copy explains that guardians may mark Izin/Sakit and coaches confirm attendance. Each write shows saving, error, or Tersimpan. | Happy path works. Correction and separation from coach-confirmed attendance are incomplete. |
| Read program | Program tab shows sets, intervals, focus, and notes. | Works when a program exists. Empty program only states that sets have not been added. |
| Follow the child | Perenang opens linked profiles. Profile has attendance percentage, total distance, PBs, trend chart, results, editing, and test-time entry. | Data is available. Attendance is an aggregate rather than a linked per-session history, and there is no feedback/next-training objective. |
| Competition | Open a meet, Daftar nomor, choose child/stroke/distance/optional seed, Daftarkan. Entry appears under Nomor terdaftar. Guardian can delete their child's entry. | Local registration works. Approval, organizer submission, deadlines, and final confirmation are not represented. |
| Family administration | Lainnya → Undangan can invite another guardian or create a swimmer account for a linked child. | Possible but poorly introduced. No account/relationship overview or correction/removal flow. |
| Return later / obtain help | Google login returns home. Generic uninvited and expired-link messages ask the person to contact admin/pengundang. | No named contact or in-app request. Ordinary deep links also lose their destination through login. |

Evidence: [invitation screen](../src/routes/terima.tsx), [invitation creation](../src/routes/undangan.tsx), [home](../src/routes/index.tsx), [practice](../src/routes/latihan_.$id.tsx), [child profile](../src/routes/perenang_.$id.tsx), [meet](../src/routes/event_.$id.tsx).

### Findings

**G1 — High: absence cannot be withdrawn, and a parent can overwrite the coach's historical record.** The parent only receives Izin/Sakit buttons. There is no Batalkan izin action or permitted reset to Belum. The server has no session-state/time boundary and writes directly into the attendance row, so a parent can change a past Hadir + 800 m record to Izin, clearing the completed distance. This was reproduced. The copy suggests separate parent reporting and coach confirmation, but the model is a shared status field. See `src/lib/club/attendance.ts:6`, `src/lib/club/permissions.ts:77`, and `src/routes/latihan_.$id.tsx:223`.

Recommendation: represent the guardian's absence notice separately from the coach's final attendance. Allow change/withdrawal before the session cutoff; for a finalized session, provide a correction request. Show a precise outcome such as “Izin untuk Ken tercatat. Dapat dibatalkan sebelum latihan dimulai.” Do not imply that the coach was notified unless a delivery mechanism exists.

**G2 — High: newly enrolled children can reach an empty attendance screen for an already scheduled session.** Attendance rows are created only when the practice is created, using the then-active roster. Adding a swimmer later, or updating that practice through the domain function, does not add a row. There is no UI to include the child in the session. The guardian can see the practice, but cannot report absence. Creating a new practice after enrollment works, so this is specifically the pre-existing-session path. See `src/lib/club/practice.ts:40` and `src/lib/server/fns-swimmers.ts:89`.

Recommendation: give each session an explicit participant list with authorized add/remove controls, and an admin enrollment step for adding a new swimmer to relevant future sessions. Preserve historical rosters; do not silently add a new athlete to old attendance records.

**G3 — High: “Nomor didaftarkan” does not establish actual competition acceptance.** Saving creates a local row with `status = 'terdaftar'`. There is no coach approval or organizer-submission step, and the current UI/server also permit new entries on a cancelled meet. The latter was reproduced. See `src/routes/event_.$id.tsx:278`, `src/lib/server/fns-meets.ts:65`, and `src/lib/club/writes.ts:91`.

Recommendation: make the states explicit: Diajukan wali → Disetujui pelatih → Dikirim ke panitia → Dikonfirmasi, with withdrawal/deadline rules. If external submission stays manual, record who confirmed it and show that fact; a database insert should not imply organizer acceptance.

**G4 — Medium: first-time orientation is absent.** After authenticated acceptance, confirm “Anda terhubung sebagai wali Ken” and show the first useful actions: check next practice, report absence, review child details. Provide “Anak belum terhubung?” and a reachable admin contact. Put Anak saya above general progress on the guardian home screen and use that label in guardian navigation. These changes provide a clear purpose without a lengthy product tour.

**G5 — Medium: guardian-entered test-time mistakes have no correction path.** Guardians can create test results but cannot edit or delete them. `canDeleteResult` allows staff and the swimmer themself, not a guardian who created a test. There is no result edit UI. This was reproduced. Recommendation: allow correction of the guardian's own unverified test record with audit history, or add a clear request-correction action. Do not broaden guardian access to official-result editing. See `src/lib/club/permissions.ts:18` and `:66`.

**G6 — Medium: the profile's attendance summary does not explain individual sessions.** A percentage and accumulated distance cannot answer “which day was my child marked absent?” The parent must manually find sessions in Latihan. Add a linked recent attendance history, reporting period, and correction request at the disputed row. See `src/routes/perenang_.$id.tsx:121` and `src/lib/server/fns-swimmers.ts:51`.

### Suggested complete guardian journey

Invitation → Google login → authenticated confirmation of linked children → short welcome with next practice → practice/program review → optional absence report with withdrawal → coach-confirmed attendance visible in history → competition proposal and explicit confirmation state → results plus coach next steps → a family/access/help page for later corrections.

## 2. Club staff who is also a guardian

“Staff” here means club_admin for the main walkthrough. A coach who also has children has the same family-context problem, but retains the coach's narrower roster/invitation permissions.

### What already works

The data model supports combined roles on one identity: `staff`, `guardianSwimmerIds`, and `selfSwimmerId`. Accepting a guardian invitation adds the child relationship without removing the staff role; a fresh admin + guardian fixture successfully obtained both. No second account is necessary. Permissions combine, so the person can perform club work and family actions.

A staff invitation alone does **not** identify that person's children. For an existing staff member to become a guardian, an admin or an already linked guardian must create the guardian invitation for the same email and child. A club admin can technically use the current invitation form to invite their own email as guardian; a coach without any guardian relationship cannot. None of these paths is explained in the product.

### Current journey, screen by screen

| Step | Actual behaviour | Gap |
|---|---|---|
| Invite as staff | Invitation identifies Admin klub or Pelatih and leads to generic Buka klub. | No explanation of responsibilities or optional family role. |
| Add family access | A separate guardian invitation adds the link for the same account. | No staff-profile action “Saya juga wali” or visible relationship confirmation. |
| First/returning home | Staff wins the primary CTA: Catat kehadiran. Skuad replaces Anak saya; featured swimmers are the first six of the shared roster. | The person's child is not guaranteed to appear among the six. |
| Family reminder | A line says “Anda juga wali [name]. Akses keluarga tersedia di profil perenang.” | Plain text, not child links; profile does not actually offer an absence shortcut or family-management page. |
| Record child's absence | Navigate to a session, then find the child in the full squad. | All staff controls remain visible; there is no family-filtered working context. |
| Manage access later | Undangan lists unaccepted invites. | No accepted-member directory, connected-guardian page, role change, unlink, or staff revocation screen. |

Evidence: `src/lib/club/hats.ts:5`, `src/lib/club/invites.ts:224`, `src/routes/index.tsx:65`, `:160`, `:229`, and `src/routes/undangan.tsx:190`.

### Findings

**D1 — High: combined permissions do not yet produce a complete combined-role journey.** The application grants both capabilities but makes the person work through a staff-oriented home and whole-club lists to find their family. The current “family access is in the swimmer profile” instruction does not lead to family-specific attendance controls there.

Recommendation: keep one account and add two visible task views: **Urus klub** and **Anak saya**. Include linked child cards and family practice actions in Anak saya; show squad, roll-taking, and management in Urus klub. Display both role labels in the account area and remember the selected view. These are navigation/data filters, not new authentication roles; the server still enforces actual permissions. Avoid forcing role switching for every action.

**D2 — Medium: roles can be added silently, outside the visible acceptance journey.** `loadClub` calls `acceptPendingInvitesForEmail`; ordinary access/dashboard loading accepts all valid pending staff/guardian invitations for the email. In the browser probe, the person explicitly accepted the staff invitation, then the first home load also accepted the pending guardian invitation. Direct Google login to home can also grant pending access without visiting the invite link. This may be intentional convenience, but it contradicts the apparent explicit acceptance screen and does not explain what changed. See `src/lib/club/context.ts:8` and `src/lib/club/invites.ts:304`.

Recommendation: retain convenient activation if desired, but always show a one-time authenticated access summary covering every newly granted role/child and a clear continue action. Alternatively, consistently require explicit acceptance. Do not silently mix both mental models.

**D3 — High for club administration: the access lifecycle ends at granting access.** Accepted invitations disappear from the invitation list; no screen shows all active staff and guardian relationships. `canRevokeStaff` exists as a permission helper but is not connected to a server action/UI. An admin cannot correct a mistaken child link, change an existing staff role through a supported workflow, or remove a departing staff member. Reinvitations to an existing staff email are rejected, so that is not a role-change workaround. See `src/lib/club/invites.ts:143`, `:83`, and `src/lib/club/permissions.ts:29`.

Recommendation: a Members & access page should show effective roles and linked children, accepted/pending/expired invitations, and permission-checked role/link management with confirmation and last-superadmin protection. Family-link requests require confirmation by authorized staff or an existing guardian, not unrestricted self-claiming.

### Suggested complete combined-role journey

Staff invitation → authenticate → understand club responsibility → “Saya juga wali” request/link confirmation → see both roles and named children → choose Urus klub or Anak saya → complete the relevant daily task → view completion/history in the same context → manage roles and family relationships later without a second account.

## 3. Coach journey

### What the coach should accomplish

Understand responsibility for the squad; plan a session; verify participants; communicate logistics; run the session and record actual attendance/distance; correct or cancel it when necessary; close the session; review progress; manage competition entries/results; and know who handles enrollment/access issues.

### Current journey, screen by screen

| Step | What appears and can be done | Assessment |
|---|---|---|
| Invitation | Pelatih → Google → acceptance → Buka klub. | Access works; responsibilities/first tasks are not explained. |
| First home | Next practice with Catat kehadiran, notices, competitions, squad progress/cards, club stats. With no practice, Jadwalkan latihan links to the practice list. | Good operational starting point, but club-admin and coach homes are largely identical. |
| Plan a practice | Latihan → new-session editor with date/time/location/focus/sets, examples, and total distance; save opens the session. | Coherent create flow. |
| Change a saved session | Detail header offers Salin sesi and Hapus sesi. | No edit, reschedule, or cancellation control. Copy creates a new record. |
| Verify roster | Every active athlete at session creation gets an attendance row. | No selection, grouping, add/remove, or later-enrollment repair. |
| Run practice | Attendance tab, per-row status, unmarked filter, completed-distance entry after Hadir, saving/error/success feedback; Program tab for sets. | Strongest completed workflow, while online. No session closure or reconciliation of outstanding rows. |
| Communicate | Lainnya → Pengumuman → compose title/body/important/deadline. Recipients see unread notices and coach can inspect opened counts. | Works as an in-app notice board, not delivered/acknowledged communication. |
| Manage a meet | Create/edit meet, add/remove entries, record result, inspect results/progress. | CRUD is present; approval/submission lifecycle remains missing. |
| Enroll a missing child / invite family | Coach cannot create swimmers or invite users unless they also have appropriate family/admin permissions. | Potentially correct division of duties, but no admin handoff is offered. |
| End the session / follow up | Recorded data persists and contributes to stats. | No explicit completed-session state, follow-up summary, or individual coaching-feedback flow. |

### Findings

**C1 — High: a saved practice cannot be edited, rescheduled, or cancelled from the UI.** The domain function accepts an existing ID, but the only editor route is new/copy and its mutation does not pass an ID. Copy is not an edit: it creates a new attendance roll. Deleting a session deletes attendance too. A coach changing the venue or correcting a set is forced into a destructive or duplicate-record workaround. See `src/routes/latihan_.$id.tsx:81`, `src/routes/latihan_.baru.tsx:11`, and `src/components/swim/practice-editor.tsx:60`.

Recommendation: add Ubah sesi, Pindah jadwal, and Batalkan sesi while preserving ID, attendance, and history. Cancellation should have a reason and clearly appear to families. Offer a linked announcement after a material change and distinguish recording the change from notifying recipients.

**C2 — High: roster preparation and session closure are missing.** New-athlete exclusion is reproduced under G2. There is also no explicit state beyond individual attendance values, so the coach cannot mark roll-taking reviewed or the session completed. The dashboard selects by session date, not whether a session has finished; the browser showed a 15:30 session as today's primary action in the evening. See `src/lib/club/practice.ts:47` and `src/lib/club/dashboard.ts:31`.

Recommendation: participant review → scheduled → in progress → completed/cancelled, with unresolved attendance count and an explicit review before completion. Do not convert unmarked swimmers to absent automatically. Show completed-session summary and the next actual upcoming session separately.

**C3 — Medium: the coach cannot complete the communication loop.** Important notices are marked read merely by fetching their detail; there is no explicit “Saya sudah membaca/memahami” action. The UI accurately labels the receipt count as “sudah membuka,” but this cannot establish acknowledgement. The compose success toast says Pengumuman terkirim even though this creates an in-app post; there is no outbound notification. Although the backend supports optional practice/meet references, the composer exposes no selectors or contextual links to set them. No edit/archive flow is exposed for correcting a posted announcement. See `src/lib/club/announcements.ts:182`, `src/routes/pengumuman_.$id.tsx:92`, and `src/routes/pengumuman.tsx:79`.

Recommendation: say Pengumuman diterbitkan; separate opened from explicit acknowledgement for important notices; allow corrected/archived announcements; provide contextual “Umumkan perubahan” actions from practice/meet pages. Keep push delivery as a later channel rather than assuming it exists.

**C4 — Medium: a new coach is not told where their responsibilities stop.** The browser confirmed invitation-page denial for a coach-only account. The swimmer-list empty state says linked swimmers will appear, wording better suited to a guardian than a coach who needs an admin to enroll athletes. Add coach onboarding with Plan session / Check squad / Read notices, plus a visible admin handoff for enrollment and family-access requests. Restricting coach permissions is not itself a defect; omitting the handoff leaves the work unfinished.

### Suggested complete coach journey

Invitation → role and responsibilities welcome → check squad/participants → create or adjust practice → publish relevant instructions → record attendance and actual distance → resolve missing rows → complete session → share short follow-up and swimmer objectives → propose/approve competition entries → record organizer confirmation and results → review progress for the next session.

## Cross-role recovery gaps

- **Deep links after sign-in:** AppShell redirects unauthenticated users to `/login`; login uses callback `/` and has no intended-destination parameter. An ordinary practice/meet/announcement link requires re-navigation after login. Invitation links have their own callback and are an exception. Preserve only validated same-origin intended destinations. Evidence: `src/components/layout/app-shell.tsx:51`, `src/lib/auth/gates.tsx:26`, `src/components/auth/login-screen.tsx`, `src/routes/login.tsx:10`.
- **Help is text, not a destination:** expired/wrong/missing access can lead to “ask admin,” but no named club contact or request action is provided. Offer a simple reachable support contact and task-specific correction request; a complete chat system is unnecessary.
- **Presentation does not replace outcome states:** Tersimpan means a write succeeded; it does not mean a coach approved, an organizer accepted, or a family acknowledged. Each relevant workflow needs its own explicit state and next action.

## Recommended implementation order

| Priority | Coherent change | Definition of completion |
|---|---|---|
| 1 | Correct attendance ownership and add session lifecycle/participant management | A parent can report and retract an absence safely; a coach can include a newly enrolled child, edit/cancel a session without deleting history, and close it with unresolved rows visible. |
| 2 | Role-specific first visit and family context | Every adult sees their effective roles/linked children after activation; a guardian can identify the next task; dual-role users have direct family links and a usable family view. |
| 3 | Access and error recovery | Admin can inspect/change/revoke supported access; families can request missing-child/correction help; protected links resume after login. |
| 4 | Competition registration lifecycle | Proposal, coach decision, organizer submission, and confirmation are distinct; cancelled/closed meets reject new registration. |
| 5 | Communication and progress follow-through | Important notices support acknowledgement and correction; attendance history and test-time correction are reachable; coach feedback gives families a next step. |

The first three priorities complete existing daily journeys. They should precede treating installability, push, or more dashboard statistics as evidence of a complete product experience.
