# BMSC Club OS — tenancy, roles, hosting

Evolve the existing TanStack Start app from **one login = one cloned club** into **one club, many logins, stacked hats**. Indonesian UI, English code. Postgres + Node on the aidev VPS; Cloudflare Tunnel is the public HTTPS door.

This is not a rewrite in Laravel. This is not Workers/Vercel/Neon.

## Goal

A 50-swimmer club logbook that real families can use:

- One club: Black Marlins Swimming Club Klaten.
- People join by invite only.
- One user may hold several hats at once.
- Coach stays on the deck; office data is `club_admin` work.
- Minors’ DOB/names never appear to an uninvited Google account.

Success: the three named swimmers live once, visible to both guardians and to staff, not copied into every Gmail.

## Language

| Layer | Language |
|---|---|
| Tables, columns, types, helpers, variables, comments | English |
| UI copy, emails, flash toasts, route URLs | Indonesian |

Keep existing URL paths (`/perenang`, `/latihan`, `/event`, `/aktivitas`). Identifiers inside those files are English (`swimmer`, `practice`, `meet`).

### Glossary

| UI (id) | Code (en) | Meaning |
|---|---|---|
| Klub | `club` | The single tenant. |
| Pengguna | `user` | A Better Auth login. Not a hat. |
| Superadmin | `superadmin` | Owner. All club powers plus grant/revoke `superadmin`. |
| Admin klub | `club_admin` | Office staff for **this** club. Full club data. May invite `club_admin` and `coach` **in this club**. Cannot grant `superadmin`. |
| Pelatih | `coach` | Field. Practices, attendance, times. No invites. |
| Wali | `guardian` | Parent/manager of one or more swimmers. |
| Perenang | `swimmer` | Athlete record. Login optional. |
| Undangan | `invite` | One-time join token. |
| Latihan | `practice` | Training session. |
| Event | `meet` | Competition. |
| Tes waktu | `test time` | Internal/time-trial result. |
| Hasil kejuaraan | `official result` | Meet result. |
| Staf | `staff` | `superadmin` \| `club_admin` \| `coach` on `club_staff`. |

## Architecture

```
Browser (Indonesian UI)
  → TanStack Start (Nitro node-server on aidev)
      → Better Auth (Google for adults, password for swimmer accounts)
      → Postgres on localhost
Cloudflare Tunnel → public HTTPS → Node
5432 never leaves the box
```

Local: `npm run dev` with PGLite (disposable) or optional local Postgres. Production: Postgres only.

Strip, do not feature-flag: Grok PWA, preview host bridge, `app-data` connectors, multiplayer, `GROK_AUTH_*`, `PREVIEW_CLIENT_SECRET`, X/`grok-x`, Vercel preset, Neon-oriented verify paths, per-user `ensureSeeded`.

## Data model

Tenant key is `club_id`, not `user_id`.

### `clubs`

One row. Drop `user_id unique`. Keep `name`, `short_name`, `city`, `province`, `country`, `coach_name`, `venue`, `motto`.

`coach_name` is display (Hardiyanto Wibowo) until that person accepts a `coach` invite.

### `club_staff`

Unique `(club_id, user_id)`: one staff hat per user per club. Guardian is a different table, so superadmin+guardian still stacks.

`role` check: `superadmin` | `club_admin` | `coach`.

### `guardians`

`(user_id, swimmer_id)` unique. Many-to-many. No `role` column — guardianship **is** the hat.

### `swimmers`

Replace `user_id` with `club_id`. Add nullable `user_id` (the optional child login). Keep `full_name`, `nickname`, `date_of_birth`, `gender` (`putra`|`putri`), `status`, etc.

### `invites`

`club_id`, `email` (nullable for username-only swimmer accounts), `kind`, `payload` (json: `role` for staff, `swimmer_ids` for guardian, `swimmer_id` for child account), `token`, `invited_by`, `expires_at`, `accepted_at`.

