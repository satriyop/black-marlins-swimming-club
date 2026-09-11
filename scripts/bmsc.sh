#!/usr/bin/env bash
# Native aidev deploy (no Docker): existing PostgreSQL + systemd + Caddy.
#   sudo bash scripts/bmsc.sh install   # first time
#   sudo bash scripts/bmsc.sh update    # after git pull / code change
#   sudo bash scripts/bmsc.sh backup
#   sudo bash scripts/bmsc.sh status
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_USER="${APP_USER:-bmsc}"
APP_HOST="${APP_HOST:-bmsc.klaten.org}"
APP_PORT="${APP_PORT:-3000}"
PG_ROLE="${PG_ROLE:-bmsc}"
PG_DB="${PG_DB:-bmsc}"
SERVICE="${SERVICE:-bmsc}"
CADDY_SITE="/etc/caddy/sites/${APP_HOST}.caddy"
UNIT="/etc/systemd/system/${SERVICE}.service"
ENV_FILE="${APP_DIR}/.env"

need_root() {
  if [[ "$(id -u)" -ne 0 ]]; then
    echo "Run as root on aidev: sudo bash $0 $*" >&2
    exit 1
  fi
}

upsert_env() {
  local key="$1" val="$2"
  python3 - "$ENV_FILE" "$key" "$val" <<'PY'
from pathlib import Path
import re, sys
path, key, val = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
text = path.read_text() if path.exists() else ""
line = f"{key}={val}"
pat = re.compile(rf"^{re.escape(key)}=.*$", re.M)
if pat.search(text):
    text = pat.sub(line, text)
else:
    text = (text.rstrip() + "\n" if text else "") + line + "\n"
path.write_text(text)
PY
}

env_get() {
  local key="$1"
  [[ -f "$ENV_FILE" ]] || return 0
  python3 - "$ENV_FILE" "$key" <<'PY'
from pathlib import Path
import sys
text = Path(sys.argv[1]).read_text()
key = sys.argv[2]
for line in text.splitlines():
    if line.startswith(key + "="):
        print(line.split("=", 1)[1], end="")
        break
PY
}

