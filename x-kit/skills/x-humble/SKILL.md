---
name: x-humble
description: Structured retrospective — reflect on failures together, find root causes, explore alternatives, and grow
allowed-tools:
  - AskUserQuestion
---

<Purpose>
x-humble is a structured retrospective system where the user and agent learn from failures together.
The **retrospective process itself** is the core, not rule generation. Rules are merely a byproduct.

"humble = knowing you can be wrong"
</Purpose>

<Use_When>
- At session end: "what did I get wrong?", "let's reflect", "retrospect", "reflect"
- When the same mistake repeats: "this again", "why does this keep happening"
- After project completion: "what did we learn?", "how should we do it next time?"
- When the user has said "that's not right" multiple times
</Use_When>

<Do_Not_Use_When>
- When a problem needs to be solved right now (use x-solver)
- When strategic analysis is needed (use x-op)
- For simple feedback storage (use Claude Code built-in memory)
</Do_Not_Use_When>

# x-humble — Structured Retrospective

A structured retrospective to learn from failures together. The user learns, the agent learns.

## Model Routing

| Phase | Model | Reason |
|-------|-------|--------|
| Phase 0 (CHECK-IN: read prior commitments) | **haiku** (Agent tool) | File read + status display |
| Phase 1 (RECALL: aggregate git/work history) | **haiku** (Agent tool) | Mechanical aggregation |
| Phase 2-5 (IDENTIFY/ANALYZE/ALTERNATIVE/COMMIT) | **sonnet** | Reasoning, bias analysis, judgment |

**Guardrail**: never haiku for ANALYZE or ALTERNATIVE — retrospective quality requires reasoning. Downgrading these silently degrades learning capture.

## Mode Detection

Read mode from `.xm/config.json` (`mode` field). Default: `developer`.

**Developer mode**: Use technical terms (root cause, counterfactual, retrospective). Concise.

**Normal mode**: Guide in plain, accessible language.
- Use simplified terms: "root cause" → "the core reason", "counterfactual" → "what if we had done it differently", "retrospective" → "looking back"
- "bias" → "thinking trap", "steelman" → "strengthen the argument", "KEEP/STOP/START" → "Continue/Stop/Start"
- Lead with the most important information first; keep sentences short and direct

## Arguments

User provided: $ARGUMENTS

## AskUserQuestion Dark-Theme Rule

See `references/ask-user-question-rule.md` — the `question` field is invisible on dark terminals; put context in markdown, use `header`/`label`/`description` for user-facing text.

## Routing

First word of `$ARGUMENTS`:
- `reflect` → [Session: reflect] — Reflect on this session
- `review` → [Session: review] — Reflect on a specific failure/decision
- `lessons` → [View: lessons] — View accumulated lessons
- `apply` → [Action: apply] — Apply a lesson to CLAUDE.md
- `history` → [View: history] — Retrospective history
- Empty input → [Session: reflect] — Default

---

## Session: reflect

See `sessions/reflect.md` — structured retrospective: Judgment Path + Failure Cause + Bias Analysis + Lessons + Behavior Changes + Application. Persistent lessons are tagged and later surfaced via `## Lessons (x-humble)` injection.

---

## Session: review

**Deeply reflect on a specific failure or decision.** Narrower and deeper than reflect.

### Usage

```
/x-humble review "Why was distribute chosen over scaffold"
/x-humble review "Reason for missing tests"
```

### Execution

Run only Phase 3 (Analyze) + Phase 4 (Alternative):
- Find the specific decision point and restore context
- Analyze the judgment path at that point
- Explore alternatives
- Derive lessons

---

## View: lessons

**View accumulated lessons.**

```
/x-humble lessons

🪞 Lessons (5 total)

Active (applied to CLAUDE.md):
  [L1] STOP: Fixating on first approach (2026-03-27, confirmed 3 times)
  [L2] START: Run --dry-run before implementation (2026-03-25, confirmed 2 times)

Recorded (stored only):
  [L3] KEEP: Consensus review after PRD generation (2026-03-27)
  [L4] STOP: Ignoring error messages and retrying (2026-03-26)
  [L5] START: Immediately reflect user feedback (2026-03-24)

Stats:
  Retrospectives: 8
  Lessons created: 5 (active: 2, recorded: 3)
  Repeated mistake reduction: measuring
```

