# Aidev deploy (no Docker)

Host: **aidev** (see `~/.ssh/config` for the address — a shared VPS, not dedicated to this app). App: Node 22 + existing PostgreSQL 16. Public HTTPS: Caddy. Hostname: **https://bmsc.klaten.org**.

Do **not** use Docker Compose or Cloudflare Tunnel for this site. DNS is an A record to the VPS.

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`):

1. **CI** on every pull request and every push to `main`: `npm ci`, lint, typecheck, tests, Postgres schema migrate + seed (no kiko import), production build, HTTP smoke, Playwright login smoke.
2. **Deploy** on push to `main` after CI: uploads the tested tarball into `/var/www/bmsc/releases/<sha>`, switches `current`, migrates schema only, restarts systemd, then checks `/login` on localhost and HTTPS. Failed health checks restore the previous **application** release. Database rollback is a separate restore of the dump taken at deploy start.

`db:migrate` applies SQL only. Seed accounts with `npm run db:seed`. Import race times with `npm run db:import-kiko` (or `sudo bash scripts/bmsc.sh import-kiko`) — not during deploy.

### GitHub setup (once)

Repo secrets:

| Secret | Purpose |
|--------|---------|
| `BMSC_DEPLOY_SSH_KEY` | Private ed25519 for **root@aidev** (not the Mini `AIDEV_SSH_PRIVATE_KEY`) |
| `BMSC_DEPLOY_HOST` | Tailscale name, default `aidev` (public `:22` is not reachable from GitHub-hosted runners) |
| `BMSC_DEPLOY_USER` | Optional, default `root` |
| `TS_OAUTH_CLIENT_ID` | Shared Tailscale OAuth client already used for CI on this tailnet (`tag:ci`) |
| `TS_OAUTH_SECRET` | Matching secret for that same OAuth client |

GitHub-hosted runners join the tailnet, then SSH to `aidev` over Tailscale. Do not point `BMSC_DEPLOY_HOST` at the public VPS IP.

On aidev, the matching public key is in `/root/.ssh/authorized_keys` (comment `bmsc-deploy@github-actions`). One SSH session per deploy (fail2ban).

Create a GitHub **Environment** named `production` (Settings → Environments). Restrict the deploy job to that environment. Required reviewers are optional (this repo is often a solo merge).

### Branch protection

Private repos on GitHub Free cannot use repository rulesets. After the first green `ci` run, protect `main` in Settings → Branches:

- Require status checks to pass before merging
- Require the check named **`ci`**
- Do not require extra reviewers if you merge your own PRs

Until that is set, `main` can still be pushed directly; deploy still waits for the `ci` job in the same workflow.

## Manual deploy (GitHub Actions unavailable)

**Preferred path is always**: merge to `main` and let Actions build, test, and deploy. Use this section only when Actions cannot run — e.g. a billing/spending-limit block on the repo's GitHub account (`ci` job fails immediately with "recent account payments have failed"), a GitHub outage, or another reason Actions itself is unavailable, not as a routine way to skip CI.

Agents: if you hit that situation, use `scripts/deploy-manual.sh` — do not hand-roll `tar`/`ssh` commands. The script exists specifically because a hand-rolled version broke a real deploy (see the tar gotcha below); using it keeps that fixed and keeps a manual deploy identical in shape to what CI would have done.

```bash
npm run deploy:manual                       # full local CI parity: lint, typecheck, unit tests, build, smoke, e2e
npm run deploy:manual -- --skip-e2e         # skip Playwright (faster; less coverage)
npm run deploy:manual -- --skip-checks      # skip lint/typecheck/test/smoke/e2e entirely — only if you already ran them
```

What it does, matching the GitHub Actions `ci` + `deploy` jobs:

1. Refuses to run unless you're on `main`, the working tree is clean, and local `main` matches `origin/main` (it deploys exactly what's merged, never local uncommitted state).
2. Runs `npm ci`, lint, typecheck, `npm test`, `npm run build`, `npm run smoke`, and (unless `--skip-e2e`) the Playwright suite — against `DATABASE_URL` (default `postgres://bmsc:bmsc@127.0.0.1:5432/bmsc`), which must be a **local/test** Postgres, never aidev's.
3. Packages `.output`, `package.json`, `package-lock.json`, `migrations`, `scripts`, `data` into `bmsc-release.tgz`.
4. Ships it to `aidev` over SSH (host alias `aidev`, root — see `~/.ssh/config`; this machine must already be on the tailnet or otherwise able to reach it) and runs the same `sudo bash scripts/bmsc.sh apply-release <tarball> <sha>` the CI `deploy` job runs.
5. Curls `https://bmsc.klaten.org/login` to confirm it's live.

