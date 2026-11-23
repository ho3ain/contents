#!/usr/bin/env bash
#
# Build a runnable working tree from the pristine mirror.
#
#   mirror/backend/{src,test}  ->  standalone/backend/workdir/{src,test}
#   standalone/backend/overlay ->  merged on top (adds main.ts, ContentAppModule…)
#
# The mirror is never written to. Re-run this any time; workdir is disposable.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
MIRROR="$ROOT/mirror/backend"
WORK="$HERE/workdir"

if [[ ! -d "$MIRROR/src" ]]; then
  echo "error: mirror not found at $MIRROR — run _tools/extract.py first" >&2
  exit 1
fi

echo "==> resetting $WORK"
rm -rf "$WORK"
mkdir -p "$WORK"

echo "==> copying mirror (read-only source)"
cp -a "$MIRROR/src"  "$WORK/src"
cp -a "$MIRROR/test" "$WORK/test"

echo "==> applying overlay"
cp -a "$HERE/overlay/." "$WORK/"

echo "==> copying project files"
for f in package.json tsconfig.json nest-cli.json .env.example; do
  cp "$HERE/$f" "$WORK/$f"
done
[[ -f "$WORK/.env" ]] || cp "$HERE/.env.example" "$WORK/.env"

cat <<'EOF'

Done. Next:

  cd workdir
  npm install
  # edit .env for your PostgreSQL instance, then:
  npm run migration:run
  npm run start:dev

Type-check only (no database needed):

  cd workdir && npm install && npm run typecheck

EOF
