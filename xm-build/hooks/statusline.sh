#!/usr/bin/env bash
# xm-build statusline — show current project phase

input=$(cat)
cwd=$(echo "$input" | jq -r '.cwd // .workspace.current_dir // ""')

tm_dir="${cwd:-.}/.xm-build/projects"
if [ -d "$tm_dir" ]; then
  latest=$(find "$tm_dir" -name "manifest.json" -maxdepth 2 2>/dev/null | head -1)
  if [ -n "$latest" ]; then
    phase=$(jq -r '.current_phase // empty' "$latest" 2>/dev/null)
    name=$(jq -r '.name // empty' "$latest" 2>/dev/null)
    if [ -n "$phase" ] && [ -n "$name" ]; then
      case "$phase" in
        01-research) ph="Research" ;;
        02-plan)     ph="Plan" ;;
        03-execute)  ph="Execute" ;;
        04-verify)   ph="Verify" ;;
        05-close)    ph="Close" ;;
        *)           ph="$phase" ;;
      esac
      printf " \033[34m⚙ %s:%s\033[0m" "$name" "$ph"
    fi
  fi
fi
