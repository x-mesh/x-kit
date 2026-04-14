#!/bin/bash
# ralph-v1 stop-hook test harness (no Claude spawn — pure shell simulation)
set -euo pipefail

cd "$(dirname "$0")"
HOOK="./stop-hook.sh"
WORK=$(mktemp -d)
trap "rm -rf $WORK" EXIT

PASS=0
FAIL=0

run_case() {
  local name="$1"; shift
  local state="$1"; shift
  local transcript="$1"; shift
  local expected_exit="$1"; shift
  local expected_stdout_pattern="$1"; shift
  local expected_state_remains="$1"; shift

  local state_path="$WORK/ralph.state.md"
  local transcript_path="$WORK/transcript.jsonl"

  if [[ -n "$state" ]]; then
    printf '%s' "$state" > "$state_path"
  else
    rm -f "$state_path"
  fi

  if [[ -n "$transcript" ]]; then
    printf '%s\n' "$transcript" > "$transcript_path"
    hook_input=$(jq -n --arg t "$transcript_path" '{transcript_path: $t}')
  else
    hook_input='{}'
  fi

  local actual_stdout actual_exit
  set +e
  actual_stdout=$(
    RALPH_STATE_FILE="$state_path" HOOK_INPUT="$hook_input" bash "$HOOK" 2>/dev/null
  )
  actual_exit=$?
  set -e

  local ok=1
  [[ "$actual_exit" == "$expected_exit" ]] || ok=0
  if [[ -n "$expected_stdout_pattern" ]]; then
    printf '%s' "$actual_stdout" | grep -q "$expected_stdout_pattern" || ok=0
  fi
  if [[ "$expected_state_remains" == "yes" ]]; then
    [[ -f "$state_path" ]] || ok=0
  else
    [[ ! -f "$state_path" ]] || ok=0
  fi

  if (( ok == 1 )); then
    echo "PASS  $name"
    PASS=$((PASS+1))
  else
    echo "FAIL  $name"
    echo "      exit=$actual_exit (expected $expected_exit)"
    echo "      state_remains=$([[ -f "$state_path" ]] && echo yes || echo no) (expected $expected_state_remains)"
    echo "      stdout: $actual_stdout"
    FAIL=$((FAIL+1))
  fi
}

# Case 1: No state file → normal stop, no output
run_case "no state file → normal stop" \
  "" "" 0 "" "no"

# Case 2: State + transcript without promise → continuation, iteration bumped, state remains
STATE_ONGOING='---
iteration: 2
max_iterations: 20
plan_path: ".xm/plans/demo.plan.md"
---

progress log
'
TRANSCRIPT_ONGOING='{"role":"assistant","message":{"content":[{"type":"text","text":"still working on task 3"}]}}'
run_case "no promise → continuation emitted" \
  "$STATE_ONGOING" "$TRANSCRIPT_ONGOING" 0 "hookSpecificOutput" "yes"

# Verify iteration was bumped
ITER_AFTER=$(awk '/^iteration:/{print $2; exit}' "$WORK/ralph.state.md" 2>/dev/null || echo "?")
if [[ "$ITER_AFTER" == "3" ]]; then
  echo "PASS  iteration bumped 2 → 3"
  PASS=$((PASS+1))
else
  echo "FAIL  iteration bump (got $ITER_AFTER, expected 3)"
  FAIL=$((FAIL+1))
fi

# Case 3: State + transcript with promise → completion, state removed
TRANSCRIPT_DONE='{"role":"assistant","message":{"content":[{"type":"text","text":"All validations pass.\n<promise>COMPLETE</promise>"}]}}'
run_case "promise present → completion" \
  "$STATE_ONGOING" "$TRANSCRIPT_DONE" 0 "" "no"

# Case 4: iteration == max_iterations → halt
STATE_MAX='---
iteration: 20
max_iterations: 20
plan_path: ".xm/plans/demo.plan.md"
---
'
run_case "max_iterations reached → halt" \
  "$STATE_MAX" "" 0 "" "no"

# Case 5: corrupt frontmatter → halt + cleanup
STATE_BAD='---
iteration: abc
max_iterations: 20
plan_path: "x"
---
'
run_case "corrupt state → cleaned up" \
  "$STATE_BAD" "" 0 "" "no"

echo
echo "Total: $((PASS + FAIL)) — PASS=$PASS FAIL=$FAIL"
exit $FAIL
