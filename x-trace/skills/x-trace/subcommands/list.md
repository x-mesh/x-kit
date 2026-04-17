# Subcommand: list

Lists saved trace sessions with metadata.

## Subcommand: list

### Execution

```bash
ls -lt .xm/traces/*.jsonl 2>/dev/null
```

Read the first and last entry of each file to display session metadata.

### Output

```
[trace] Saved sessions (5 total)

  NAME                           DATE        DURATION  AGENTS  COST
  feature-auth-20260325-120000   2026-03-25  16s       4       $0.04
  feature-auth-20260324-090000   2026-03-24  22s       6       $0.06
  bugfix-login-20260323-150000   2026-03-23  8s        2       $0.02
  review-pr-42-20260322-110000   2026-03-22  31s       8       $0.09
  init-project-20260321-140000   2026-03-21  45s       12      $0.14

Active: feature-auth-20260325-120000 (running)
```

## Applies to
Invoked via `/x-trace list`.
