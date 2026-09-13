# Role journey specifications and swimmer enrollment decision

Created 2026-09-12. See the companion `user-journey-audit-2026-09-12.md` for the observed role journeys. Existing source edits belong to other work and were left untouched.

**Status:** journey repairs are specified for future PRs. Swimmer enrollment v1 policy is **locked 2026-09-12** (GitHub #32). No application permissions were changed by this documentation task.

## Where the swimmer record comes from today

Superadmin/club_admin creates the athlete in Perenang. The optional swimmer login (`swimmers.user_id`) is distinct from the guardian relationship (`guardians`). Guardians can edit already-linked children but cannot create new ones; coach-only users cannot create swimmers. A staff-created swimmer does not automatically appear under the creator's Anak saya. The current guardian invitation requires an existing athlete, which prevents a first-time parent from starting before staff creates that record.

## Locked v1 policy (2026-09-12)

If superadmin/club_admin has the parent’s email, inviting them **is** club admission. After Google login the parent can create their swimmer. Create by that wali inserts the athlete and the guardian link in one step. Admin-created athletes still do not auto-link. Coaches cannot create, invite, or approve. There is no application/review queue.

Journey: admin has email → wali invite → Google login → already in the club → Daftarkan anak → Anak saya → next practice.

Two invite shapes:

1. **Anak sudah di sistem** — today’s wali invite with swimmer ids (existing children and co-parents).
2. **Anak belum di sistem** — email only. Parent is a wali with zero children until they create.

A wali with zero children must be invited (see club notices / Daftarkan anak) and must not see the skuad. Missing link on an existing child uses shape 1; no “claim this child” form. Siblings: Daftarkan anak lain. Dual-role staff use the same account.

Name + date of birth is a duplicate warning, never a unique key or auto-merge. Next-session inclusion of a new child is #33; do not backfill historical attendance.

Canonical write-up: https://github.com/satriyop/black-marlins-swimming-club/issues/32

## GitHub handoff

Roadmap: https://github.com/satriyop/black-marlins-swimming-club/issues/31

- [Guardian onboarding: admin invite admits parent; parent creates swimmer](https://github.com/satriyop/black-marlins-swimming-club/issues/32) — v1 locked
- [Journey: Complete practice editing, participants, cancellation, and closure](https://github.com/satriyop/black-marlins-swimming-club/issues/33)
- [Journey: Separate guardian absence reports from coach attendance and add correction history](https://github.com/satriyop/black-marlins-swimming-club/issues/34)
- [Journey: Role-specific onboarding and Urus klub / Anak saya navigation](https://github.com/satriyop/black-marlins-swimming-club/issues/35)
- [Journey: Active members, role management, guardian links, and invitation recovery](https://github.com/satriyop/black-marlins-swimming-club/issues/36)
- [Journey: Resume protected links after login and provide actionable access help](https://github.com/satriyop/black-marlins-swimming-club/issues/37)
- [Journey: Announcement acknowledgement, correction, and contextual publication](https://github.com/satriyop/black-marlins-swimming-club/issues/38)
- [Competition registration — expanded spec](https://github.com/satriyop/black-marlins-swimming-club/issues/17)
- [Recurring practice — lifecycle dependency](https://github.com/satriyop/black-marlins-swimming-club/issues/18)
- [Coach feedback — family follow-through](https://github.com/satriyop/black-marlins-swimming-club/issues/11)
