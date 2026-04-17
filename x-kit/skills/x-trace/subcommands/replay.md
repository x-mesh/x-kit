# Subcommand: replay

Replays an execution from a specific step of a given session.

## Subcommand: replay

### Parsing

From `$ARGUMENTS`:
- After `replay` = session name (required)
- `--from N` = step number to start replay from (defaults to beginning if omitted)

### Execution

1. Read session file
2. Filter entries where `step >= N`
3. Display each agent entry's prompt/context sequentially
4. Ask user whether to re-invoke the actual Agent tool calls

### Output

```
[trace] Replay: feature-auth-20260325 (from step 3)

Step 3: agent-1 (security, sonnet)
  Source: x-op:review
  Input tokens est.: ~2,500
  ---
  [Prompt preview, first 200 chars...]
  ---

Step 4: agent-2 (logic, sonnet)
  ...

Replay steps 3-6? (y/N)
```

If the user confirms, re-invoke those agents with `run_in_background: true`.

## Applies to
Invoked via `/x-trace replay <session> [--from step]`.
