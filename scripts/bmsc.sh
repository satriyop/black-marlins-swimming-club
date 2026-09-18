#!/usr/bin/env bash
# Native aidev deploy (no Docker): existing PostgreSQL + systemd + Caddy.
# Never touches other Postgres apps (enter365, etc.).
#   sudo bash scripts/bmsc.sh dry-run                      # inspect only
#   sudo bash scripts/bmsc.sh install                      # first time
#   sudo bash scripts/bmsc.sh update                       # legacy in-place git pull + build
#   sudo bash scripts/bmsc.sh apply-release <tgz> <sha>    # CI artifact
#   sudo bash scripts/bmsc.sh rollback
#   sudo bash scripts/bmsc.sh backup
#   sudo bash scripts/bmsc.sh import-kiko                  # not part of deploy
#   sudo bash scripts/bmsc.sh sync-meets                    # run the Spectra meet-catalog sync once
#   sudo bash scripts/bmsc.sh install-sync-timer            # daily timer for sync-meets
#   sudo bash scripts/bmsc.sh status
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=release-assets.sh
source "${APP_DIR}/scripts/release-assets.sh"
APP_ROOT="${APP_ROOT:-$APP_DIR}"
APP_USER="${APP_USER:-bmsc}"
APP_HOST="${APP_HOST:-bmsc.klaten.org}"
APP_PORT="${APP_PORT:-3000}"
PG_ROLE="${PG_ROLE:-bmsc}"
PG_DB="${PG_DB:-bmsc}"
SERVICE="${SERVICE:-bmsc}"
SYNC_SERVICE="${SYNC_SERVICE:-bmsc-sync-meets}"
CADDY_SITE="/etc/caddy/sites/${APP_HOST}.caddy"
UNIT="/etc/systemd/system/${SERVICE}.service"
SYNC_UNIT="/etc/systemd/system/${SYNC_SERVICE}.service"
SYNC_TIMER_UNIT="/etc/systemd/system/${SYNC_SERVICE}.timer"
ENV_FILE="${APP_ROOT}/.env"
RELEASES_DIR="${APP_ROOT}/releases"
CURRENT_LINK="${APP_ROOT}/current"
PREVIOUS_LINK="${APP_ROOT}/previous"
LOCK_FILE="${LOCK_FILE:-/var/lock/bmsc-deploy.lock}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups}"
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
    if [[ -t 0 ]]; then
      read -r -p "GOOGLE_CLIENT_ID: " gid
      upsert_env GOOGLE_CLIENT_ID "$gid"
    else
      echo "INFO GOOGLE_CLIENT_ID empty (non-interactive — not prompting)"
    fi
  fi
  if [[ -z "$gsec" ]]; then
    if [[ -t 0 ]]; then
      read -r -s -p "GOOGLE_CLIENT_SECRET: " gsec
      echo
      upsert_env GOOGLE_CLIENT_SECRET "$gsec"
    else
      echo "INFO GOOGLE_CLIENT_SECRET empty (non-interactive — not prompting)"
    fi
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

runtime_dir() {
  if [[ -L "$CURRENT_LINK" || -d "$CURRENT_LINK" ]]; then
    readlink -f "$CURRENT_LINK"
  else
    echo "$APP_DIR"
  fi
}

acquire_lock() {
  mkdir -p "$(dirname "$LOCK_FILE")"
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    echo "BLOCKED  another bmsc deploy holds ${LOCK_FILE}" >&2
    exit 1
  fi
}

run_migrate() {
  local dir="$1"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  (cd "$dir" && npm run db:migrate)
}

cmd_backup() {
  need_root
  guard_pg_names
  local dest="${1:-${BACKUP_DIR}/bmsc-$(date +%Y%m%dT%H%M%SZ).sql}"
  mkdir -p "$(dirname "$dest")"
  sudo -u postgres pg_dump "$PG_DB" >"$dest"
  chmod 600 "$dest"
  echo "Wrote ${dest}"
}

require_backup() {
  local dest="${BACKUP_DIR}/bmsc-$(date +%Y%m%dT%H%M%SZ).sql"
  cmd_backup "$dest"
}

build_and_migrate() {
  cd "$APP_DIR"
  npm ci
  npm run build
  run_migrate "$APP_DIR"
}

