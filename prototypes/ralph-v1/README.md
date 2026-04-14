# ralph-v1 — x-kit autonomous loop prototype

A self-referential stop-hook loop: the agent keeps iterating on a plan file until it emits a completion signal or max-iterations is reached. Prototype only — not wired into any x-kit plugin yet.

## Design

Three moving parts:

1. **State file** (`.xm/ralph.state.md`) — YAML frontmatter + markdown log. Single source of truth. LLM-editable.
2. **Stop hook** (`stop-hook.sh`) — runs on session-stop, decides: terminate vs re-enter.
3. **Completion signal** (`<promise>COMPLETE</promise>`) — grepped out of the last assistant message in the transcript.

## Control flow

```
session-stop
  ├─ .xm/ralph.state.md missing?        → exit 0 (normal stop)
  ├─ frontmatter corrupt?               → rm state; exit 0
  ├─ iteration >= max_iterations?       → rm state; exit 0 with 🛑
  ├─ transcript contains <promise>COMPLETE</promise>?
  │                                     → rm state; exit 0 with ✅
  └─ otherwise                          → bump iteration; emit continuation prompt
```

The hook emits a JSON payload on stdout that Claude Code consumes as a new user turn. See `stop-hook.sh` for the exact payload.

## State file format

```markdown
---
iteration: 3
max_iterations: 20
plan_path: ".xm/plans/add-auth.plan.md"
started_at: "2026-04-15T10:00:00Z"
---

## Progress Log

- iter 1: parsed plan, created 4 tasks
- iter 2: 2/4 tasks done; lint failed on src/auth.ts
- iter 3: lint fixed; 3/4 tasks done
```

Fields `iteration`, `max_iterations`, `plan_path` are required. Progress log is free-form — the agent writes it each iteration.

## Usage (once wired into x-kit)

```
/x-op ralph .xm/plans/my-feature.plan.md --max-iterations 20
```

1. x-op initializes `.xm/ralph.state.md`
2. Agent reads plan, does work, writes `<promise>COMPLETE</promise>` when all validations pass
3. Hook inspects transcript → either terminates or re-enters loop

## Completion promise

The agent must emit this literal line at the end of a successful iteration:

```
<promise>COMPLETE</promise>
```

Anything else (including an assertion that "everything passed") causes the hook to continue the loop. This is intentional — the gate is a single searchable token, not a semantic claim.

## Cancel

```
rm .xm/ralph.state.md
```

That's it. Next session-stop will see no state and exit normally.

## Test

```bash
cd prototypes/ralph-v1
./test.sh
```

Runs three scenarios end-to-end without spawning Claude:

1. No state file → exit 0, no continuation
2. State present, transcript without promise → continuation emitted, iteration bumped
3. State present, transcript with promise → exit 0 with ✅, state removed
4. State at max_iterations → exit 0 with 🛑, state removed

## Open questions (for validation before wiring)

- **Transcript shape**: Claude Code writes `transcript_path` into the hook input; format is one-JSON-per-line of messages. Prototype assumes this shape — confirm on the current CLI version.
- **Re-entry payload**: Claude Code accepts `{"hookSpecificOutput": {"hookEventName": "Stop", "additionalContext": "..."}}` to feed text back in. Confirm this is the right shape for `Stop` hooks.
- **Interaction with existing hooks**: `block-marketplace-copy.mjs` is `PreToolUse`, so it doesn't collide. But OMC hooks may exit non-zero in Stop position — test interference.
- **x-trace integration**: should the hook also write an `agent_step` entry per iteration? Probably yes, but out of scope for v1.
