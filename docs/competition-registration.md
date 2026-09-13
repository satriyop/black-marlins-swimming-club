# Competition registration (#17)

Coaches open a meet with a deadline, an explicit eligible swimmer roster, group labels for that roster, and available race choices. Parents respond for their own children and may request or correct available races before the deadline. Staff proposals require a guardian response; staff status alone cannot provide family consent. A dual-role adult can use their actual guardian permission for their own child.

Group labels are snapshots for this meet, initially suggested from age groups and editable before opening. They do not create training groups or assign lanes (#12). Eligibility and available races are fixed after opening in this release. This keeps the approved roster reproducible; the UI states that configuration is for the selected participants.

## State and correction rules

- `meet_entries.status` still describes a race outcome. Registration uses a separate `registration_status`: legacy, proposed, requested, approved, rejected, submitted, confirmed, declined, withdrawn.
- Guardian responses are pending, yes, no, or withdrawn. No/withdrawal require a reason. Individually withdrawn races require an explicit correction to resubmit; simply responding yes does not restore them.
- Parents can change participation and races only while registration is open and before the deadline. Coaches can finish decisions on already received requests after that deadline. Both require an active meet, eligible child, and allowed event.
- A coach approves/rejects requested races. Locking requires all requested races to be decided. Unanswered proposals remain visible but are excluded from the approved export. Approved athletes must still be active and have family consent.
- Only staff export the locked approved/submitted/confirmed roster. CSV contains club, swimmer, group snapshot, age group, race, pool, seed, registration status, revision, and export timestamp. Text cells neutralize spreadsheet formulas.
- Exporting does not record external submission. Staff explicitly record submission and then confirmation, each with an evidence note; the audit captures actor and server timestamp. No messages or organizer API calls are sent.
- Reopening requires a reason and a new future deadline. Earlier approved/submitted/confirmed races return to requested; prior evidence remains in history. Staff must approve, export, and record any organizer correction again. A changed date, pool, or reactivation also invalidates approval and clears the deadline until explicitly reopened.
- Cancelled, completed, and past meets reject registration mutations. A multi-day meet remains current through its end date. History is retained; meets with entries or registration history cannot be deleted through the app.
- Each mutation locks the meet row and checks the displayed revision. Stale submissions fail without overwriting another change. Meet detail reads hold a shared lock so the displayed entries and revision form one consistent view. Exports serialize against mutations.

## Migration

`0013_meet_registration.sql` is additive and compatible with PostgreSQL and PGLite. Existing entry IDs, times, race outcomes, lane/heat fields, and duplicates remain intact. Existing rows become `legacy`: no approval or organizer acceptance is inferred. They stay out of the approved export until explicitly corrected into the new workflow. The partial unique index prevents duplicate workflow races without deleting imported history. The new migration does not depend on the separately developed practice-series migration.

Legacy duplicate races must be reconciled before entering the new workflow; the app refuses to create another matching race. Existing result recording and import remain separate from registration.

## Verification

Domain tests cover full transitions, family/club isolation, consent, eligibility, event validation, deadlines, cancelled/completed meets, stale/duplicate requests, rejection/withdrawal, reopened approvals, legacy preservation, CSV escaping, and ongoing multi-day visibility.

Built-app Playwright tests exercise real authenticated staff and guardian sessions against local PostgreSQL: opening and proposing, parent correction, approval/export, submission/confirmation, linked profile status, expired/stale drafts, reopening, and concurrent submissions in two tabs. Fixtures use synthetic users and records. Mobile evidence uses desktop browser emulation; physical devices and production have not been tested for this change.