ensure_env() {
  if [[ ! -f "$ENV_FILE" ]]; then
    cp "$APP_DIR/.env.example" "$ENV_FILE"
  fi
  local secret pg_pass
  secret="$(env_get BETTER_AUTH_SECRET)"
  if [[ -z "$secret" || "$secret" == "generate-a-long-random-string" ]]; then
    secret="$(openssl rand -hex 32)"
    upsert_env BETTER_AUTH_SECRET "$secret"
    echo "Wrote BETTER_AUTH_SECRET"
  fi
  pg_pass="$(env_get BMSC_PG_PASSWORD)"
  if [[ -z "$pg_pass" ]]; then
    # reuse password already in DATABASE_URL if present
    local url
    url="$(env_get DATABASE_URL)"
    if [[ "$url" =~ postgres://[^:]+:([^@]+)@ ]]; then
      pg_pass="${BASH_REMATCH[1]}"
    else
      pg_pass="$(openssl rand -hex 16)"
    fi
    upsert_env BMSC_PG_PASSWORD "$pg_pass"
  fi
  upsert_env DATABASE_URL "postgres://${PG_ROLE}:${pg_pass}@127.0.0.1:5432/${PG_DB}"
  upsert_env BETTER_AUTH_URL "https://${APP_HOST}"
  upsert_env VITE_AUTH_ENABLED "true"
  upsert_env NODE_ENV "production"
  upsert_env HOST "127.0.0.1"
  upsert_env PORT "$APP_PORT"

  local gid gsec
  gid="$(env_get GOOGLE_CLIENT_ID)"
  gsec="$(env_get GOOGLE_CLIENT_SECRET)"
  if [[ -z "$gid" ]]; then
    read -r -p "GOOGLE_CLIENT_ID: " gid
    upsert_env GOOGLE_CLIENT_ID "$gid"
  fi
  if [[ -z "$gsec" ]]; then
    read -r -s -p "GOOGLE_CLIENT_SECRET: " gsec
    echo
    upsert_env GOOGLE_CLIENT_SECRET "$gsec"
  fi
  chmod 640 "$ENV_FILE"
}

ensure_postgres() {
  command -v psql >/dev/null
  local pg_pass
  pg_pass="$(env_get BMSC_PG_PASSWORD)"
  if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${PG_ROLE}'" | grep -q 1; then
    sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE USER ${PG_ROLE} WITH PASSWORD '${pg_pass}';"
    echo "Created Postgres role ${PG_ROLE}"
  else
    sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER USER ${PG_ROLE} WITH PASSWORD '${pg_pass}';"
  fi
  if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${PG_DB}'" | grep -q 1; then
    sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${PG_DB} OWNER ${PG_ROLE};"
    echo "Created database ${PG_DB}"
  fi
}

ensure_user() {
  if ! id -u "$APP_USER" >/dev/null 2>&1; then
    useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
    echo "Created system user ${APP_USER}"
  fi
}

build_and_migrate() {
  cd "$APP_DIR"
  npm ci
  npm run build
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  npm run db:migrate
}

write_unit() {
  cat >"$UNIT" <<EOF
[Unit]
Description=Black Marlins Swimming Club
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=${APP_PORT}
ExecStart=/usr/bin/node ${APP_DIR}/.output/server/index.mjs
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
  chown -R "${APP_USER}:${APP_USER}" "$APP_DIR"
  # root must still be able to git pull / edit
  chmod 750 "$APP_DIR"
  systemctl daemon-reload
  systemctl enable "$SERVICE"
}

write_caddy() {
  mkdir -p /etc/caddy/sites
  cat >"$CADDY_SITE" <<EOF
${APP_HOST} {
	encode gzip zstd
	reverse_proxy 127.0.0.1:${APP_PORT}
}
EOF
  caddy validate --config /etc/caddy/Caddyfile
  systemctl reload caddy
}

cmd_install() {
  need_root
  echo "==> install ${APP_HOST} from ${APP_DIR}"
  ensure_user
  ensure_env
  ensure_postgres
  build_and_migrate
  write_unit
  write_caddy
  systemctl restart "$SERVICE"
  sleep 1
  systemctl --no-pager --full status "$SERVICE" || true
  echo
  echo "Local:  curl -sI http://127.0.0.1:${APP_PORT}/login"
  echo "Public: https://${APP_HOST}/login"
  echo "Google redirect must be https://${APP_HOST}/api/auth/callback/google"
}

cmd_update() {
  need_root
  echo "==> update ${APP_DIR}"
  cd "$APP_DIR"
  git pull --ff-only
  build_and_migrate
  chown -R "${APP_USER}:${APP_USER}" "$APP_DIR"
  systemctl restart "$SERVICE"
  systemctl --no-pager --full status "$SERVICE" || true
}

cmd_backup() {
  need_root
  local dest="${1:-/var/backups/bmsc-$(date +%F).sql}"
  mkdir -p "$(dirname "$dest")"
  sudo -u postgres pg_dump "$PG_DB" >"$dest"
  chmod 600 "$dest"
  echo "Wrote ${dest}"
}

cmd_status() {
  systemctl --no-pager --full status "$SERVICE" || true
  echo
  curl -sI "http://127.0.0.1:${APP_PORT}/login" | head -n 15 || true
  echo
  curl -sI "https://${APP_HOST}/login" | head -n 15 || true
}

usage() {
  echo "Usage: sudo bash $0 {install|update|backup|status}"
  exit 1
}

case "${1:-}" in
  install) cmd_install ;;
  update) cmd_update ;;
  backup) cmd_backup "${2:-}" ;;
  status) cmd_status ;;
  *) usage ;;
esac
