#!/usr/bin/env bash
#
# Build a runnable working tree from the pristine mirror.
#
#   mirror/frontend/src          ->  standalone/frontend/workdir/src
#   standalone/frontend/overlay  ->  merged on top (adds main.tsx, ContentApp…)
#
# The mirror is never written to. Re-run this any time; workdir is disposable.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
MIRROR="$ROOT/mirror/frontend"
WORK="$HERE/workdir"

if [[ ! -d "$MIRROR/src" ]]; then
  echo "error: mirror not found at $MIRROR — run _tools/extract.py first" >&2
  exit 1
fi

echo "==> resetting $WORK"
rm -rf "$WORK"
mkdir -p "$WORK"

echo "==> copying mirror (read-only source)"
cp -a "$MIRROR/src" "$WORK/src"
if [[ -d "$MIRROR/e2e" ]]; then cp -a "$MIRROR/e2e" "$WORK/e2e"; fi
# src/components/ui/__tests__/icons.test.tsx imports ../../../../scripts/icons/…
if [[ -d "$MIRROR/scripts" ]]; then cp -a "$MIRROR/scripts" "$WORK/scripts"; fi
# public/ holds sitemap.xml + robots.txt + favicon; two suites read them from disk.
if [[ -d "$MIRROR/public" ]]; then cp -a "$MIRROR/public" "$WORK/public"; fi
# docs/ carries the icon specimen that the design-system suite diffs on disk.
if [[ -d "$MIRROR/docs" ]]; then cp -a "$MIRROR/docs" "$WORK/docs"; fi

echo "==> applying overlay"
cp -a "$HERE/overlay/." "$WORK/"

echo "==> copying project files"
for f in package.json tsconfig.json vite.config.ts vitest.config.ts index.html; do
  cp "$HERE/$f" "$WORK/$f"
done

cat <<'EOF'

Done. Next:

  cd workdir
  npm install
  npm run dev        # expects the content API on http://127.0.0.1:3000

Unit tests (no API needed — every suite stubs fetch):

  cd workdir && npm install && npm test

EOF
