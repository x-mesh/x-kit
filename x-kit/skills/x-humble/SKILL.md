---
name: x-humble
description: Structured retrospective — reflect on failures together, find root causes, explore alternatives, and grow
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

## Mode Detection

Read mode from `.xm/config.json` (`mode` field). Default: `developer`.

**Developer mode**: Use technical terms (root cause, counterfactual, retrospective). Concise.

**Normal mode**: 쉬운 한국어로 안내합니다.
- "root cause" → "근본 원인", "counterfactual" → "다르게 했다면", "retrospective" → "되돌아보기"
- "~하세요" 체 사용, 핵심 정보 먼저

## Arguments

User provided: $ARGUMENTS

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

**Look back on this session together.** 5-phase structured retrospective.

### Phase 0: CHECK-IN — Verify previous commitments

> 🪞 [reflect] Phase 0: Check-In

If there are items committed in a previous retrospective, verify compliance first.

Load lessons with `status: "active"` from `.xm/humble/lessons/`:
```
Commitments from previous retrospectives:
- START: "Write checklist before code review" (L2, 2026-03-25)
- STOP: "Fixating on first approach" (L1, 2026-03-27)

Did you actually follow through this session?
1) Kept — it was effective
2) Kept but — it wasn't effective (lesson needs re-evaluation)
3) Didn't keep — there's a reason
4) No previous commitments / first retrospective
```

- "Kept + effective" → `confirmed_count++`, REINFORCE
- "Kept but not effective" → Mark as re-evaluation target in this retrospective
- "Didn't keep" → Analyze the reason together in Phase 3 ANALYZE

> If no previous commitments exist, skip Phase 0 and go straight to Phase 1.

### Phase 1: RECALL — What did we do

> 🪞 [reflect] Phase 1: Recall

The leader summarizes the conversation flow of this session:
- List of user requests
- Agent's key judgments/actions
- Deliverables (code, documents, analysis, etc.)

```
📋 Session Summary

| # | Request | Action | Result |
|---|---------|--------|--------|
| 1 | API design | refine 4 rounds | Adopted proposal derived |
| 2 | Code implementation | scaffold 3 modules | Implementation complete |
| 3 | Review | review 5 agents | 8 issues found |
```

### Phase 2: IDENTIFY — What didn't go well

> 🪞 [reflect] Phase 2: Identify

Ask the user (AskUserQuestion):
```
Was there anything uncomfortable or disappointing in this session?
1) Deliverable quality below expectations
2) Repeated the same mistake
3) Went the wrong direction and had to backtrack
4) Nothing in particular (it went well)
```

"Nothing" → Skip to Phase 5 (success retrospective).

When the user selects, ask for specifics:
```
Which part was most disappointing? Please be specific.
```

### Phase 3: ANALYZE — Why was that judgment made

> 🪞 [reflect] Phase 3: Analyze (Root Cause)

**The agent honestly analyzes its own judgment process.** This is the core of x-humble.

**Cross-Session Pattern Detection**: Before analysis, search `.xm/humble/retrospectives/` for past retrospectives to check for similar patterns. If the same bias tag appeared previously, explicitly call it out:
```
"⚠ This pattern has appeared in previous retrospectives:
- 2026-03-25: confirmation_bias (during tech stack selection)
- 2026-03-20: confirmation_bias (during architecture decision)
This is the 3rd occurrence."
```

delegate (foreground, opus recommended):
```
"## Root Cause Analysis

Failure/disappointment:
{Problem identified in Phase 2}

Past similar patterns:
{Cross-Session Pattern search results, or 'first occurrence' if none}

This session's context:
{Phase 1 summary}

Analyze honestly:
1. Why was that judgment made? (What information was it based on?)
2. What information was missing? (Didn't know what you didn't know, or knowingly ignored it?)
3. Why was this discovered late? (Was there an earlier signal that was ignored or not checked? What check would have caught this sooner?)
4. What biases were at play?
   - Overconfidence: Being certain about something uncertain
   - Anchoring: Fixating on the first approach
   - User appeasement: Trying to give the answer the user wants
   - Complexity bias: Ignoring simple solutions and overcomplicating
5. Were there external constraints? (Lack of context, tool limitations, time pressure)
6. What should change in the process? (Not just "be more careful" — a specific, actionable change to how we work)

Format:
## Judgment Path
{What judgment was made at what point}

## Failure Cause
{1-2 most fundamental causes}

## Bias Analysis
{Biases at play and evidence}

300 words max. No excuses, be honest."
```

Show the analysis results to the user.

**Comfortable Challenger Role**: If the user attempts self-rationalization (blaming environment, lack of time, etc.), the agent challenges gently but directly:
```
"Your explanation cites many external factors.
If you had to name one decision of your own that could have been different?"
```

