# Subcommand: help

Displays the x-trace command reference and usage examples.

## Subcommand: help

```
x-trace — Agent Execution Tracing for x-kit

Commands:
  start [name]                   Start a named trace session
  stop                           Stop current session and save
  show [session]                 Show trace timeline (default: latest)
  cost [session]                 Show cost breakdown by agent/task
  replay <session> [--from step] Replay execution from specific step
  diff <session1> <session2>     Compare two trace sessions
  list                           List saved trace sessions
  clean [--older-than 7d]        Clean old trace files

Storage: .xm/traces/{session-name}-{timestamp}.jsonl

Examples:
  /x-trace start feature-auth
  /x-trace show
  /x-trace cost feature-auth-20260325
  /x-trace diff run-1 run-2
  /x-trace replay feature-auth-20260325 --from 3
  /x-trace clean --older-than 7d
```

## Applies to
Invoked via `/x-trace help` or `/x-trace` with no arguments.
