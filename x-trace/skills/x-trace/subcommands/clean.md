# Subcommand: clean

Deletes old trace files, with confirmation before removal.

## Subcommand: clean

### Parsing

From `$ARGUMENTS`:
- `--older-than Nd` = delete files older than N days (default: `7d`)

### Execution

```bash
# Find files older than 7 days
find .xm/traces/ -name "*.jsonl" -mtime +7
```

Show the list before deletion and ask the user for confirmation.

### Output

```
[trace] Clean: files older than 7 days

  To delete (3 files):
    .xm/traces/init-project-20260310-140000.jsonl  (15d ago, 12KB)
    .xm/traces/bugfix-20260308-110000.jsonl        (17d ago, 4KB)
    .xm/traces/review-20260305-090000.jsonl        (20d ago, 8KB)

  Total: 24KB will be freed.

Delete? (y/N)
```

## Applies to
Invoked via `/x-trace clean ...`.