verify_health() {
  local sha="${1:-}"
  local ok=1
  if ! systemctl is-active --quiet "$SERVICE"; then
    echo "FAIL  ${SERVICE} is not active"
    ok=0
  fi
  if ! curl -fsS -o /dev/null -m 10 "http://127.0.0.1:${APP_PORT}/login"; then
    echo "FAIL  http://127.0.0.1:${APP_PORT}/login"
    ok=0
  else
    echo "OK    http://127.0.0.1:${APP_PORT}/login"
  fi
  if ! curl -fsS -o /dev/null -m 15 "https://${APP_HOST}/login"; then
    echo "FAIL  https://${APP_HOST}/login"
    ok=0
  else
    echo "OK    https://${APP_HOST}/login"
  fi
  if [[ -n "$sha" ]]; then
    local live
    live="$(cat "$(runtime_dir)/RELEASE_SHA" 2>/dev/null || true)"
    if [[ "$live" != "$sha" ]]; then
      echo "FAIL  RELEASE_SHA want=${sha} have=${live:-none}"
      ok=0
    else
      echo "OK    RELEASE_SHA ${sha}"
    fi
  fi
  [[ "$ok" -eq 1 ]]
}

prune_releases() {
  [[ -d "$RELEASES_DIR" ]] || return 0
  local extra
  extra="$(ls -1dt "$RELEASES_DIR"/* 2>/dev/null | tail -n +$((KEEP_RELEASES + 1)) || true)"
  if [[ -n "$extra" ]]; then
    # shellcheck disable=SC2086
    rm -rf $extra
  fi
}

write_unit_for() {
  local run_dir="$1"
  cat >"$UNIT" <<EOF
[Unit]
Description=Black Marlins Swimming Club
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${run_dir}
EnvironmentFile=${ENV_FILE}
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=${APP_PORT}
ExecStart=/usr/bin/node ${run_dir}/.output/server/index.mjs
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
  chown -R "${APP_USER}:${APP_USER}" "$run_dir"
  chmod 750 "$APP_ROOT"
  systemctl daemon-reload
  systemctl enable "$SERVICE"
}

write_unit() {
  write_unit_for "$(runtime_dir)"
}

