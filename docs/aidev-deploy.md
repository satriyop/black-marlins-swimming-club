# Aidev deploy (no Docker)

Host: **aidev** (`146.190.87.122`). App: Node 22 + existing PostgreSQL 16. Public HTTPS: Caddy. Hostname: **https://bmsc.klaten.org**.

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
| `TS_OAUTH_CLIENT_ID` | Same Tailscale OAuth client as kiko-web (`tag:ci`) |
| `TS_OAUTH_SECRET` | Same Tailscale OAuth secret as kiko-web |

GitHub-hosted runners join the tailnet, then SSH to `aidev` over Tailscale. Do not point `BMSC_DEPLOY_HOST` at the public VPS IP.

On aidev, the matching public key is in `/root/.ssh/authorized_keys` (comment `bmsc-deploy@github-actions`). One SSH session per deploy (fail2ban).

Create a GitHub **Environment** named `production` (Settings → Environments). Restrict the deploy job to that environment. Required reviewers are optional (this repo is often a solo merge).

### Branch protection

Private repos on GitHub Free cannot use repository rulesets. After the first green `ci` run, protect `main` in Settings → Branches:

- Require status checks to pass before merging
- Require the check named **`ci`**
- Do not require extra reviewers if you merge your own PRs

Until that is set, `main` can still be pushed directly; deploy still waits for the `ci` job in the same workflow.

## First time

On your laptop, create the Google OAuth web client:

- Origin: `https://bmsc.klaten.org`
- Redirect: `https://bmsc.klaten.org/api/auth/callback/google`

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

Never restore into `enter365`.

## Ops

```bash
sudo bash scripts/bmsc.sh status
sudo bash scripts/bmsc.sh backup                 # /var/backups/bmsc-<utc>.sql
sudo bash scripts/bmsc.sh backup /path/file.sql
sudo journalctl -u bmsc -e
```

## Google / env

`.env` lives in `/var/www/bmsc/.env` (not inside a release). `BETTER_AUTH_URL` must stay `https://bmsc.klaten.org` with no trailing slash.
