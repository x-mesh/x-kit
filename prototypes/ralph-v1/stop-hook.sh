#!/bin/bash
# ralph-v1 stop hook (prototype)
# Re-enters the session with a continuation prompt until the agent emits
# <promise>COMPLETE</promise> or max_iterations is reached.
#
# Adapted from the pattern documented in PRPs-agentic-eng, reworked for x-kit
# state locations (.xm/) and schema conventions.

set -euo pipefail

STATE_FILE="${RALPH_STATE_FILE:-.xm/ralph.state.md}"
HOOK_INPUT="${HOOK_INPUT:-$(cat)}"

emit_continuation() {
  local iteration="$1"
  local plan_path="$2"
  # Hook event payload: additionalContext is fed back as a user turn.
  jq -n \
    --arg iter "$iteration" \
    --arg plan "$plan_path" \
    '{
      hookSpecificOutput: {
        hookEventName: "Stop",
        additionalContext: (
          "# Ralph Loop — Iteration \($iter)\n\n" +
          "Plan: `\($plan)`\n" +
          "State: `.xm/ralph.state.md`\n\n" +
          "Continue executing the plan. Validate each task. " +
          "When ALL validations pass, emit the literal line " +
          "`<promise>COMPLETE</promise>` and stop. " +
          "If anything still fails, fix it and keep going."
        )
      }
    }'
}

# 1. No state file → normal stop
if [[ ! -f "$STATE_FILE" ]]; then
  exit 0
fi

# 2. Parse YAML frontmatter
FRONTMATTER=$(sed -n '/^---$/,/^---$/{ /^---$/d; p; }' "$STATE_FILE" | head -40)

ITERATION=$(printf '%s\n' "$FRONTMATTER" | awk '/^iteration:/{print $2; exit}')
MAX_ITERATIONS=$(printf '%s\n' "$FRONTMATTER" | awk '/^max_iterations:/{print $2; exit}')
PLAN_PATH=$(printf '%s\n' "$FRONTMATTER" | awk '/^plan_path:/{sub(/^plan_path: */, ""); gsub(/"/, ""); print; exit}')

# 3. Validate frontmatter
if [[ ! "$ITERATION" =~ ^[0-9]+$ ]] || [[ ! "$MAX_ITERATIONS" =~ ^[0-9]+$ ]]; then
  echo "⚠️  ralph: state file corrupt — removing" >&2
  rm -f "$STATE_FILE"
  exit 0
fi

# 4. Max iterations reached
if (( MAX_ITERATIONS > 0 )) && (( ITERATION >= MAX_ITERATIONS )); then
  echo "🛑 ralph: max_iterations=$MAX_ITERATIONS reached" >&2
  rm -f "$STATE_FILE"
  exit 0
fi

# 5. Completion check: grep transcript for promise token
TRANSCRIPT_PATH=$(printf '%s' "$HOOK_INPUT" | jq -r '.transcript_path // empty')

if [[ -n "$TRANSCRIPT_PATH" ]] && [[ -f "$TRANSCRIPT_PATH" ]]; then
  LAST_ASSISTANT=$(grep '"role":"assistant"' "$TRANSCRIPT_PATH" | tail -1 || true)
  if [[ -n "$LAST_ASSISTANT" ]]; then
    LAST_TEXT=$(printf '%s' "$LAST_ASSISTANT" | jq -r '
      .message.content
      | map(select(.type == "text"))
      | map(.text)
      | join("\n")
    ' 2>/dev/null || echo "")
    if printf '%s' "$LAST_TEXT" | grep -q '<promise>COMPLETE</promise>'; then
      echo "✅ ralph: completion promise received at iter $ITERATION" >&2
      rm -f "$STATE_FILE"
      exit 0
    fi
  fi
fi

# 6. Continue — bump iteration and emit continuation prompt
NEXT=$((ITERATION + 1))
TMP="${STATE_FILE}.tmp.$$"
sed "s/^iteration: .*/iteration: $NEXT/" "$STATE_FILE" > "$TMP"
mv "$TMP" "$STATE_FILE"

emit_continuation "$NEXT" "$PLAN_PATH"
exit 0
