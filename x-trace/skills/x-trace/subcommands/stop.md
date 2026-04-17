# Subcommand: stop

Stops the current active session and saves it.

## Subcommand: stop

### Execution

1. Read active session file path from `.xm/traces/.active`
2. Write session end entry:
   ```json
   {"id":"s-end","timestamp":"...","type":"session_end","status":"completed","total_entries":N}
   ```
3. Delete `.xm/traces/.active`

### Output

```
[trace] Session stopped: feature-auth-20260325-120000
  Entries: 12
  Duration: 16s
  File saved: .xm/traces/feature-auth-20260325-120000.jsonl
```

## Applies to
Invoked via `/x-trace stop`.
