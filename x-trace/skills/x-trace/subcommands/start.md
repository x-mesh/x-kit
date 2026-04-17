# Subcommand: start

Starts a new trace session with the given session name.

## Subcommand: start

### Parsing

From `$ARGUMENTS`:
- Word after `start` = session name (default: `session-{YYYYMMDD-HHMMSS}`)

### Execution

1. Create `.xm/traces/` directory if it does not exist:
   ```bash
   mkdir -p .xm/traces
   ```

2. Determine session file path:
   ```
   .xm/traces/{name}-{YYYYMMDD-HHMMSS}.jsonl
   ```

3. Write session start entry to JSONL:
   ```bash
   echo '{"id":"s-000","timestamp":"...","type":"session_start","session":"...","status":"active"}' >> .xm/traces/{file}
   ```

4. Save current active session to `.xm/traces/.active` (atomic write):
   ```bash
   echo '.xm/traces/{file}' > .xm/traces/.active.tmp && mv .xm/traces/.active.tmp .xm/traces/.active
   ```

### Output

```
[trace] Session started: feature-auth
  File: .xm/traces/feature-auth-20260325-120000.jsonl
  Use /x-trace stop to end the session.
```

## Applies to
Invoked via `/x-trace start [name]`.
