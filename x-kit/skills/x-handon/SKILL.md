---
name: x-handon
description: Session restore — resume from last handoff, inject context automatically
---

# x-handon — Session Restore (Resume)

Restore session context from the last handoff. **Context injection is automatic** — running this skill means "give me the previous session's context."

## When to Use
- Start of a new session
- After `/clear` or context compaction
- When resuming work after a break

## Execution (MANDATORY behavior)

**Step 1: Read session state as JSON**

```bash
node x-build/lib/x-build-cli.mjs handon --json 2>/dev/null
```

If the command returns `{"error":"no_session_state"}` or fails, output:
> No previous session state found. Run `/x-handoff` at the end of a session to save.

And stop.

**Step 2: Parse and absorb as context**

The JSON contains these sections that you MUST use as your working context:

| Field | How to use |
|-------|-----------|
| `where.branch` | You are on this git branch |
| `where.last_commits` | These are the most recent changes |
| `what_done` | This work was completed in the last session |
| `what_remains.active_projects` | These projects need attention |
| `what_remains.uncommitted` | These files have unsaved changes |
| `decisions` | These decisions are FINAL — do not re-discuss or question them |
| `context.current_focus` | This was the working direction |
| `context.test_status` | This is the test health |
| `context.quality_scores` | These are the quality benchmarks |
| `why_stopped` | This is why the last session ended |
| `since_handoff.new_commits` | This many changes happened since the handoff (by others or other sessions) |

**Step 3: Output summary to user**

After absorbing, show a human-readable summary:

```
📋 Session Restored

  📍 Branch: {branch} (+{ahead} ahead)
  ✅ Done: {what_done count} commits last session
  📌 Active: {active_projects count} projects
  🔒 Decisions: {decisions count} carried forward
  🎯 Focus: {current_focus}
  💤 Last stopped: {why_stopped}
  
  Since handoff: {new_commits} new commits

Ready to continue. What would you like to work on?
```

**Step 4: Wait for user direction**

Do NOT auto-start any work. Present the restored context and wait for the user to say what to do next.

## Key Rule: Decisions are Final

The `decisions` array contains choices already made and agreed upon. When the user asks about a topic covered by a decision, reference it — do not re-analyze or suggest alternatives unless explicitly asked to reconsider.

## Arguments

- `/x-handon` — restore and show summary (default)
- `/x-handon --json` — same behavior (JSON is always used internally; flag is for backward compat)