**macOS tar gotcha** (why this script exists instead of a one-liner): macOS's `tar` embeds AppleDouble metadata files (`._0001_auth.sql`, `._<anything>`) for extended attributes like `com.apple.provenance`. The remote migrate step runs every `*.sql` file it finds in `migrations/`, so one of these junk files reaching the server makes `db:migrate` fail with `invalid message format` (Postgres protocol error, code `08P01`) partway through. This happened for real deploying PR #75. It's safe — `apply-release` only swaps the `current` symlink *after* migrations succeed, so a failed migrate leaves production on the old release untouched — but it still means Postgres was fed one CI cycle's worth of garbage input for nothing. The script builds with `COPYFILE_DISABLE=1 tar --no-xattrs` and verifies the tarball has no `._*` entries before shipping it, so this can't recur. If you ever build a release tarball by hand on macOS, use those same flags.

## First time

On your laptop, create the Google OAuth web client:

- Origin: `https://bmsc.klaten.org`
- Redirect: `https://bmsc.klaten.org/api/auth/callback/google`

Google's download for this is a `client_secret_*.json` file. Save it outside the repo (e.g. `~/.config/google-oauth/`), not in the project root — only the `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` values belong in `.env`. `client_secret*.json` is gitignored as a backstop, but don't rely on that alone.

On aidev:

```bash
sudo mkdir -p /var/www/bmsc
sudo chown "$USER":"$USER" /var/www/bmsc
cd /var/www/bmsc
git clone git@github.com:satriyop/black-marlins-swimming-club.git .
sudo bash scripts/bmsc.sh dry-run    # inspect only; does not write
sudo bash scripts/bmsc.sh install
```

The install script will:

1. Generate `BETTER_AUTH_SECRET` and a Postgres password if `.env` is new
2. Ask for `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` if they are empty
3. Create Postgres role/database `bmsc`
4. `npm ci`, `npm run build`, `npm run db:migrate` (schema), `npm run db:seed`
5. systemd unit `bmsc` on `127.0.0.1:3000`
6. Caddy site `bmsc.klaten.org` → that port

Then open https://bmsc.klaten.org/login as `satriyopamungkas@gmail.com`.

Import kiko times once (or when CSV changes), not on every deploy:

```bash
sudo bash scripts/bmsc.sh import-kiko
```

## After code changes

Preferred: merge/push `main` and let Actions deploy the artifact.

Legacy in-place (lock + backup + health, still builds on the server):

```bash
cd /var/www/bmsc
sudo bash scripts/bmsc.sh update
```

Release layout after the first CI deploy:

```
/var/www/bmsc/.env
/var/www/bmsc/current     → releases/<sha>
/var/www/bmsc/previous    → releases/<previous-sha>
/var/www/bmsc/releases/<sha>/
```

Rollback **application** only (schema stays):

```bash
sudo bash scripts/bmsc.sh rollback
```

Restore a database dump (separate recovery):

```bash
sudo -u postgres psql bmsc < /var/backups/bmsc-YYYYMMDDTHHMMSSZ.sql
```

This is a shared host running other applications' databases too — never restore into one of those. Check `sudo -u postgres psql -l` first if unsure which database is `bmsc`.

## Ops

```bash
sudo bash scripts/bmsc.sh status
sudo bash scripts/bmsc.sh backup                 # /var/backups/bmsc-<utc>.sql
sudo bash scripts/bmsc.sh backup /path/file.sql
sudo journalctl -u bmsc -e
```

## Google / env

`.env` lives in `/var/www/bmsc/.env` (not inside a release). `BETTER_AUTH_URL` must stay `https://bmsc.klaten.org` with no trailing slash.