write_caddy() {
  mkdir -p /etc/caddy/sites
  cat >"$CADDY_SITE" <<EOF
${APP_HOST} {
	encode gzip zstd
	@service_worker path /sw.js
	header @service_worker {
		Cache-Control "no-cache, no-store, must-revalidate"
		Service-Worker-Allowed "/"
	}
	@immutable_assets path /assets/*
	header @immutable_assets Cache-Control "public, max-age=31536000, immutable"
	reverse_proxy 127.0.0.1:${APP_PORT}
}
EOF
  caddy validate --config /etc/caddy/Caddyfile
  systemctl reload caddy
}

write_sync_timer() {
  # Runs `bmsc.sh sync-meets` itself, which resolves runtime_dir() (the
  # `current` symlink) fresh on every fire -- so this unit never needs to be
  # rewritten on deploy, unlike bmsc.service's WorkingDirectory.
  cat >"$SYNC_UNIT" <<EOF
[Unit]
Description=Black Marlins Swimming Club - Spectra meet catalog sync
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=oneshot
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_ROOT}
ExecStart=/usr/bin/env bash ${APP_ROOT}/scripts/bmsc.sh sync-meets
EOF
  cat >"$SYNC_TIMER_UNIT" <<EOF
[Unit]
Description=Daily Spectra meet catalog sync for Black Marlins Swimming Club

[Timer]
# Run shortly after first installation so a fresh production database does
# not remain empty until the next calendar tick. Calendar time is explicitly
# WIB because aidev itself runs in UTC.
OnActiveSec=2min
OnCalendar=*-*-* 03:15:00 Asia/Jakarta
RandomizedDelaySec=600
Persistent=true

[Install]
WantedBy=timers.target
EOF
  systemctl daemon-reload
  systemctl enable --now "${SYNC_SERVICE}.timer"
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
  echo "WOULD npm ci && npm run build && npm run db:migrate (schema only) && npm run db:seed"
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
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  (cd "$APP_DIR" && npm run db:seed)
  write_unit
  write_caddy
  local gid
  gid="$(env_get GOOGLE_CLIENT_ID)"
  if [[ -z "$gid" ]]; then
    echo "Google OAuth is not set. Wrote unit and Caddy but did not start ${SERVICE}."
    echo "Put GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in ${ENV_FILE}, then:"
    echo "  systemctl start ${SERVICE}"
    echo "Public site (after cert): https://${APP_HOST}/login"
    return 0
  fi
  systemctl restart "$SERVICE"
  sleep 2
  verify_health || true
  echo
  echo "Local:  curl -sI http://127.0.0.1:${APP_PORT}/login"
  echo "Public: https://${APP_HOST}/login"
  echo "Google redirect must be https://${APP_HOST}/api/auth/callback/google"
}

cmd_update() {
  need_root
  guard_pg_names
  acquire_lock
  echo "==> update ${APP_DIR} (legacy in-place build; prefer apply-release)"
  require_backup
  cd "$APP_DIR"
  git pull --ff-only
  build_and_migrate
  chown -R "${APP_USER}:${APP_USER}" "$APP_DIR"
  write_unit
  systemctl restart "$SERVICE"
  sleep 2
  if ! verify_health; then
    echo "FAIL  health check after update. Restore the database dump in ${BACKUP_DIR} if schema changed."
    exit 1
  fi
  echo "update ok"
}

cmd_apply_release() {
  local tarball="${1:-}" sha="${2:-}"
  need_root
  guard_pg_names
  acquire_lock
  if [[ -z "$tarball" || -z "$sha" || ! -f "$tarball" ]]; then
    echo "Usage: sudo bash $0 apply-release <tarball> <sha>" >&2
    exit 1
  fi
  echo "==> apply-release ${sha}"
  require_backup
  mkdir -p "$RELEASES_DIR"
  local dest="${RELEASES_DIR}/${sha}"
  rm -rf "$dest"
  mkdir -p "$dest"
  tar -xzf "$tarball" -C "$dest"
  record_release_assets "$dest"
  preserve_retained_client_assets "$RELEASES_DIR" "$dest"
  printf '%s\n' "$sha" >"${dest}/RELEASE_SHA"
  (cd "$dest" && npm ci --omit=dev)
  run_migrate "$dest"
  if [[ -e "$CURRENT_LINK" ]]; then
    ln -sfn "$(readlink -f "$CURRENT_LINK")" "$PREVIOUS_LINK"
  fi
  ln -sfn "$dest" "$CURRENT_LINK"
  write_unit_for "$(readlink -f "$CURRENT_LINK")"
  systemctl restart "$SERVICE"
  sleep 2
  if ! verify_health "$sha"; then
    echo "FAIL  health check — restoring previous application release"
    echo "NOTE  schema migrations are not rolled back; use the dump in ${BACKUP_DIR} if needed"
    if [[ -L "$PREVIOUS_LINK" ]]; then
      cmd_rollback_unlocked
    fi
    exit 1
  fi
  prune_releases
  echo "release ${sha} is live"
}

cmd_rollback_unlocked() {
  if [[ ! -L "$PREVIOUS_LINK" ]]; then
    echo "no previous release at ${PREVIOUS_LINK}" >&2
    return 1
  fi
  local prev
  prev="$(readlink -f "$PREVIOUS_LINK")"
  ln -sfn "$prev" "$CURRENT_LINK"
  write_unit_for "$prev"
  systemctl restart "$SERVICE"
  sleep 2
  verify_health "$(cat "${prev}/RELEASE_SHA" 2>/dev/null || true)" || true
  echo "rolled back to ${prev}"
}

cmd_rollback() {
  need_root
  acquire_lock
  cmd_rollback_unlocked
}

cmd_import_kiko() {
  need_root
  guard_pg_names
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  (cd "$(runtime_dir)" && npm run db:import-kiko)
}

cmd_sync_meets() {
  # No need_root: this also runs unattended as ${APP_USER} from the
  # bmsc-sync-meets.timer unit (see install-sync-timer), not just manually
  # via sudo. It only reads ENV_FILE (world-readable to its own group after
  # `install`'s chown) and writes rows through DATABASE_URL -- no root-only
  # filesystem or systemd changes like apply-release/rollback need.
  guard_pg_names
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  (cd "$(runtime_dir)" && npm run db:sync-spectra-meets)
}

cmd_install_sync_timer() {
  need_root
  write_sync_timer
  echo "installed ${SYNC_SERVICE}.timer (first run after 2m; daily, 03:15 WIB + up to 10m jitter)"
  systemctl list-timers "${SYNC_SERVICE}.timer" --no-pager || true
}

cmd_status() {
  systemctl --no-pager --full status "$SERVICE" || true
  echo
  echo "current:  $(readlink -f "$CURRENT_LINK" 2>/dev/null || echo "(git tree ${APP_DIR})")"
  echo "sha:      $(cat "$(runtime_dir)/RELEASE_SHA" 2>/dev/null || echo none)"
  echo
  curl -sI "http://127.0.0.1:${APP_PORT}/login" | head -n 15 || true
  echo
  curl -sI "https://${APP_HOST}/login" | head -n 15 || true
}

usage() {
  echo "Usage: sudo bash $0 {dry-run|install|update|apply-release|rollback|backup|import-kiko|sync-meets|install-sync-timer|status}"
  exit 1
}

case "${1:-}" in
  dry-run) cmd_dry_run ;;
  install) cmd_install ;;
  update) cmd_update ;;
  apply-release) cmd_apply_release "${2:-}" "${3:-}" ;;
  rollback) cmd_rollback ;;
  backup) cmd_backup "${2:-}" ;;
  import-kiko) cmd_import_kiko ;;
  sync-meets) cmd_sync_meets ;;
  install-sync-timer) cmd_install_sync_timer ;;
  status) cmd_status ;;
  *) usage ;;
esac
