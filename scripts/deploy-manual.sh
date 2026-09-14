#!/usr/bin/env bash
# Manual fallback deploy to aidev, for when GitHub Actions cannot run
# (billing/quota block, outage, or an intentional bypass of the CI queue).
#
# This runs the same local checks CI runs, packages the release the same
# way, and calls the same `scripts/bmsc.sh apply-release` used by the
# GitHub Actions `deploy` job — so a manual run and a CI run produce an
# identical release layout on the server.
#
# Usage:
#   DATABASE_URL=postgres://bmsc:bmsc@127.0.0.1:5432/bmsc scripts/deploy-manual.sh
#   scripts/deploy-manual.sh --skip-e2e   # skip the Playwright suite (faster, less coverage)
#   scripts/deploy-manual.sh --skip-checks # skip lint/typecheck/test/e2e entirely (already verified)
#
# Requires:
#   - Clean working tree on `main`, up to date with origin/main
#   - SSH access to a host alias named `aidev` (root) — see ~/.ssh/config
#   - A local/test Postgres for the pre-deploy checks (DATABASE_URL below
#     must NEVER point at production — this script does not touch aidev's
#     database except through the remote apply-release migration step)
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

SKIP_E2E=0
SKIP_CHECKS=0
for arg in "$@"; do
  case "$arg" in
    --skip-e2e) SKIP_E2E=1 ;;
    --skip-checks) SKIP_CHECKS=1 ;;
    *) echo "Unknown flag: $arg" >&2; exit 1 ;;
  esac
done

export DATABASE_URL="${DATABASE_URL:-postgres://bmsc:bmsc@127.0.0.1:5432/bmsc}"
export BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-ci-smoke-secret-not-for-prod}"
export BETTER_AUTH_URL="${BETTER_AUTH_URL:-http://127.0.0.1:3010}"
export VITE_AUTH_ENABLED="${VITE_AUTH_ENABLED:-true}"
export GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-ci.apps.googleusercontent.com}"
export GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET:-ci-not-real}"

echo "==> preflight: branch, sync, working tree"
branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$branch" != "main" ]]; then
  echo "Refusing to deploy from branch '$branch' — checkout main first." >&2
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Refusing to deploy with a dirty working tree — commit or stash first." >&2
  exit 1
fi
git fetch origin main -q
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
  echo "Local main is not in sync with origin/main — pull or push first." >&2
  exit 1
fi
SHA="$(git rev-parse HEAD)"
echo "    deploying $SHA"

if [[ "$SKIP_CHECKS" -eq 0 ]]; then
  echo "==> npm ci"
  npm ci
  echo "==> lint"
  npm run lint
  echo "==> typecheck"
  npm run typecheck
  echo "==> unit tests"
  npm test
fi

echo "==> build"
npm run build

if [[ "$SKIP_CHECKS" -eq 0 ]]; then
  echo "==> smoke"
  npm run smoke
  if [[ "$SKIP_E2E" -eq 0 ]]; then
    echo "==> e2e"
    npx playwright install --with-deps chromium
    npm run test:e2e
  else
    echo "    (skipped: --skip-e2e)"
  fi
else
  echo "==> smoke/e2e skipped: --skip-checks"
fi

echo "==> packaging release tarball"
# IMPORTANT: macOS tar embeds AppleDouble metadata files (._0001_auth.sql,
# LIBARCHIVE.xattr.com.apple.provenance, ...) unless disabled. The remote
# migrate step tries to run every *.sql file it finds and will fail with
# "invalid message format" on one of these junk files if you skip this.
# (Discovered the hard way deploying PR #75 — do not remove these flags.)
rm -f bmsc-release.tgz
COPYFILE_DISABLE=1 tar --no-xattrs -czf bmsc-release.tgz \
  .output \
  package.json \
  package-lock.json \
  migrations \
  scripts \
  data
if tar -tzf bmsc-release.tgz | grep -q '^\._'; then
  echo "Refusing to deploy: tarball still contains AppleDouble junk files." >&2
  exit 1
fi

echo "==> shipping to aidev"
ssh -o ConnectTimeout=20 aidev \
  "cat > /tmp/bmsc-release.tgz && cd /var/www/bmsc && sudo bash scripts/bmsc.sh apply-release /tmp/bmsc-release.tgz ${SHA} && rm -f /tmp/bmsc-release.tgz" \
  < bmsc-release.tgz
rm -f bmsc-release.tgz

echo "==> verifying"
curl -sf -o /dev/null -w '    https://bmsc.klaten.org/login -> %{http_code}\n' https://bmsc.klaten.org/login
echo "release ${SHA} is live"
