# Announcement follow-through (#38)

Publication, opening, and explicit acknowledgement are separate outcomes. The composer publishes in-app and says `Pengumuman diterbitkan`; neither publication nor acknowledgement implies push delivery. No external messages are sent.

## Audience and access

The database captures all current eligible club readers when an announcement is inserted: staff, admitted families (including those with no child yet), linked guardians, and swimmer accounts. Multiple roles count once. The author is part of that audience; publishing marks the author's first revision opened, but never acknowledged.

The audience remains fixed through corrections. Later joiners can read club announcements but are not retroactively required to acknowledge them. Staff follow-up intersects that snapshot with current club membership, so revoked access removes someone from outstanding tasks without deleting their snapshot or previous receipts. If another membership still grants club access, that person remains eligible. Reinstating membership restores their original audience status and retained receipts.

Any staff member can inspect current-revision follow-up counts and names. Ordinary recipients receive only their own open/acknowledgement state and revision history, never the receipt list. Creation, correction, acknowledgement, archive, and context-selection endpoints enforce current club and role access independently of the UI. Only an active staff author or a club admin/superadmin may correct or archive a post.

## Revisions and actions

Every change to title, body, importance, due date, or practice/meet link is treated as material. Corrections require an explanation and create an immutable content snapshot with editor and timestamp. No-op submissions do not create revisions. Important corrected notices require acknowledgement of their new revision; earlier text, opens, and acknowledgements remain in history. Ordinary notices require opening only.

Opening records the current revision's first-open timestamp. Acknowledgement requires a previously opened current revision and an active audience membership. Duplicate requests for the same user/revision return the original timestamp; stale acknowledgements cannot approve a newer revision. Corrections and archives check the displayed revision under a row lock. Concurrent edits cannot overwrite one another, and the UI retains a failed draft for review.

Archival records actor, time, and reason. It preserves all history and keeps the post available in the archive view while removing it from active unread/acknowledgement tasks. Archived notices cannot be edited or acknowledged. Staff counts are labelled for currently eligible recipients, not all historical members.

Unread and pending-acknowledgement dashboard counts are separate. Opening an important notice does not remove the outstanding acknowledgement action from Hari Ini.

## Context and migration

The composer offers optional practice and meet selectors scoped to the staff member's club. Practice schedule-change/cancellation banners and meet headers open a prefilled composer; review and explicit publication are required. Saving a practice never publishes automatically. Links are validated on both creation and correction, and linked titles are joined within the announcement's club.

`0014_announcement_followthrough.sql` preserves existing read timestamps as revision-1 opens, never as acknowledgements. For legacy posts, it explicitly records an audience established at migration time because the original publication audience is unknown; the staff UI labels this baseline. A database insertion trigger captures new audiences and first revisions atomically, including posts inserted by the previous application during the migration/release handoff. The migration does not depend on the separate practice-series or meet-registration migrations.

Tests cover permissions, privacy, new/revoked/dual-role members, current-revision acknowledgement, retries, stale actions, archived tasks, linked-resource isolation, legacy migration, and full browser workflows with synthetic local PostgreSQL records. Browser evidence is desktop Chromium and mobile viewport emulation; physical-device and production behavior are not asserted.