Request feedback:
```
Is this analysis correct? Could there be other causes?
```

### Phase 4: ALTERNATIVE — What should have been done

> 🪞 [reflect] Phase 4: Alternative (Counterfactual)

**Counterfactual reasoning — explore alternative paths.**

**Steelman Protocol**: Before the agent proposes alternatives, ask the user first:
```
"If you could do it over, what one thing would you do differently?"
```
After collecting the user's response, the agent steelmans the user's alternative and supplements with additional alternatives.

broadcast (3 agents):
```
Agent 1 (same approach, different execution):
"What if the same strategy was chosen but executed differently?
Problem: {Phase 2 problem}
Actual action: {Phase 3 judgment path}
A better way to execute within the same direction? 200 words max."

Agent 2 (completely different approach):
"What if a completely different approach was taken from the start?
Problem: {Phase 2 problem}
Actual approach: {Phase 3 judgment path}
A fundamentally different approach? 200 words max."

Agent 3 (minimal intervention):
"What was the simplest solution?
Problem: {Phase 2 problem}
Actual action: {Phase 3 judgment path}
Occam's razor — the least effort to solve it? 200 words max."
```

The leader synthesizes and displays the 3 alternatives:

```
🔄 Alternative Paths

| # | Approach | Expected Result | Cost |
|---|----------|----------------|------|
| 1 | Same direction, better execution | ... | Low |
| 2 | Completely different approach | ... | High |
| 3 | Minimal intervention | ... | Lowest |
```

Ask the user:
```
If a similar situation arises next time, which approach would be best?
1) Alternative 1 — ...
2) Alternative 2 — ...
3) Alternative 3 — ...
4) The original approach was correct — just improve execution
```

### Phase 5: COMMIT — What to change

> 🪞 [reflect] Phase 5: Commit

Organize retrospective results into lessons. **Lesson sharing, not rule enforcement.**

#### Action Item Quality Contract

Every action must pass this checklist:
1. **Verifiable** — Can you check if this is being done? "Be more careful" → FAIL. "Run tests before committing" → PASS.
2. **Scoped** — Does it target a specific phase, tool, or artifact? "Improve code quality" → FAIL. "Add --strict flag to plan-check" → PASS.
3. **Derived from root cause** — Does it trace to a specific Phase 3 finding? If not, it's speculation.

#### Action Type Taxonomy

Map each root cause to the appropriate action type:

| Root Cause Type | Action Type | Template |
|----------------|-------------|----------|
| Missing check/validation | **PROCESS** | "Add {check} at {phase/step} before {action}" |
| Bias (from Bias Dictionary) | **PROMPT** | "Add {disambiguation rule/question} to {SKILL.md section}" |
| Missing information | **CONTEXT** | "Require {data source} before starting {phase}" |
| Wrong tool/approach | **TOOL** | "Use {alternative} instead of {current} when {condition}" |
| Calibration gap | **CALIBRATION** | "Add {worked example/threshold} to {criteria section}" |

#### Good vs Bad Action Examples

Good:
```
- START [CALIBRATION]: Add ≥2 worked examples per severity level in x-review architecture lens — traces to RC: "severity rubric lacks anchors"
- STOP [PROCESS]: Skipping plan-check before execute phase — traces to RC: "scope creep in 3 of 5 projects"
```

Bad (DO NOT write like this):
```
- START: Be more thorough in reviews
- STOP: Making mistakes in severity assessment
```

#### Output Format

```
🪞 [reflect] Complete

## Lessons
{Key insights derived from Phases 3-4}

## Behavior Changes
For each root cause from Phase 3, derive ONE action:

- {KEEP|STOP|START} [{ACTION_TYPE}]: {specific, verifiable action} — traces to RC: "{root cause}"

## Application
Save this lesson to CLAUDE.md?
1) Save — Auto-apply from next session
2) Record only — Store in .xm/humble/ only (no auto-apply)
3) Ignore — Situational, no need to generalize
```

When the user selects "Save":
```
Add to CLAUDE.md:
## Lessons (x-humble)
- STOP: {What to stop} — {rationale, date}
- START: {What to start} — {rationale, date}
```

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

## Natural Language Mapping

| User says | Command |
|-----------|---------|
| "let's reflect", "look back", "reflect" | `reflect` |
| "why did you do that?", "why that judgment?" | `review "the judgment in question"` |
| "what did we learn?", "show lessons" | `lessons` |
| "put this in CLAUDE.md" | `apply L{N}` |
| "retrospective history" | `history` |
| "that lesson was wrong" | `lessons deprecate L{N}` |
