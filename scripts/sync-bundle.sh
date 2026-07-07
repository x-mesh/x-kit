#!/usr/bin/env bash
# sync-bundle.sh — Sync standalone plugin files to x-kit bundle
# Run from repo root: ./scripts/sync-bundle.sh
# Source of truth: standalone plugin directories
# Plugin naming: source dirs keep x-{name}/, skills dirs use {name}/ (no x- prefix)

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
for plugin in build op solver eval review trace memory humble probe agent; do
  src="x-$plugin/skills/$plugin/SKILL.md"
  dst="x-kit/skills/$plugin/SKILL.md"
  sync_file "$src" "$dst"
done
# x-dashboard's skill dir is x-dashboard/skills/x-dashboard/ (not skills/dashboard/)
sync_file "x-dashboard/skills/x-dashboard/SKILL.md" "x-kit/skills/dashboard/SKILL.md"

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
echo "=== Syncing op strategies ==="
mirror_md_dir "x-op/skills/op/strategies" "x-kit/skills/op/strategies"

echo ""
echo "=== Syncing op references ==="
mirror_md_dir "x-op/skills/op/references" "x-kit/skills/op/references"

echo ""
echo "=== Syncing agent autonomous ==="
mirror_md_dir "x-agent/skills/agent/autonomous" "x-kit/skills/agent/autonomous"

echo ""
echo "=== Syncing agent references ==="
mirror_md_dir "x-agent/skills/agent/references" "x-kit/skills/agent/references"

echo ""
echo "=== Syncing build references ==="
mirror_md_dir "x-build/skills/build/references" "x-kit/skills/build/references"

echo ""
echo "=== Syncing build commands ==="
mirror_md_dir "x-build/skills/build/commands" "x-kit/skills/build/commands"

echo ""
echo "=== Syncing build phases ==="
mirror_md_dir "x-build/skills/build/references/phases" "x-kit/skills/build/references/phases"

echo ""
echo "=== Syncing review lenses ==="
mirror_md_dir "x-review/skills/review/lenses" "x-kit/skills/review/lenses"

echo ""
echo "=== Syncing review references ==="
mirror_md_dir "x-review/skills/review/references" "x-kit/skills/review/references"

echo ""
echo "=== Syncing eval judges ==="
mirror_md_dir "x-eval/skills/eval/judges" "x-kit/skills/eval/judges"

echo ""
echo "=== Syncing eval subcommands ==="
mirror_md_dir "x-eval/skills/eval/subcommands" "x-kit/skills/eval/subcommands"

echo ""
echo "=== Syncing eval references ==="
mirror_md_dir "x-eval/skills/eval/references" "x-kit/skills/eval/references"

echo ""
echo "=== Syncing solver commands ==="
mirror_md_dir "x-solver/skills/solver/commands" "x-kit/skills/solver/commands"

echo ""
echo "=== Syncing solver references ==="
mirror_md_dir "x-solver/skills/solver/references" "x-kit/skills/solver/references"

echo ""
echo "=== Syncing probe sessions ==="
mirror_md_dir "x-probe/skills/probe/sessions" "x-kit/skills/probe/sessions"

echo ""
echo "=== Syncing trace subcommands ==="
mirror_md_dir "x-trace/skills/trace/subcommands" "x-kit/skills/trace/subcommands"

echo ""
echo "=== Syncing humble sessions ==="
mirror_md_dir "x-humble/skills/humble/sessions" "x-kit/skills/humble/sessions"

echo ""
echo "=== Syncing memory references ==="
mirror_md_dir "x-memory/skills/memory/references" "x-kit/skills/memory/references"

echo ""
echo "=== Verifying all synced ==="
DIVERGED=0
for plugin in build op solver eval review trace memory humble probe agent; do
  src="x-$plugin/skills/$plugin/SKILL.md"
  dst="x-kit/skills/$plugin/SKILL.md"
  if [ -f "$src" ] && [ -f "$dst" ] && ! diff -q "$src" "$dst" > /dev/null 2>&1; then
    echo "  DIVERGED: $dst"
    DIVERGED=$((DIVERGED + 1))
  fi
done

if ! diff -q "x-dashboard/skills/x-dashboard/SKILL.md" "x-kit/skills/dashboard/SKILL.md" > /dev/null 2>&1; then
  echo "  DIVERGED: x-kit/skills/dashboard/SKILL.md"
  DIVERGED=$((DIVERGED + 1))
fi

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
