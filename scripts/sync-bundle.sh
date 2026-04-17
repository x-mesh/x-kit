#!/usr/bin/env bash
# sync-bundle.sh — Sync standalone plugin files to x-kit bundle
# Run from repo root: ./scripts/sync-bundle.sh
# Source of truth: standalone plugin directories

set -euo pipefail
cd "$(dirname "$0")/.."

ERRORS=0

sync_file() {
  local src="$1" dst="$2"
  if [ ! -f "$src" ]; then
    echo "  SKIP $src (not found)"
    return
  fi
  if diff -q "$src" "$dst" > /dev/null 2>&1; then
    echo "  OK   $dst"
  else
    cp "$src" "$dst"
    echo "  SYNC $dst"
  fi
}

echo "=== Syncing SKILL.md files ==="
for plugin in x-build x-op x-solver x-eval x-review x-trace x-memory x-humble x-probe x-agent; do
  src="$plugin/skills/$plugin/SKILL.md"
  dst="x-kit/skills/$plugin/SKILL.md"
  sync_file "$src" "$dst"
done

echo ""
echo "=== Syncing x-build lib files ==="
for f in core.mjs project.mjs phase.mjs plan.mjs tasks.mjs verify.mjs export.mjs misc.mjs release.mjs; do
  sync_file "x-build/lib/x-build/$f" "x-kit/lib/x-build/$f"
done
sync_file "x-build/lib/x-build-cli.mjs" "x-kit/lib/x-build-cli.mjs"

echo ""
echo "=== Syncing x-solver lib files ==="
sync_file "x-solver/lib/x-solver-cli.mjs" "x-kit/lib/x-solver-cli.mjs"

echo ""
echo "=== Syncing x-sync lib files ==="
for f in sync-config.mjs sync-pull.mjs sync-pull-all.mjs sync-push.mjs sync-push-all.mjs; do
  sync_file "x-sync/lib/x-sync/$f" "x-kit/lib/x-sync/$f"
done

echo ""
echo "=== Syncing x-trace lib files ==="
sync_file "x-trace/lib/x-trace/trace-writer.mjs" "x-kit/lib/x-trace/trace-writer.mjs"

echo ""
echo "=== Syncing references ==="
mkdir -p x-kit/references
if [ -d "references" ]; then
  shopt -s nullglob
  for f in references/*.md; do
    name=$(basename "$f")
    sync_file "$f" "x-kit/references/$name"
  done
  shopt -u nullglob
fi

echo ""
echo "=== Syncing x-op strategies ==="
if [ -d "x-op/skills/x-op/strategies" ]; then
  mkdir -p x-kit/skills/x-op/strategies
  shopt -s nullglob
  for f in x-op/skills/x-op/strategies/*.md; do
    name=$(basename "$f")
    sync_file "$f" "x-kit/skills/x-op/strategies/$name"
  done
  shopt -u nullglob
fi

echo ""
echo "=== Verifying all synced ==="
DIVERGED=0
for plugin in x-build x-op x-solver x-eval x-review x-trace x-memory x-humble x-probe x-agent; do
  src="$plugin/skills/$plugin/SKILL.md"
  dst="x-kit/skills/$plugin/SKILL.md"
  if [ -f "$src" ] && [ -f "$dst" ] && ! diff -q "$src" "$dst" > /dev/null 2>&1; then
    echo "  DIVERGED: $dst"
    DIVERGED=$((DIVERGED + 1))
  fi
done

for f in core.mjs project.mjs phase.mjs plan.mjs tasks.mjs verify.mjs export.mjs misc.mjs release.mjs; do
  if ! diff -q "x-build/lib/x-build/$f" "x-kit/lib/x-build/$f" > /dev/null 2>&1; then
    echo "  DIVERGED: x-kit/lib/x-build/$f"
    DIVERGED=$((DIVERGED + 1))
  fi
done

for f in sync-config.mjs sync-pull.mjs sync-pull-all.mjs sync-push.mjs sync-push-all.mjs; do
  if ! diff -q "x-sync/lib/x-sync/$f" "x-kit/lib/x-sync/$f" > /dev/null 2>&1; then
    echo "  DIVERGED: x-kit/lib/x-sync/$f"
    DIVERGED=$((DIVERGED + 1))
  fi
done

if ! diff -q "x-trace/lib/x-trace/trace-writer.mjs" "x-kit/lib/x-trace/trace-writer.mjs" > /dev/null 2>&1; then
  echo "  DIVERGED: x-kit/lib/x-trace/trace-writer.mjs"
  DIVERGED=$((DIVERGED + 1))
fi

if [ "$DIVERGED" -eq 0 ]; then
  echo "  All files in sync."
else
  echo "  $DIVERGED file(s) still diverged!"
  exit 1
fi
