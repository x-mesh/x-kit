# Self-Score Protocol

Reference for agents scoring their own output on a 1-10 scale. Used by all x-op strategies.

## Self-Score Protocol

All strategies include a `## Self-Score` block in the final output. The leader self-scores based on rubric after strategy completion.

### Strategy-Rubric mapping

| Category | Strategies | Default Rubric | Criteria (weight) |
|----------|-----------|----------------|-------------------|
| Code analysis | review, red-team, monitor | code-quality | correctness 0.30, readability 0.20, maintainability 0.20, security 0.20, test-coverage 0.10 |
| Argument/analysis | refine, tournament, debate, council, socratic, hypothesis, investigate | general | accuracy 0.25, completeness 0.25, consistency 0.20, clarity 0.20, hallucination-risk 0.10 |
| Task decomposition | scaffold, decompose, distribute, chain | plan-quality | completeness 0.30, actionability 0.30, scope-fit 0.20, risk-coverage 0.20 |
| Ideation | brainstorm, persona | general | accuracy 0.25, completeness 0.25, consistency 0.20, clarity 0.20, hallucination-risk 0.10 |
| Pipeline | compose | last strategy's rubric | - |

Override with `--rubric <name>` flag.

### Self-Score output format

Appended to the end of every strategy's final output:
```
## Self-Score
| Criterion | Score | Note |
|-----------|-------|------|
| {criterion1} | {1-10} | {one-line rationale} |
| {criterion2} | {1-10} | {one-line rationale} |
| ... | ... | ... |
| **Overall** | **{weighted average}** | |
```

Scoring scale: 1=fail, 5=baseline, 7=good, 10=excellent.

### Hallucination Self-Check (4Q)

After computing Self-Score and BEFORE presenting the final output, the leader answers 4 verification questions. This is a lightweight self-check (~100 tokens) that fills the gap between "no check" and the heavyweight `x-eval --grounded` judge panel.

**4 Questions (answer each with evidence or "N/A"):**

1. **Evidence exists?** — Every factual claim cites a source (file:line, URL, tool output, agent quote). Claims without sources → flag as UNVERIFIED.
2. **Requirements addressed?** — Enumerate each element of the original task/topic. For each: covered / partially covered / not covered.
3. **No unverified assumptions?** — List assumptions made during the strategy. For each: cite evidence or mark ASSUMED.
4. **Internal consistency?** — Do findings/arguments contradict each other? Does the verdict follow from the evidence?

**Output format** (appended after Self-Score table):

```
### 4Q Check
| # | Question | Status | Note |
|---|----------|:------:|------|
| 1 | Evidence | ✅/⚠️ | {N verified, M unverified} |
| 2 | Requirements | ✅/⚠️ | {N/M covered} |
| 3 | Assumptions | ✅/⚠️ | {N assumptions, M unverified} |
| 4 | Consistency | ✅/⚠️ | {consistent / conflicts noted} |
```

**Escalation rule:** If 2+ questions are ⚠️, append recommendation: `"⚠ 2+ items flagged. Consider: /x-eval score --grounded for tool-verified evaluation."`

**Rules:**
- 4Q is mandatory for all strategies (same scope as Self-Score)
- 4Q does NOT replace Self-Score — it supplements it (Self-Score = numeric quality, 4Q = factual integrity)
- 4Q does NOT use tools — it is text-only self-reflection. For tool-assisted verification, use `x-eval --grounded`
- Keep answers concise — counts and flags, not paragraphs

## Applies to

Used by: all x-op strategies, x-agent solve/consensus/swarm
