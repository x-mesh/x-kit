# Session: reflect

Structured retrospective workflow — surface judgment path, identify failure causes, detect cognitive biases, extract lessons, and propose behavior changes.

## Phase 0: CHECK-IN — Verify previous commitments

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

## Phase 1: RECALL — What did we do

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

## Phase 2: IDENTIFY — What didn't go well

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

## Phase 3: ANALYZE — Why was that judgment made

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

## Phase 4: ALTERNATIVE — What should have been done

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

## Phase 5: COMMIT — What to change

> 🪞 [reflect] Phase 5: Commit

Organize retrospective results into lessons. **Lesson sharing, not rule enforcement.**

### Action Item Quality Contract

Every action must pass this checklist:
1. **Verifiable** — Can you check if this is being done? "Be more careful" → FAIL. "Run tests before committing" → PASS.
2. **Scoped** — Does it target a specific phase, tool, or artifact? "Improve code quality" → FAIL. "Add --strict flag to plan-check" → PASS.
3. **Derived from root cause** — Does it trace to a specific Phase 3 finding? If not, it's speculation.

### Action Type Taxonomy

Map each root cause to the appropriate action type:

| Root Cause Type | Action Type | Template |
|----------------|-------------|----------|
| Missing check/validation | **PROCESS** | "Add {check} at {phase/step} before {action}" |
| Bias (from Bias Dictionary) | **PROMPT** | "Add {disambiguation rule/question} to {SKILL.md section}" |
| Missing information | **CONTEXT** | "Require {data source} before starting {phase}" |
| Wrong tool/approach | **TOOL** | "Use {alternative} instead of {current} when {condition}" |
| Calibration gap | **CALIBRATION** | "Add {worked example/threshold} to {criteria section}" |

### Good vs Bad Action Examples

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

### Output Format

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

## Applies to

Invoked by x-humble routing when reflecting on completed work, failures, or non-trivial outcomes.