Kinds: `staff` | `guardian` | `swimmer_account`.

Staff payload `role` may be `club_admin` or `coach`. Only a `superadmin` inviter may set payload role `superadmin`.

### Operational tables

`practices`, `practice_sets`, `practice_attendance`, `meets`, `meet_entries`, `results`, `activities`: replace tenant `user_id` with `club_id`. Optional `created_by` (user id) for audit, never for isolation.

`results` distinguish official vs test: add `kind` `official` | `test` (or equivalent check). Swimmer may insert `official` only for `swimmer_id` they own. Guardian may insert `test` for linked swimmers, not `official`.

Recompute personal bests from `time_ms` on read (or a dedicated query). Do not trust a stored `is_pb` flag.

Child tables must not accept a parent id from another club. Every write: load parent by `id` **and** `club_id`, then authorize.

## Auth

Adults (superadmin, club_admin, coach, guardian): **Google only**. Drop X.

Swimmer accounts: **invite + email/username + password**. Better Auth email/password is enabled but **not** a public sign-up. Only an accepted `swimmer_account` invite creates that user.

Replace the Grok OAuth broker with native Google (`/api/auth/callback/google`). Production requires `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (public tunnel origin), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. No preview-secret fallback. Missing secret → refuse to boot in production.

Invite accept:

- Staff/guardian: sign in with Google; email must match invite; then insert `club_staff` or `guardians`.
- Swimmer: set password (and email/username from invite); set `swimmers.user_id`.

Google user with no invite and no existing hat: signed in but empty state “Akun belum diundang. Hubungi admin.” No roster.

Who may create invites:

| Inviter | May create |
|---|---|
| `superadmin` | `staff` (`superadmin` \| `club_admin` \| `coach`), `guardian`, `swimmer_account` |
| `club_admin` | `staff` (`club_admin` \| `coach`) **this club only**, `guardian`, `swimmer_account` |
| `coach` | none |
| `guardian` | `guardian` on **their** swimmers, `swimmer_account` for **their** swimmers |
| `swimmer` | none |

A `club_admin` cannot grant or revoke `superadmin` and cannot invite into another club (v1 has one club). The last `superadmin` cannot be revoked.

## Authorization

Every server function: session → resolve hats for this club → load row by `club_id` + id → matrix. Fail closed: missing row = not found, not an empty club. Cross-family access returns the same 403 as missing (no name leak).

Hats stack. Satriyo is `superadmin` and guardian of all three: staff powers on the club **and** guardian powers on those kids, one login.

### Write matrix

| Action | Superadmin | Club admin | Coach | Guardian (linked) | Swimmer (self) |
|---|---|---|---|---|---|
| Roster / DOB / notes | write | write | read | write linked | limited own (not DOB) |
| Invite / revoke `club_admin`, `coach` | yes | yes, this club | no | no | no |
| Invite / revoke `superadmin` | yes | no | no | no | no |
| Invite wali / akun anak | yes | yes | no | their kids only | no |
| Practice / sets / attendance | write | write | write | izin/sakit linked | read |
| Meet + entries | write | write | write | write linked | read |
| Test times | write | write | write | write linked | read |
| Official meet results | write | write | write | read | **write own** |
| Activities | write | write | read | read | read |
| Club profile (`coach_name`, venue, …) | write | write | no | no | no |

Coach sees all ~50 swimmers (they train them). Guardian sees only linked children. Swimmer sees self.

v1: no squads, iuran, KTA, relays, parent chat.

## Screens

Nav filtered by hats. Stacked hats show the union of items.

| Route | UI | Notes |
|---|---|---|
| `/login` | Masuk | Google for adults; password fields for swimmer accounts |
| `/` | Dasbor | Scoped to hats |
| `/perenang`, `/perenang/$id` | Perenang | Guardian: linked only; swimmer: self |
| `/latihan`, `/latihan/$id` | Latihan | Coach/admin write; guardian izin/sakit |
| `/event`, `/event/$id` | Event | Official results: staff + swimmer-self |
| `/aktivitas` | Aktivitas | Staff write; others read (including swimmers) |
| `/undangan` | Undangan | Hidden from coach and swimmer |

## Seed (once, not per login)

Delete `ensureSeeded(userId)` clones. Seed after migrate:

1. Club: Black Marlins Swimming Club Klaten, `coach_name` = Hardiyanto Wibowo (no user yet).
2. Superadmin user (Google email): `satriyopamungkas@gmail.com`.
3. Club admin user: `azkiyakhayladwrd04@gmail.com`.
4. Guardian users: `ratihsasminta@gmail.com` and `satriyopamungkas@gmail.com` (already superadmin).
5. Swimmers, both guardians linked to **each**:
   - Ken Athaya Nirwasita, `putri`, 2012-06-30
   - Luigi Banyu Pamungkas, `putra`, 2014-06-05
   - Kun Bumi Pamungkas, `putra`, 2014-06-05
6. Hardiyanto Wibowo: display name only. Login when someone with invite rights sends a `coach` invite.

Do not migrate existing per-login clone rows. Fresh database on aidev.

Users 2–4 must exist as Better Auth users on first boot so Google sign-in matches by email. Implementation: seed `user` rows with those emails (no password) **or** upsert `club_staff` / `guardians` on first Google login when email is in the seed allowlist. Prefer **allowlist upsert on first Google login** plus swimmer/club rows in SQL seed, so we do not fight Better Auth’s user table. Swimmer rows and guardian links use `user.id` once the adult has logged in once; until then, store intended emails on a `seed_emails` / pending-link table **or** create placeholder users. **Chosen: create Better Auth `user` rows for the three adult emails in the seed SQL** (id = text pk as today) and point `club_staff` / `guardians` at those ids. First Google login must link the OAuth account to the existing user by email (Better Auth account linking).

## Deploy

**Production (aidev)**

- Docker Compose or systemd: `postgres` (listen 127.0.0.1), `app` (Nitro `node-server`), `cloudflared`.
- `DATABASE_URL` to localhost. `BETTER_AUTH_URL` = public HTTPS origin.
- Migrate as a deploy step: `npm run db:migrate`. Remove migrate from `vite build`.
- Daily `pg_dump` cron.
- Google Cloud OAuth client redirect = `https://<origin>/api/auth/callback/google`.

