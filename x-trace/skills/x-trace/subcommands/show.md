# Subcommand: show

Renders the trace timeline in ASCII.

## Subcommand: show

### Parsing

From `$ARGUMENTS`:
- After `show` = session name (partial matching allowed; defaults to latest session if omitted)

### Session file lookup

```bash
# Latest session
ls -t .xm/traces/*.jsonl 2>/dev/null | head -1

# Name matching
ls .xm/traces/*.jsonl 2>/dev/null | grep "{name}"
```

### Timeline rendering

Read each entry from the JSONL file and output in the following format:

```
[trace] Session: feature-auth (2026-03-25)

00:00 ┬ x-op:review started
00:01 ├─┬ fan-out: 4 agents
00:01 │ ├── agent-1: security (~2.5K in, ~800 out) ✅ 12s
00:01 │ ├── agent-2: logic (~2.5K in, ~600 out) ✅ 10s
00:01 │ ├── agent-3: performance (~2.5K in, ~700 out) ✅ 11s
00:01 │ └── agent-4: tests (~2.5K in, ~500 out) ✅ 9s
00:13 ├── synthesize ✅ 3s
00:16 └── complete

Total: 16s | ~13K tokens | ~$0.04 est.
```

### Timeline rendering rules

- Time display: elapsed time from session start (`MM:SS`)
- Entries with `parent_id: null` → root node (`┬`)
- Entries with `parent_id` → child node (`├──` or `└──`)
- Last child → `└──`, others → `├──`
- Fan-out group → `├─┬` + indentation
- Status icons: `completed` → ✅, `failed` → ❌, `running` → 🔵, `skipped` → ⏭️
- Token display: abbreviated with `K` for thousands (2500 → `~2.5K`)
- Cost is summed and shown on the `Total` line

## Applies to
Invoked via `/x-trace show [session]`.
