# Aidev deploy (no Docker)

Host: **aidev** (`146.190.87.122`). App: Node 22 + existing PostgreSQL 16. Public HTTPS: Caddy. Hostname: **https://bmsc.klaten.org**.

Do **not** use Docker Compose or Cloudflare Tunnel for this site. DNS is an A record to the VPS.

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
sudo bash scripts/bmsc.sh install
```

The install script will:

1. Generate `BETTER_AUTH_SECRET` and a Postgres password if `.env` is new
2. Ask for `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` if they are empty
3. Create Postgres role/database `bmsc`
4. `npm ci`, `npm run build`, `npm run db:migrate` (includes club seed)
5. systemd unit `bmsc` on `127.0.0.1:3000`
6. Caddy site `bmsc.klaten.org` → that port

Then open https://bmsc.klaten.org/login as `satriyopamungkas@gmail.com`.

## After code changes

On aidev:

```bash
cd /var/www/bmsc
sudo bash scripts/bmsc.sh update
```

That is `git pull --ff-only`, install, build, migrate, restart.

## Ops

```bash
sudo bash scripts/bmsc.sh status
sudo bash scripts/bmsc.sh backup                 # /var/backups/bmsc-YYYY-MM-DD.sql
sudo bash scripts/bmsc.sh backup /path/file.sql
sudo journalctl -u bmsc -e
```

## Google / env

`.env` lives in the app directory. `BETTER_AUTH_URL` must stay `https://bmsc.klaten.org` with no trailing slash.
