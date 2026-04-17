# Dimension Anchors

Reference for tagging agent outputs with structured dimensions. Used by x-op strategies, x-review lenses, x-eval rubrics, and x-build research synthesis.

## Dimension Anchors by Strategy Category

Agents must tag output by dimension BEFORE generating content. This prevents overlap and ensures coverage.

| Category | Strategies | Dimension Pool |
|----------|-----------|---------------|
| Argument/analysis | refine, tournament, debate, council, socratic, hypothesis, investigate | `feasibility`, `scalability`, `maintainability`, `cost`, `risk`, `performance`, `security`, `dx` |
| Code analysis | review, red-team, monitor | `correctness`, `security`, `performance`, `resilience`, `testability`, `readability` |
| Task decomposition | scaffold, decompose, distribute, chain | `scope-clarity`, `dependency-minimality`, `parallelizability`, `testability`, `interface-completeness` |
| Ideation | brainstorm, persona | `novelty`, `feasibility`, `impact`, `effort`, `risk` |

Rule: The **leader** pre-assigns dimensions to agents before generation. Agents do NOT freely pick dimensions — the leader selects the most relevant 3 from the pool based on the topic and assigns them. This ensures cross-trial consistency while maintaining relevance.

Leader dimension assignment (strategy-dependent):
- **Deterministic strategies** (review, red-team, monitor, scaffold, decompose, distribute, chain): Leader pre-assigns fixed dimensions. Same input → same dimensions.
- **Exploratory strategies** (debate, refine, tournament, brainstorm, council, socratic, persona, hypothesis, investigate): Leader selects the most relevant dimensions but diversity across trials is expected and valuable. Consistency is measured by verdict/conclusion, not by dimension selection.

## Agent Output Quality Contract

1. **Evidence-based** — Every claim must cite a source: `file.ts:123` with code quoted, command output, executed test result, cited URL + quoted passage, or another agent's output referenced by ID/phase.
2. **Falsifiable** — States a claim that could be proven wrong. "This might help" → FAIL. "This approach fails when concurrent users exceed 1K" → PASS.
3. **Dimension-tagged** — Labels which dimension it addresses. Two arguments on the same dimension must be merged.

### Good vs Bad Agent Output

Good: `[feasibility] Requires only stdlib — no new deps, deploys on existing infra. Fails if payload exceeds 1MB (no streaming). Evidence: src/server/upload.ts:42 uses Buffer.concat with no size guard.`

Bad: `This approach is more practical and easier to implement.`

## Applies to

Used by: x-op (refine/tournament/debate/council/socratic/hypothesis/investigate/review/red-team/monitor/scaffold/decompose/distribute/chain/brainstorm/persona), x-review (lens prompts), x-eval (rubrics), x-build (research synthesis)
