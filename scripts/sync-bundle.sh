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

# Mirror every *.md inside a source directory to a destination directory.
# Creates the destination if missing; no-op on empty source.
mirror_md_dir() {
  local src="$1" dst="$2"
  [ -d "$src" ] || return 0
  mkdir -p "$dst"
  shopt -s nullglob
  for f in "$src"/*.md; do
    sync_file "$f" "$dst/$(basename "$f")"
  done
  shopt -u nullglob
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
sync_file "x-build/lib/shared-config.mjs" "x-kit/lib/shared-config.mjs"
sync_file "x-build/lib/default-config.json" "x-kit/lib/default-config.json"

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
echo "=== Syncing x-dashboard lib + public ==="
sync_file "x-dashboard/lib/x-dashboard-server.mjs" "x-kit/lib/x-dashboard-server.mjs"
mkdir -p "x-kit/public"
shopt -s nullglob
for f in x-dashboard/public/*; do
  sync_file "$f" "x-kit/public/$(basename "$f")"
done
shopt -u nullglob

echo ""
echo "=== Syncing references ==="
mirror_md_dir "references" "x-kit/references"

echo ""
echo "=== Syncing x-op strategies ==="
mirror_md_dir "x-op/skills/x-op/strategies" "x-kit/skills/x-op/strategies"

echo ""
echo "=== Syncing x-op references ==="
mirror_md_dir "x-op/skills/x-op/references" "x-kit/skills/x-op/references"

echo ""
echo "=== Syncing x-agent autonomous ==="
mirror_md_dir "x-agent/skills/x-agent/autonomous" "x-kit/skills/x-agent/autonomous"

echo ""
echo "=== Syncing x-agent references ==="
mirror_md_dir "x-agent/skills/x-agent/references" "x-kit/skills/x-agent/references"

echo ""
echo "=== Syncing x-build references ==="
mirror_md_dir "x-build/skills/x-build/references" "x-kit/skills/x-build/references"

echo ""
echo "=== Syncing x-build commands ==="
mirror_md_dir "x-build/skills/x-build/commands" "x-kit/skills/x-build/commands"

echo ""
echo "=== Syncing x-build phases ==="
mirror_md_dir "x-build/skills/x-build/references/phases" "x-kit/skills/x-build/references/phases"

echo ""
echo "=== Syncing x-review lenses ==="
mirror_md_dir "x-review/skills/x-review/lenses" "x-kit/skills/x-review/lenses"

echo ""
echo "=== Syncing x-review references ==="
mirror_md_dir "x-review/skills/x-review/references" "x-kit/skills/x-review/references"

echo ""
echo "=== Syncing x-eval judges ==="
mirror_md_dir "x-eval/skills/x-eval/judges" "x-kit/skills/x-eval/judges"

echo ""
echo "=== Syncing x-eval subcommands ==="
mirror_md_dir "x-eval/skills/x-eval/subcommands" "x-kit/skills/x-eval/subcommands"

echo ""
echo "=== Syncing x-eval references ==="
mirror_md_dir "x-eval/skills/x-eval/references" "x-kit/skills/x-eval/references"

echo ""
echo "=== Syncing x-solver commands ==="
mirror_md_dir "x-solver/skills/x-solver/commands" "x-kit/skills/x-solver/commands"

echo ""
echo "=== Syncing x-solver references ==="
mirror_md_dir "x-solver/skills/x-solver/references" "x-kit/skills/x-solver/references"

echo ""
echo "=== Syncing x-probe sessions ==="
mirror_md_dir "x-probe/skills/x-probe/sessions" "x-kit/skills/x-probe/sessions"

echo ""
echo "=== Syncing x-trace subcommands ==="
mirror_md_dir "x-trace/skills/x-trace/subcommands" "x-kit/skills/x-trace/subcommands"

echo ""
echo "=== Syncing x-humble sessions ==="
mirror_md_dir "x-humble/skills/x-humble/sessions" "x-kit/skills/x-humble/sessions"

echo ""
echo "=== Syncing x-memory references ==="
mirror_md_dir "x-memory/skills/x-memory/references" "x-kit/skills/x-memory/references"

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

for pair in \
  "x-build/lib/shared-config.mjs:x-kit/lib/shared-config.mjs" \
  "x-build/lib/default-config.json:x-kit/lib/default-config.json"; do
  src="${pair%%:*}"; dst="${pair##*:}"
  if ! diff -q "$src" "$dst" > /dev/null 2>&1; then
    echo "  DIVERGED: $dst"
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

if ! diff -q "x-dashboard/lib/x-dashboard-server.mjs" "x-kit/lib/x-dashboard-server.mjs" > /dev/null 2>&1; then
  echo "  DIVERGED: x-kit/lib/x-dashboard-server.mjs"
  DIVERGED=$((DIVERGED + 1))
fi

shopt -s nullglob
for f in x-dashboard/public/*; do
  if ! diff -q "$f" "x-kit/public/$(basename "$f")" > /dev/null 2>&1; then
    echo "  DIVERGED: x-kit/public/$(basename "$f")"
    DIVERGED=$((DIVERGED + 1))
  fi
done
shopt -u nullglob

if [ "$DIVERGED" -eq 0 ]; then
  echo "  All files in sync."
else
  echo "  $DIVERGED file(s) still diverged!"
  exit 1
fi
