---
name: x-handoff
description: Session handoff — save comprehensive session state for cross-session continuity
---

# x-handoff — Session Handoff (Save)

Save comprehensive session state so the next session can pick up where you left off.

## Model Routing

This entire skill is **haiku** (Agent tool). The CLI does all the work — collecting git/build/decisions/traces and writing JSON. The leader only invokes the command and prints confirmation. No reasoning required.

```
Agent tool: { model: "haiku", description: "x-handoff", prompt: "Run: node x-build/lib/x-build-cli.mjs handoff --full \"$ARGUMENTS\"" }
```

**Guardrail**: if the user asks for a "narrative summary" or "what should we do next", escalate to **sonnet** — that requires reasoning over the collected state.

## When to Use
- End of a work session
- Before `/clear` or context compaction
- When switching to a different project/branch

## CLI

```bash
node x-build/lib/x-build-cli.mjs handoff --full "$ARGUMENTS"
```

`$ARGUMENTS` is used as the `why_stopped` reason. If empty, auto-generates from the last commit message.

## What it Collects (automatic)

| Source | Data | Method |
|--------|------|--------|
| git | branch, last 5 commits, uncommitted files, ahead/behind | `git log`, `git status` |
| x-build | active projects, phase, tasks, pending work | `.xm/build/projects/*/manifest.json` |
| decisions | from all active projects (last 10) | `decisions.json` / `decisions.md` |
| traces | last 5 skill executions | `.xm/traces/*.jsonl` |
| eval | quality scores | `.xm/eval/results/` |
| tests | pass/fail status | `bun test` (cached) |
| key files | most changed files | `git diff --stat` |

## Output

Saves to `.xm/build/SESSION-STATE.json`:

```json
{
  "v": 1,
  "saved_at": "2026-04-11T...",
  "where": { "branch": "develop", "last_commits": [...], "uncommitted_files": [...] },
  "what_done": ["commit1", "commit2"],
  "what_remains": { "active_projects": [...], "uncommitted": [...], "ideas": [] },
  "decisions": [{ "what": "...", "why": "..." }],
  "context": { "current_focus": "...", "test_status": "...", "quality_scores": {} },
  "why_stopped": "reason"
}
```

## Usage

```
/x-handoff                           # auto-generated reason
/x-handoff "dashboard 개선 완료"      # explicit reason
```

## Execution

Run via Bash tool:
```bash
node x-build/lib/x-build-cli.mjs handoff --full "$ARGUMENTS"
```

After execution, output:
```
✅ Session state saved. Next session: run /x-handon to restore.
```