### Lesson Reinforcement/Weakening

When the same lesson is confirmed in a different session, it is automatically reinforced:
```
[L4] STOP: Ignoring error messages (confirmed: 3 times)
  → Confirmed 3+ times → Suggest applying to CLAUDE.md
```

#### Auto-Activation Rules

| Condition | Action |
|-----------|--------|
| `confirmed_count >= 3` | Auto-promote `status: "recorded"` → `"active"`, suggest CLAUDE.md application |
| `confirmed_count >= 5` | Auto-inject into CLAUDE.md (without user confirmation) |
| `confirmed_count == 1` + 30 days unconfirmed | `"⚠ Is this lesson still valid?"` confirmation request |
| Re-confirmed after `deprecated` | Restore `status: "deprecated"` → `"recorded"` + reset `confirmed_count` |

Promotion message:
```
🎓 [L4] "Ignoring error messages" — Confirmed 3 times. Promoting to active.
   Apply to CLAUDE.md? (y/N)
```

When a lesson is found to be wrong:
```
/x-humble lessons deprecate L2 --reason "dry-run was actually inefficient"
```

---

## Action: apply

**Manually apply/remove lessons to/from CLAUDE.md.**

```
/x-humble apply L3          # Add lesson L3 to CLAUDE.md
/x-humble apply --remove L2 # Remove lesson L2 from CLAUDE.md
```

### CLAUDE.md Injection Format

```markdown
## Lessons (x-humble)
<!-- Section managed by x-humble. Manual editing allowed. -->
- STOP: Fixating on first approach. Consider at least 2 alternatives first. (L1, confirmed 3 times, 2026-03-27)
- START: Verify plan with --dry-run before implementation. (L2, confirmed 2 times, 2026-03-25)
```

### CLAUDE.md Sync Rules

The leader follows these rules when executing `apply`:

1. **Find section**: Locate the `## Lessons (x-humble)` section in CLAUDE.md
2. **If section missing**: Create a new section at the end of the file
3. **Prevent duplicates**: If the same lesson ID (L{N}) already exists, update it; otherwise add
4. **Removal**: On `--remove`, delete the corresponding line. If section becomes empty, keep the section (empty state)
5. **Format**: `- {TYPE}: {content} (L{N}, confirmed {count} times, {date})`
6. **Order**: Sort as KEEP → STOP → START

### x-eval Judge Context Integration

Active lessons with `confirmed_count >= 3` are optionally injected into x-eval's judge prompt:

```
## Context: Active Lessons (x-humble)
The following lessons are repeatedly confirmed patterns in this project. Consider them when scoring:
- STOP: Ignoring error messages (confirmed 3 times)
- START: dry-run before implementation (confirmed 5 times)
```

This context is passed via the `--context` option of x-eval's `score` command. It is provided only as a "reference" to avoid compromising the judge's independence.

---

## View: history

**View retrospective history.**

```
/x-humble history

🪞 Retrospective History

| # | Date | Type | Topic | Lessons |
|---|------|------|-------|---------|
| 1 | 03-27 | reflect | x-kit renaming session | L1, L3 |
| 2 | 03-26 | review | scaffold vs distribute choice | L4 |
| 3 | 03-25 | reflect | x-build PRD pipeline | L2, L5 |
```

---

## Storage

```
.xm/humble/
├── retrospectives/           # Retrospective records
│   └── {timestamp}-{type}.json
├── lessons/                  # Lessons
│   └── {id}.json
└── stats.json                # Statistics
```

### Lesson Schema

```json
{
  "id": "L1",
  "type": "STOP" | "START" | "KEEP",
  "content": "Fixating on first approach",
  "reason": "Same mistake 3 times in a row due to anchoring bias",
  "source_retrospective": "2026-03-27T12:00:00Z-reflect",
  "confirmed_count": 3,
  "status": "active" | "recorded" | "deprecated",
  "applied_to_claudemd": true,
  "created_at": "ISO8601",
  "last_confirmed": "ISO8601"
}
```

