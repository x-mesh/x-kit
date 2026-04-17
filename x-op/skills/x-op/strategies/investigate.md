# Strategy: investigate

Multi-angle investigation → synthesis → gap analysis. Specialized for exploring unknowns, technical comparisons, and codebase understanding.

## Phase 1: SCOPE
> 🔎 [investigate] Phase 1: Scope

Leader determines the investigation scope:
- `--target` → Confirm target files/directories
- `--angles` → Parse investigation angles (auto-generated from topic if absent)
- Match angle count to agent count (merge if exceeding)

Default angles (auto-selected by topic):
| Topic pattern | Detection criteria | Default angles |
|--------------|-------------------|----------------|
| Codebase | `--target` present or file/module name mentioned | `structure`, `data-flow`, `dependencies`, `conventions` |
| Technical comparison | Contains "vs", "versus", "compared", "comparison" | `performance`, `ecosystem`, `dx`, `tradeoffs` |
| Security/auth | Contains "auth", "security", "authentication" | `authentication`, `authorization`, `attack-surface`, `data-protection` |
| Performance/bottleneck | Contains "slow", "latency", "performance", "bottleneck" | `profiling`, `architecture`, `data-access`, `concurrency` |
| General | No pattern matched | `overview`, `mechanics`, `tradeoffs`, `alternatives` |

**Call AskUserQuestion to confirm before Phase 2. Show phase results first.**

## Phase 2: EXPLORE
> 🔎 [investigate] Phase 2: Explore ({N} angles)

broadcast — each agent gets a different investigation angle prompt. Prompt varies by `--depth`:

**shallow (default):**
```
"## Investigation: {TOPIC}
Angle: {ANGLE_NAME} — {ANGLE_DESCRIPTION}
Target: {--target or 'general'}
Depth: shallow — max 5 files, no web search

Investigate from the '{ANGLE_NAME}' angle:
1. Collect specific facts (file reads only, no web search)
2. Cite source for each finding (file path)
3. Confidence per finding: HIGH / MEDIUM / LOW
4. Flag unverifiable items (unknowns)
5. Self-assessment: investigation thoroughness 1-10, CONFIDENT or UNCERTAIN

## Findings / ## Unknowns / ## Self-Assessment
Tag each finding with its dimension. Findings on the same dimension across agents will be cross-validated.
300 words max."
```

**deep:**
```
"## Investigation: {TOPIC}
Angle: {ANGLE_NAME} — {ANGLE_DESCRIPTION}
Target: {--target or 'general'}
Depth: deep — max 15 files, web search allowed

Conduct a deep investigation from the '{ANGLE_NAME}' angle:
1. Collect specific facts (file reads, web search allowed)
2. Cite source for each finding (file path, URL, inference)
3. Confidence per finding: HIGH / MEDIUM / LOW
4. Flag unverifiable items (unknowns)
5. Self-assessment: investigation thoroughness 1-10, CONFIDENT or UNCERTAIN

## Findings / ## Unknowns / ## Self-Assessment
Tag each finding with its dimension. Findings on the same dimension across agents will be cross-validated.
500 words max."
```

**exhaustive:**
```
"## Investigation: {TOPIC}
Angle: {ANGLE_NAME} — {ANGLE_DESCRIPTION}
Target: {--target or 'general'}
Depth: exhaustive — max 30 files, web search + cross-validation required

Conduct an exhaustive investigation from the '{ANGLE_NAME}' angle:
1. Collect specific facts (file reads, web search, cross-validation)
2. Cite source for each finding (file path, URL, inference)
3. Confidence per finding: HIGH / MEDIUM / LOW
4. Explicitly tag findings that may overlap with other angles
5. Flag unverifiable items (unknowns)
6. Self-assessment: investigation thoroughness 1-10, CONFIDENT or UNCERTAIN

## Findings / ## Unknowns / ## Self-Assessment
Tag each finding with its dimension. Findings on the same dimension across agents will be cross-validated.
700 words max."
```

## Phase 2.5: CROSS-VALIDATE (`--depth deep|exhaustive` only)
> 🔎 [investigate] Phase 2.5: Cross-Validate

Auto-activated for `--depth deep` and above. Applies the council CROSS-EXAMINE pattern:

broadcast — send other agents' Findings to each agent:
```
"## Cross-Validation: {ANGLE_NAME}
Your investigation results: {own Phase 2 Findings}
Other angles' results: {other agents' Findings summary}

Read the other angles' results and:
1. 1-2 findings you agree with + rationale
2. 1-2 findings you question + reason
3. Anything to revise/augment in your own findings
200 words max."
```

**Call AskUserQuestion to confirm before Phase 3. Show phase results first.**

## Phase 3: SYNTHESIZE
> 🔎 [investigate] Phase 3: Synthesize

Leader synthesizes all results using structured rules:

**Cross-validation rules:**
- 2+ angles agree: confidence → confirmed HIGH
- 1 angle only: retain original confidence
- Findings endorsed in Phase 2.5: count as +1 angle

**Conflict resolution rules:**
- Contradictory findings on the same topic: tag `[CONFLICT]` → pass to Phase 4 as gap
- Majority rule (3+ angles agree vs 1 dissent): adopt majority, annotate minority opinion

**Structuring:**
- Reorganize by theme rather than by angle
- Assign cross-validation score per theme

**Self-assessment aggregation:**
- Average agent Self-Assessment < 6: display "⚠ Further investigation recommended"
- UNCERTAIN agent ratio > 50%: add deeper investigation gap to Phase 4

**Call AskUserQuestion to confirm before Phase 4. Show phase results first.**

## Phase 4: GAP ANALYSIS
> 🔎 [investigate] Phase 4: Gap Analysis

delegate (foreground):
```
"## Gap Analysis: {TOPIC}
Synthesis result: {Phase 3 synthesis}
Reported unknowns: {Phase 2 Unknowns aggregated}

Analyze what is still unknown:
1. List of knowledge gaps
2. How to close each gap (files to read, experiments to run, people to ask)
3. Importance: CRITICAL / IMPORTANT / NICE-TO-HAVE
4. Suggest appropriate x-op strategy for gap closure:
   - Ambiguous findings → debate or hypothesis
   - Deep code analysis needed → review or red-team
   - Multiple perspectives needed → persona or council
   - Iterative refinement needed → refine
200 words max."
```

## Final Output
```
🔎 [investigate] Complete — {N} angles, {M} findings, {G} gaps

## Findings
| # | Finding | Confidence | Sources | Angles |
|---|---------|------------|---------|--------|
| 1 | {finding} | HIGH | src/auth.ts:42 | structure, data-flow |
| 2 | {finding} | MEDIUM | official docs | dependencies |

## Key Insights
- {3-5 key insights}

## Knowledge Gaps
| # | Gap | Importance | Suggested Action |
|---|-----|------------|-----------------|
| 1 | {unknown area} | CRITICAL | → hypothesis "..." |
| 2 | {unknown area} | IMPORTANT | → review --target src/ |

## Confidence Summary
- HIGH: {N} ({P}%)
- MEDIUM: {N} ({P}%)
- LOW: {N} ({P}%)
```
