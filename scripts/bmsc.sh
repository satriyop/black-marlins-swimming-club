#!/usr/bin/env bash
# Native aidev deploy (no Docker): existing PostgreSQL + systemd + Caddy.
# Never touches other Postgres apps (enter365, etc.).
#   sudo bash scripts/bmsc.sh dry-run   # inspect only
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
DRY_RUN=0
BLOCKED=0
PROTECTED_PG="enter365 postgres pg_database_owner"

need_root() {
  if [[ "$(id -u)" -ne 0 ]]; then
    echo "Run as root on aidev: sudo bash $0 $*" >&2
    exit 1
  fi
}

guard_pg_names() {
  local name
  for name in $PROTECTED_PG; do
    if [[ "$PG_ROLE" == "$name" || "$PG_DB" == "$name" ]]; then
      echo "Refusing to use protected Postgres name: ${name}" >&2
      exit 1
    fi
  done
}

pg_has_role() {
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${1}'" | grep -q 1
}

pg_has_db() {
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${1}'" | grep -q 1
}

port_in_use() {
  ss -lnt | awk '{print $4}' | grep -Eq "[:.]${APP_PORT}$"
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
  guard_pg_names
  local pg_pass
  pg_pass="$(env_get BMSC_PG_PASSWORD)"
  if pg_has_role "$PG_ROLE"; then
    echo "Postgres role ${PG_ROLE} already exists — will not ALTER it (protects other apps)."
  else
    sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE USER ${PG_ROLE} WITH PASSWORD '${pg_pass}';"
    echo "Created Postgres role ${PG_ROLE}"
  fi
  if pg_has_db "$PG_DB"; then
    echo "Postgres database ${PG_DB} already exists — will not DROP or reassign it."
  else
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

cmd_dry_run() {
  need_root
  guard_pg_names
  echo "==> dry-run ${APP_HOST} (no writes)"
  echo "App dir:     ${APP_DIR}"
  echo "Linux user:  ${APP_USER}"
  echo "Service:     ${SERVICE}.service → ${UNIT}"
  echo "Caddy site:  ${CADDY_SITE}"
  echo "Listen:      127.0.0.1:${APP_PORT}"
  echo "Public:      https://${APP_HOST}"
  echo

  echo "-- host --"
  command -v node >/dev/null && echo "OK  node $(node -v)" || { echo "BLOCKED  node missing"; BLOCKED=1; }
  command -v npm >/dev/null && echo "OK  npm $(npm -v)" || { echo "BLOCKED  npm missing"; BLOCKED=1; }
  command -v psql >/dev/null && echo "OK  psql present" || { echo "BLOCKED  psql missing"; BLOCKED=1; }
  command -v caddy >/dev/null && echo "OK  caddy present" || { echo "BLOCKED  caddy missing"; BLOCKED=1; }
  command -v git >/dev/null && echo "OK  git present" || { echo "BLOCKED  git missing"; BLOCKED=1; }
  if systemctl is-active --quiet fail2ban 2>/dev/null || systemctl is-active --quiet fail2ban.service 2>/dev/null; then
    echo "OK  fail2ban active (SSH: one session, no auth hammering)"
  else
    echo "INFO fail2ban not active"
  fi
  echo

  echo "-- postgres (read-only) --"
  if pg_has_db enter365; then
    echo "OK  enter365 database present — this script will not DROP/ALTER/dump it"
  else
    echo "INFO enter365 database not found"
  fi
  if pg_has_role enter365; then
    echo "OK  enter365 role present — this script will not ALTER it"
  fi
  echo "OK  will only CREATE role/database named '${PG_ROLE}' / '${PG_DB}' if missing"
  echo "OK  will never ALTER an existing role password (including ${PG_ROLE} if it already exists)"
  if pg_has_role "$PG_ROLE"; then
    echo "WOULD reuse existing role ${PG_ROLE} (no ALTER USER)"
  else
    echo "WOULD CREATE USER ${PG_ROLE} (new role only)"
  fi
  if pg_has_db "$PG_DB"; then
    echo "WOULD reuse existing database ${PG_DB} (no DROP)"
  else
    echo "WOULD CREATE DATABASE ${PG_DB} OWNER ${PG_ROLE}"
  fi
  echo

  echo "-- port ${APP_PORT} --"
  if port_in_use; then
    echo "BLOCKED  127.0.0.1:${APP_PORT} already has a listener — pick another PORT"
    ss -lntp | grep ":${APP_PORT}" || true
    BLOCKED=1
  else
    echo "OK  port ${APP_PORT} is free"
  fi
  echo

  echo "-- linux user --"
  if id -u "$APP_USER" >/dev/null 2>&1; then
    echo "WOULD reuse system user ${APP_USER}"
  else
    echo "WOULD useradd --system ${APP_USER}"
  fi
  echo

  echo "-- systemd --"
  if [[ -f "$UNIT" ]]; then
    echo "WOULD overwrite ${UNIT} (bmsc unit only)"
  else
    echo "WOULD write ${UNIT}"
  fi
  echo

  echo "-- caddy --"
  if [[ ! -d /etc/caddy/sites ]]; then
    echo "BLOCKED  /etc/caddy/sites missing — enter365 import path unexpected"
    BLOCKED=1
  else
    echo "OK  /etc/caddy/sites exists (enter365 sites left untouched)"
  fi
  if grep -q "import /etc/caddy/sites" /etc/caddy/Caddyfile 2>/dev/null; then
    echo "OK  Caddyfile imports /etc/caddy/sites/*.caddy"
  else
    echo "BLOCKED  Caddyfile does not import /etc/caddy/sites — will not reload"
    BLOCKED=1
  fi
  if [[ -f "$CADDY_SITE" ]]; then
    echo "WOULD overwrite ${CADDY_SITE} only (not enter365/lms files)"
  else
    echo "WOULD create ${CADDY_SITE} then caddy validate && reload"
  fi
  echo "OK  will not edit /etc/caddy/Caddyfile or other site files"
  echo

  echo "-- app dir --"
  if [[ -f "${APP_DIR}/package.json" ]]; then
    echo "OK  ${APP_DIR} looks like the bmsc repo"
  else
    echo "BLOCKED  ${APP_DIR} has no package.json — clone the repo first"
    BLOCKED=1
  fi
  if [[ -f "$ENV_FILE" ]]; then
    echo "WOULD keep existing ${ENV_FILE} and fill missing keys only"
  else
    echo "WOULD copy .env.example → .env and generate secrets"
  fi
  local gid
  gid="$(env_get GOOGLE_CLIENT_ID || true)"
  if [[ -z "${gid:-}" ]]; then
    echo "INFO Google client id not in .env yet — install will prompt (not during dry-run)"
  else
    echo "OK  GOOGLE_CLIENT_ID already set"
  fi
  echo "WOULD npm ci && npm run build && npm run db:migrate (bmsc database only)"
  echo "WOULD systemctl enable --now ${SERVICE}"
  echo

  if [[ "$BLOCKED" -ne 0 ]]; then
    echo "RESULT: not safe to install. Fix BLOCKED items first."
    exit 1
  fi
  echo "RESULT: dry-run clean. Other Postgres apps (enter365) would be left alone."
  echo "Next: sudo bash $0 install"
}

cmd_install() {
  need_root
  guard_pg_names
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
  guard_pg_names
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
  guard_pg_names
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
  echo "Usage: sudo bash $0 {dry-run|install|update|backup|status}"
  exit 1
}

case "${1:-}" in
  dry-run) cmd_dry_run ;;
  install) cmd_install ;;
  update) cmd_update ;;
  backup) cmd_backup "${2:-}" ;;
  status) cmd_status ;;
  *) usage ;;
esac