**Local**

- PGLite default. Seed the same club + people (disposable).
- Production boot without `BETTER_AUTH_SECRET` or Google creds fails fast.

Domain name is env, not code.

## Errors

Indonesian copy, English log keys.

| Case | UI |
|---|---|
| Anonymous | Redirect `/login` |
| Signed in, no hat | “Akun belum diundang. Hubungi admin.” |
| Forbidden / missing row | 403, no names |
| Expired / used invite | “Undangan tidak berlaku.” |
| Swimmer tries Google | Reject; password path only |
| Guardian writes official result | 403 |
| DB down | Generic 500, log on aidev |

## Tests (v1)

No Playwright unless added later.

- Unit: KU calculation, time parse, permission helper (every hat × every action in the matrix).
- Integration (Postgres or PGLite): invite accept; guardian cannot read unlinked swimmer; stacked hats; swimmer writes own official result and cannot write another’s; `club_admin` invites `coach` and cannot invite `superadmin`; `saveResult` / practice writes scoped by `club_id`.

## Out of scope (v1)

Squads, iuran, KTA, relays, heat/lane UI, parent chat, X login, Vercel/Neon, Cloudflare Workers, athlete-required login, public registration.

## Cutover from current repo

Current product queries filter `user_id` as tenant and `ensureSeeded` copies Luigi/Kun/Ken to every login. Replace that isolation with `club_id` + the matrix. Fix `saveResult` so it authorizes the swimmer row in-club (the IDOR). Recompute PBs from times; stop seeding `is_pb = true` on every row.