### Retrospective Schema

```json
{
  "timestamp": "ISO8601",
  "type": "reflect" | "review",
  "session_summary": "...",
  "failures_identified": ["..."],
  "root_causes": ["..."],
  "biases_detected": ["anchoring"],
  "bias_tags": [
    { "bias": "confirmation_bias", "context": "tech-stack", "severity": "high" }
  ],
  "alternatives_explored": 3,
  "user_alternative": "Alternative proposed by user (steelman)",
  "user_choice": "alternative-1",
  "lessons_created": ["L1"],
  "commitment_checkin": {
    "previous_lessons": ["L1", "L2"],
    "kept": ["L1"],
    "broken": ["L2"],
    "reason": "Lack of time"
  },
  "user_satisfaction": "helpful" | "neutral" | "unhelpful"
}
```

---

## Success Retrospective (when "Nothing" is selected in Phase 2)

Failures are not the only thing worth reflecting on. Learn from successes too.

```
🪞 [reflect] Success Retrospective

What went well this session:
| # | Judgment | Why it worked |
|---|---------|---------------|
| 1 | Used PRD consensus | Critic's feedback filled in gaps |
| 2 | Quality assured via --verify | Initial result 6.2 → retry 7.8 |

Record as KEEP?
1) KEEP: Use consensus review → Save as lesson
2) Record only
3) Ignore
```

---

## Bias Dictionary

List of cognitive biases used in Phase 3:

| Bias | Description | Detection Signal |
|------|-------------|-----------------|
| Anchoring | Fixating on the first approach | Charging ahead without exploring alternatives |
| Overconfidence | Certainty despite uncertainty | Using "definitely", "must be" while being wrong |
| User appeasement | Matching the desired answer | Following user hints without critique |
| Complexity bias | Ignoring simple solutions | Implementing in 30 lines what could be 3 |
| Sunk cost | Unable to abandon a wrong path | "We've already come this far" |
| Confirmation bias | Seeking only supporting evidence | Ignoring or minimizing counterexamples |
| Availability bias | Recommending only recent/familiar things | Always suggesting the same patterns/libraries |

---

## Shared Config Integration

```
Settings in .xm/config.json:
- mode: developer | normal (retrospective output style)
- agent_max_count: Number of agents for Phase 4 alternative exploration (default 3)
```

---

## Trace Recording

See `references/trace-recording.md` — session_start/session_end are automatic via `.claude/hooks/trace-session.mjs`; emit best-effort `agent_step` entries for long sub-operations.

## Natural Language Mapping

| User says | Command |
|-----------|---------|
| "let's reflect", "look back", "reflect" | `reflect` |
| "why did you do that?", "why that judgment?" | `review "the judgment in question"` |
| "what did we learn?", "show lessons" | `lessons` |
| "put this in CLAUDE.md" | `apply L{N}` |
| "retrospective history" | `history` |
| "that lesson was wrong" | `lessons deprecate L{N}` |

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "The bug was obvious in hindsight" | It wasn't at the time — if it had been, you'd have caught it before shipping. Write the lesson for past-you, who missed it. |
| "This is bad luck, not a pattern" | A pattern is what you call coincidence after the third repetition. If you're defending it as bad luck, it's probably a pattern. |
| "The root cause is obvious" | You have a hypothesis, not a root cause. Ask "why" three more times before committing it as a lesson. |
| "The lesson is too obvious to write down" | Obvious today, forgotten in three weeks. Decay is the default — write it. |
| "Adding a lesson feels like overreacting" | Lessons have confirmation counts for exactly this reason. A single-confirmation lesson is cheap; a missing lesson repeats the incident. |
| "I already learned this, no need to retrospect" | Learning without encoding it in CLAUDE.md means the next session (or next agent) starts from zero. |
| "The success was luck, not skill" | Successes that you can't explain are liabilities. If you can't name why it worked, you can't repeat it. |
