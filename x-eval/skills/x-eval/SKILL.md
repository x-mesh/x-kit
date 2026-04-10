---
name: x-eval
description: Agent output quality evaluation — multi-rubric scoring, strategy benchmarking, and A/B prompt experiments
---

<Purpose>
x-eval structurally evaluates the quality of AI agent outputs. Independent judge agents score outputs using multi-dimensional rubrics, supporting strategy/model benchmarking and A/B prompt experiments.
No external dependencies. Evaluation results are stored in `.xm/eval/`.
</Purpose>

<Use_When>
- User wants to score or grade agent output against a rubric
- User says "evaluate", "grade", "quality check", "score", "eval"
- User wants to compare two outputs and pick the better one
- User says "compare", "which is better?", "A vs B"
- User wants to benchmark strategies or models on the same task
- User says "bench", "benchmark", "which strategy is better?"
- User wants to create or list evaluation rubrics
- User says "rubric", "evaluation criteria"
</Use_When>

<Do_Not_Use_When>
- Simple factual questions that don't need quality evaluation
- Strategy execution without evaluation (use x-op instead)
- Project lifecycle management (use x-build instead)
</Do_Not_Use_When>

# x-eval — Agent Output Quality Evaluation

Multi-dimensional rubric scoring, strategy benchmarking, A/B prompt experiments.
Judge agents fan out for independent evaluation, then aggregate results.

## Mode Detection

Read mode from `.xm/config.json` (`mode` field). Default: `developer`.

**Developer mode**: Use technical terms (rubric, benchmark, verdict, score, dimension). Concise.

**Normal mode**: Guide in plain, accessible language.
- "rubric" → "평가 기준", "benchmark" → "비교 평가", "verdict" → "판정", "dimension" → "평가 항목"
- "score" → "점수", "judge" → "심사", "adversarial judge" → "검증 심사", "standard judge" → "기본 심사"
- "bias check" → "교차 검증", "sigma" → "일치도", "consensus" → "합의"
- Use polite tone ("~하세요" style), lead with the most important information

## Arguments

User provided: $ARGUMENTS

## AskUserQuestion Dark-Theme Rule

**CRITICAL:** The `question` field in AskUserQuestion is invisible on dark terminals.

**Visibility map:**
| Element | Visible | Use for |
|---------|---------|---------|
| `header` | ✅ YES | Short context tag (e.g., "x-op bump", "Pipeline") |
| `question` | ❌ NO | Keep minimal — user cannot see this text |
| option `label` | ✅ YES | Primary info — must be self-explanatory |
| option `description` | ✅ YES | Supplementary detail |

**Always follow this pattern:**
1. Output ALL context (descriptions, status, analysis) as **regular markdown text** BEFORE calling AskUserQuestion
2. `header`: put the key context here (visible, max 12 chars)
3. `question`: keep short, duplicate of header is fine (invisible to user)
4. Option `label` + `description`: carry all decision-relevant information

**WRONG:** Putting context in `question` field → user sees blank space above options
**RIGHT:** Print context as markdown first, use `header` for tag, options for detail

## Routing

First word of `$ARGUMENTS`:
- `score` → [Subcommand: score]
- `compare` → [Subcommand: compare]
- `bench` → [Subcommand: bench]
- `consistency` → [Subcommand: consistency]
- `diff` → [Subcommand: diff]
- `rubric` → [Subcommand: rubric]
- `report` → [Subcommand: report]
- `list` or empty input → [Subcommand: list]

---

## Subcommand: list

```
x-eval — Agent Output Quality Evaluation

Commands:
  score <content> --rubric <name|criteria>     Score content against rubric
  compare <output-a> <output-b> [--judges N]   Compare two outputs with judge panel
  bench <task> --strategies "s1,s2"            Benchmark strategies/models
       [--models "m1,m2"] [--trials N]
  consistency [plugin] [--trials N]             Measure plugin output consistency (default: all changed)
  diff [--from <commit>] [--to <commit>]      Measure skill/plugin changes + quality delta
  rubric create <name> --criteria "c1,c2,c3"  Create custom rubric
  rubric list                                   List available rubrics
  report [session]                              Show evaluation report
  list                                          Show this help

Options:
  --rubric <name>           Built-in or custom rubric name
  --judges N                Number of judge agents (default 3)
  --model sonnet|opus|haiku Judge model (default sonnet)
  --trials N                Repetitions per strategy (default 3, for bench)
  --strategies "s1,s2"      Comma-separated strategy names (for bench)
  --models "m1,m2"          Comma-separated model names (for bench)

Built-in Rubrics:
  code-quality    correctness, readability, maintainability, security, test-coverage
  review-quality  coverage, actionability, severity-accuracy, false-positive-rate
  plan-quality    completeness, actionability, scope-fit, risk-coverage
  general         accuracy, completeness, consistency, clarity, hallucination-risk

Examples:
  /x-eval score "function add(a,b){return a+b}" --rubric code-quality
  /x-eval compare output-a.md output-b.md --judges 5
  /x-eval bench "find the bug" --strategies "refine,debate,tournament" --trials 3
  /x-eval diff                                  # Analyze changes: latest release vs HEAD
  /x-eval diff --from abc1234 --to HEAD         # Analyze changes between specific commits
  /x-eval rubric create strict-code --criteria "correctness,edge-cases,complexity"
  /x-eval report
```

---

## Subcommand: score

**N judge agents independently score content against a rubric.**

### Parsing

From `$ARGUMENTS`:
- After `score` = content to evaluate (quoted text or file path)
- `--rubric <name>` = rubric name or criteria (comma-separated custom criteria)
- `--judges N` = number of judge agents (default 3)
- `--model` = judge model (default sonnet)

If content is a file path, read the file and pass its contents.
If `--rubric` is empty, use the `general` rubric.
- `--grounded` = enable Agent-as-Judge mode (judges use Read/Bash/Grep tools to verify claims)

### Judge Count

Judge count is specified via `--judges N`, or uses the agent_max_count value (default 4).

`--judges N` overrides agent_max_count when specified.

### Judge Panel Composition (Bias Mitigation)

**N judges from the same model = N copies of the same bias.** The judge panel must diversify its biases.

**Default 3-judge composition:**

| Judge | Model | Role | Purpose |
|-------|-------|------|---------|
| Judge 1 | sonnet | Standard Judge | Standard rubric scoring |
| Judge 2 | sonnet | Standard Judge | Independent scoring (same prompt) |
| Judge 3 | sonnet | **Adversarial Judge** | Defect detection specialist — separate prompt below |

**5+ judge composition (--judges 5 or more):**

| Judge | Model | Role |
|-------|-------|------|
| Judge 1-2 | sonnet | Standard Judge |
| Judge 3 | opus | Standard Judge (different model perspective) |
| Judge 4 | sonnet | Adversarial Judge |
| Judge 5 | haiku | Fast Judge (cost-efficient cross-validation) |

### Judge Prompts

**Standard Judge Prompt** — Invoke via Agent tool (`run_in_background: true`):

```
## Evaluation Judge

Rubric: {rubric_name}
Criteria: {criteria_list}

Content to evaluate:
---
{content}
---

For each criterion, provide:
- Score: 1–10 (1=unacceptable, 5=acceptable, 10=excellent)
- Justification: 1–2 sentences explaining the score

Then compute the weighted average as Final Score.
Default weights are equal unless the rubric specifies otherwise.

Output format (strict):
Criterion: <name> | Score: <N> | Reason: <justification>
...
Final: <weighted_avg>/10
```

**Adversarial Judge Prompt** — Assign to the last judge:

```
## Adversarial Evaluation Judge

Rubric: {rubric_name}
Criteria: {criteria_list}

Content to evaluate:
---
{content}
---

Your role is to find what's WRONG with this output. Assume it contains errors until proven otherwise.

For each criterion, actively look for:
- Claims without evidence (file:line cited but does the code actually do what's claimed?)
- Speculative findings ("could be", "might", "if X happens later")
- Fabricated details (references to code/files/functions that may not exist)
- Severity inflation (Low issues labeled Medium+)

Score LOWER when you find unverified claims. A polished, professional-looking output with fabricated evidence should score LOWER than a rough output with verified facts.

Output format (strict):
Criterion: <name> | Score: <N> | Reason: <justification>
Fabrication check: <list any claims you could not verify, or "none found">
Final: <weighted_avg>/10
```

Each judge scores independently. No identifiers beyond role are assigned to prevent order bias.

### Grounded Mode (`--grounded`)

When `--grounded` is specified, judges switch from text-only reasoning to **tool-assisted verification**.

**Grounded Standard Judge Prompt** — replaces the standard prompt when `--grounded`:

```
## Grounded Evaluation Judge

Rubric: {rubric_name}
Criteria: {criteria_list}

Content to evaluate:
---
{content}
---

You are an Agent-as-Judge. You MUST use tools to verify claims before scoring.

For each criterion:
1. Identify verifiable claims in the content (file paths, function names, behavior assertions)
2. Use Read tool to check if cited files/functions exist
3. Use Grep tool to verify code patterns or references
4. Use Bash tool to run tests or check build status when relevant
5. Score based on VERIFIED facts, not reasoning alone

Scoring rules:
- Verified claim with evidence: full credit
- Unverifiable claim (no tool can check): mark as "unverifiable", neutral score
- Falsified claim (tool proves it wrong): score 1 for that criterion
- "It should work" without execution evidence: score ≤ 3

Output format (strict):
Criterion: <name> | Score: <N> | Evidence: <tool output or "reasoning only"> | Reason: <justification>
...
Verified: <count>/<total claims> | Falsified: <count> | Unverifiable: <count>
Final: <weighted_avg>/10
```

**Grounded Adversarial Judge Prompt** — replaces the adversarial prompt when `--grounded`:

```
## Grounded Adversarial Judge

Rubric: {rubric_name}
Criteria: {criteria_list}

Content to evaluate:
---
{content}
---

Your role is to DISPROVE claims in this output using tools.

For every factual claim:
1. Use Read to check if cited files exist and contain what's claimed
2. Use Grep to search for referenced functions/patterns
3. Use Bash to run any verifiable commands mentioned
4. Track: claim → tool used → result → verdict (confirmed/falsified/unverifiable)

Score LOWER for falsified claims. A single falsified file:line reference = criterion score capped at 3.

Output format (strict):
Criterion: <name> | Score: <N> | Reason: <justification>
Verification log:
  - Claim: "<claim>" | Tool: Read/Grep/Bash | Result: confirmed/falsified/unverifiable
  ...
Fabrication check: <falsified claims list, or "none found">
Final: <weighted_avg>/10
```

**When NOT `--grounded`:** Use the original text-only prompts above (default behavior preserved).

**Result schema addition:** When `--grounded`, append to result JSON:
```json
{
  "grounded": true,
  "evidence_sources": { "tool_call": N, "reasoning_only": M },
  "verified_ratio": N / (N + M)
}
```

### Reusable Judge Prompt (Standard Prompt)

This prompt is reused across the x-kit ecosystem whenever a judge panel is needed:
- **x-build prd-gate**: PRD scoring (rubric: plan-quality or prd-gate's 5-criteria rubric)
- **x-op --verify**: Strategy result scoring (rubric: see strategy-rubric mapping table)
- **x-eval score**: General scoring (rubric: user-specified or built-in)

Callers only need to substitute `{rubric_name}`, `{criteria_list}`, and `{content}`.
If weights are not specified, equal weights are assigned to all criteria.

### Consensus Assessment (sigma-based + bias check)

| sigma | Consensus | Action |
|---|------|------|
| < 0.8 | High agreement | **Shared bias risk — compare against Adversarial Judge score.** If adversarial is 2+ points lower, standard judges are sharing bias. Apply adversarial score with extra weight (1.5x). |
| 0.8–1.5 | Medium | Use scores, flag with caution. Show Adversarial Judge opinion separately. |
| > 1.5 | Low — genuine disagreement | Summon 1 additional judge (different model). If σ > 1.5 after re-scoring, mark as "no verdict". |

**Key principle: Low σ means "needs verification", not "certainty".**

When the same model converges on the same prompt, this may not be a signal of accuracy — it may just be repeating the model's mode. The Adversarial Judge is the only cross-validation mechanism.

**Adversarial divergence interpretation:**

| Standard avg | Adversarial | Gap | Interpretation |
|---|---|---|---|
| 8.0 | 7.5 | 0.5 | Normal — difference in perspective |
| 8.0 | 5.0 | 3.0 | **Shared bias detected** — adversarial caught defects that standard judges missed. Final score = (standard × 0.6 + adversarial × 0.4) |
| 8.0 | 2.0 | 6.0 | **Serious quality issue** — looks good on the surface but has fundamental flaws. Final score = adversarial score takes priority |

### Result Aggregation and Output

After all judges complete, aggregate:

```
📊 [eval] Score: 7.2/10 (3 judges — 2 standard + 1 adversarial)
Rubric: code-quality

| Criterion       | J1 (std) | J2 (std) | J3 (adv) | Avg  |
|-----------------|----------|----------|----------|------|
| Correctness     |  9       |  8       |  5       | 7.3  |
| Readability     |  7       |  8       |  7       | 7.3  |
| Maintainability |  8       |  7       |  7       | 7.3  |
| Security        |  6       |  7       |  3       | 5.3  |
| Test Coverage   |  8       |  9       |  8       | 8.3  |

Standard avg: 7.7/10 | Adversarial: 5.8/10 | Gap: 1.9
Bias check: ⚠ Gap > 1.5 — 표준 judge가 놓친 결함 있음. Adversarial 가중 반영.
Adjusted score: 7.2/10

Adversarial findings:
- Correctness: "2 of 6 findings reference files not confirmed in diff"
- Security: "CORS finding lacks credential-mode evidence"

Notable: Adversarial judge가 정확도 문제를 잡음 — 표준 judge만으로는 놓쳤을 편향.
```

**Score calculation:**
- σ < 0.8 between standard judges (high agreement) → check for shared bias
- Adversarial gap > 1.5 → adjusted score = standard × 0.6 + adversarial × 0.4
- Adversarial gap ≤ 1.5 → adjusted score = simple average (all judges)

### Storage

Save results to `.xm/eval/results/{timestamp}-score.json`.

---

## Subcommand: compare

**A judge panel compares two outputs and determines a winner.**

### Parsing

From `$ARGUMENTS`:
- First argument after `compare` = output-a (text or file path)
- Second argument = output-b (text or file path)
- `--judges N` = number of judges (default 3)
- `--rubric <name>` = comparison rubric (default `general`)
- `--model` = judge model (default sonnet)

### Position Bias Prevention

Randomly flip A/B order for each judge:

```
Judge 1: [Output A] vs [Output B]
Judge 2: [Output B] vs [Output A]   ← order reversed
Judge 3: [Output A] vs [Output B]
```

Judge prompts refer to "First Output" / "Second Output" only (A/B labels hidden).
During aggregation, restore original order to compute correct A/B mapping.

### Judge Prompt

```
## Comparison Judge

Rubric: {rubric_name}
Criteria: {criteria_list}

Evaluate two outputs on each criterion. Pick the better one or declare a tie.

First Output:
---
{output_x}
---

Second Output:
---
{output_y}
---

For each criterion:
Criterion: <name> | First: <score> | Second: <score> | Winner: First|Second|Tie | Reason: <1 sentence>

Overall Winner: First|Second|Tie
Overall reason: <1-2 sentences>
```

### Result Aggregation and Output

```
📊 [eval] Comparison: A vs B (3 judges)
Rubric: general

Winner: Output B (2/3 judges)

| Criterion     |   A  |   B  | Winner |
|---------------|------|------|--------|
| Accuracy      |  8.0 |  8.7 | B      |
| Completeness  |  7.3 |  8.0 | B      |
| Consistency   |  8.0 |  7.7 | A      |
| Clarity       |  8.3 |  7.0 | A      |
| Hallucination |  7.7 |  8.3 | B      |

Overall: A=7.9 vs B=7.9 → Marginal B win (tie-break: Accuracy)

Judge consensus: Medium (2/3 agree on winner)
```

**Tiebreak rule:** If overall averages are equal, decide by the rubric's first criterion (the most important one).

### Storage

Save results to `.xm/eval/results/{timestamp}-compare.json`.

---

## Subcommand: bench

**Run the same task with multiple strategies/models, evaluate each output, and find the optimal one.**

### Parsing

From `$ARGUMENTS`:
- After `bench` = task description (quoted text)
- `--strategies "s1,s2,s3"` = strategies to benchmark (comma-separated)
- `--models "m1,m2"` = models to benchmark (default: current model)
- `--trials N` = repetitions per strategy (default 3)
- `--rubric <name>` = evaluation rubric (default `general`)
- `--judges N` = number of judges (default 3)

### Execution Flow

1. **Matrix generation**: Build list of `strategies × models × trials` combinations
2. **Parallel execution**: Run each combination via x-op strategy (concurrently when possible)
3. **Evaluation**: Score each output using [Subcommand: score] logic
4. **Aggregation**: Compute per-strategy average score, cost, and elapsed time
5. **Recommendation**: Recommend optimal strategy by efficiency metrics like score/$, score/time

**Strategy name → x-op mapping:**

| bench strategy | x-op subcommand |
|------------|----------------|
| `refine` | `/x-op refine` |
| `debate` | `/x-op debate` |
| `tournament` | `/x-op tournament` |
| `chain` | `/x-op chain` |
| `review` | `/x-op review` |
| `brainstorm` | `/x-op brainstorm` |
| unregistered name | fallback to direct Agent invocation |

If x-op is unavailable, fall back to executing each strategy as a simple Agent prompt.

### Result Aggregation and Output

```
📊 [eval] Benchmark: 3 strategies × 3 trials
Task: "Find the bug in this code"
Rubric: general

| Strategy   | Avg Score | Trials | Est. Cost | Avg Time | Score/$ |
|------------|-----------|--------|-----------|----------|---------|
| refine     |      8.2  |      3 |     $0.12 |      45s |    68.3 |
| debate     |      7.8  |      3 |     $0.08 |      30s |    97.5 |
| tournament |      8.5  |      3 |     $0.15 |      55s |    56.7 |

Best quality:  tournament (8.5/10)
Best value:    debate (97.5 score/$)
Recommendation: debate (best quality-cost balance at 7.8/10, $0.08/run)

Score variance across trials:
  refine     σ=0.3  (consistent)
  debate     σ=0.8  (moderate variance)
  tournament σ=0.2  (consistent)
```

**Recommendation logic:**
- `best quality`: Highest Avg Score
- `best value`: Highest Score/$
- `recommendation`: Strategy with Score >= 7.5 and highest Score/$. If none, highest Score/$.

### Storage

Save results to `.xm/eval/benchmarks/{timestamp}-bench.json`.

### x-op compose Integration

Leverage bench results to optimize x-op compose pipelines:

**Compose preset benchmarking:**
```bash
/x-eval bench "v2 feature plan" --strategies "brainstorm|tournament|refine,brainstorm|refine,brainstorm|council" --trials 2
```

Each strategy is a compose pipeline separated by `|`. Bench executes each pipeline via x-op compose and scores the final output.

| Pipeline | Avg Score | Cost | Score/$ |
|----------|-----------|------|---------|
| brainstorm\|tournament\|refine | 8.5 | $0.45 | 18.9 |
| brainstorm\|refine | 7.2 | $0.25 | 28.8 |
| brainstorm\|council | 7.8 | $0.35 | 22.3 |

**Using results:**
- Recommend the optimal pipeline as the `--strategy` value for x-build tasks
- Include the compose pipeline in the bench result's `recommendation` field

---

## Subcommand: consistency

**Measure whether a plugin produces consistent outputs across repeated trials on the same input.**

Use to verify SKILL.md prompt programs are deterministic — catches calibration drift after model updates or SKILL.md edits.

### Parsing

From `$ARGUMENTS`:
- After `consistency` = plugin name (optional, default: auto-detect changed plugins)
- `--trials N` = repetitions per plugin (default 3)
- `--input "..."` = fixed input to test with (default: auto-generate from recent git diff)

### Plugin Test Configurations

Each plugin has a predefined test configuration:

| Plugin | Strategy | Input | Measured dimensions |
|--------|----------|-------|---------------------|
| x-review | multi-lens review | `git diff HEAD~1` | verdict, finding count, severity distribution |
| x-solver | decompose | "How to solve {recent issue}?" | root causes, solution ranking (Spearman ρ) |
| x-op | debate | "{relevant architectural decision}" | judge verdict, key factor, argument overlap |
| x-probe | probe | "Should we build {feature}?" | verdict (PROCEED/RETHINK/KILL), premise count |
| x-build | plan-check | current project manifest | dimension scores, pass/fail consistency |

If `--input` is provided, use that instead of the default.

### Execution Flow

For each plugin to test:

1. **Prepare input**: Use `--input` or generate default from git/project state
2. **Run N trials**: Fan-out N independent agents with identical prompts
   - Each agent runs the plugin's core operation on the same input
   - Agents must NOT see each other's output
3. **Collect outputs**: Parse structured results from each trial
4. **Measure consistency**:

**Metrics computed per plugin:**

| Metric | Formula | Description |
|--------|---------|-------------|
| `verdict_consistency` | (count of most-common verdict) / N | Do trials agree on the final judgment? |
| `finding_overlap` | \|intersection\| / \|union\| across trials | Jaccard similarity of identified issues |
| `severity_consistency` | % of shared findings with same severity | Same issue → same severity? |
| `rank_correlation` | Mean Spearman ρ across trial pairs | For ranked outputs (solutions, strategies) |
| `overall_consistency` | Weighted average of above | Single 0.0–1.0 score |

**Two distinct metric systems by strategy type:**

### Deterministic Metrics (x-review, x-eval scoring)

For strategies where same input SHOULD produce same output:

| Metric | Weight | What it measures |
|--------|:------:|------------------|
| `verdict_consistency` | 0.40 | Same final judgment across trials |
| `finding_overlap` | 0.20 | Same issues identified (Jaccard similarity) |
| `severity_consistency` | 0.20 | Same finding → same severity |
| `rank_correlation` | 0.20 | Same priority ordering (Spearman ρ) |

### Exploratory Metrics (x-op, x-build planning, x-probe, x-humble, x-solver)

For strategies where diversity of exploration is valuable — same conclusion via different paths is GOOD:

| Metric | Weight | What it measures |
|--------|:------:|------------------|
| `verdict_stability` | 0.40 | Same conclusion/verdict across trials |
| `conclusion_quality` | 0.25 | Is conclusion evidence-based and falsifiable? (per Agent Output Quality Contract) |
| `coverage_breadth` | 0.20 | How many distinct dimensions explored across all trials? More = better |
| `core_convergence` | 0.15 | Do core elements (top root cause, top solution, fatal premises) converge? |

**Key difference**: Deterministic penalizes diversity. Exploratory REWARDS it.

- Deterministic: finding_overlap 3/3 = 1.0 (good), 1/3 = 0.33 (bad)
- Exploratory: coverage_breadth 8/8 dimensions = 1.0 (good), 3/8 = 0.375 (limited exploration)

### Plugin Classification

| Plugin | Strategy | Type | Rationale |
|--------|----------|------|-----------|
| x-review | multi-lens review | **deterministic** | Same diff → same findings expected |
| x-eval | rubric scoring | **deterministic** | Same input → same scores expected |
| x-op | debate, refine, etc. | **exploratory** | Diverse arguments = better deliberation |
| x-build | planning | **exploratory** | Diverse task approaches = better coverage |
| x-probe | premise extraction | **exploratory** | Diverse premises = more thorough probe |
| x-humble | retrospective | **exploratory** | Diverse actions = richer retrospective |
| x-solver | decompose, iterate | **exploratory** | Diverse hypotheses = faster diagnosis |

5. **Compare to baseline**: If previous benchmark exists in `benchmarks/`, compare and report delta

### Output

```
📊 [eval] Consistency: x-review (3 trials)

Input: git diff HEAD~1 (commit abc1234, 5 files, 120 lines)

| Metric | Score | Baseline | Delta |
|--------|:-----:|:--------:|:-----:|
| Verdict consistency | 1.00 | 1.00 | — |
| Finding overlap | 0.75 | 0.67 | +12% |
| Severity consistency | 1.00 | 0.33 | +200% ✅ |
| Rank correlation | — | — | — |
| **Overall** | **0.89** | **0.44** | **+102%** |

Status: PASS ✅ (threshold: 0.70)

Trials:
  T1: LGTM, 2 findings (1M, 1L)
  T2: LGTM, 1 finding (1M)
  T3: LGTM, 2 findings (1M, 1L)
```

### Pass/Fail Threshold

| Overall Score | Status |
|:-------------:|--------|
| ≥ 0.80 | PASS ✅ |
| 0.70 – 0.79 | WARN ⚠ — review calibration |
| < 0.70 | FAIL ❌ — SKILL.md needs tighter criteria |

### Storage

Save results to `benchmarks/{plugin}-consistency.json` (tracked in git).

Update `benchmarks/SUMMARY.md` with new data if changed.

### Multi-Plugin Mode

When no plugin is specified, auto-detect changed plugins and test all of them:

```bash
/x-eval consistency                    # Test all changed plugins
/x-eval consistency x-review           # Test specific plugin
/x-eval consistency --trials 5         # 5 trials for higher confidence
/x-eval consistency x-op --input "Should we use microservices?"
```

Output for multi-plugin:
```
📊 [eval] Consistency Suite

| Plugin | Trials | Overall | Baseline | Delta | Status |
|--------|:------:|:-------:|:--------:|:-----:|--------|
| x-review | 3 | 0.89 | 0.89 | — | PASS ✅ |
| x-solver | 3 | 0.92 | 0.917 | +0.3% | PASS ✅ |
| x-op | 3 | 0.75 | 0.733 | +2.3% | WARN ⚠ |

Overall: 2 PASS, 1 WARN, 0 FAIL
```

---

## Subcommand: diff

**Measure change volume and quality delta of x-kit plugins. Git-based quantitative analysis + optional quality comparison.**

### Parsing

From `$ARGUMENTS`:
- `diff` (no arguments) = last tag/release commit vs HEAD
- `--from <commit>` = start commit (default: previous release commit)
- `--to <commit>` = end commit (default: HEAD)
- `--quality` = compare before/after of changed SKILL.md files for quality (expensive)
- `--rubric <name>` = rubric for quality comparison (default: plan-quality)

### Phase 1: Quantitative Analysis (git-based, immediate)

Run git commands via Bash:

```bash
# Detect changed plugins
git diff --name-only {from}..{to} -- '*/skills/*/SKILL.md' '*/lib/*.mjs' '*/.claude-plugin/*.json'

# Per-plugin change volume
git diff --stat {from}..{to} -- 'x-build/' 'x-op/' 'x-eval/' 'x-kit/' ...

# SKILL.md line count change
git show {from}:{path} | wc -l   # before
wc -l {path}                      # after

# Commit count
git log --oneline {from}..{to} | wc -l

# Version change
git show {from}:package.json | grep version
cat package.json | grep version
```

### Phase 2: Structural Analysis (leader parses)

Read changed SKILL.md files and extract structural changes:
- Strategy/command count change (e.g., 16 → 18 strategies)
- Option count change (e.g., 15 → 22 options)
- Newly added sections
- Removed sections

### Phase 3: Quality Comparison (only with `--quality`)

For each changed SKILL.md, perform before/after A/B comparison:

1. Extract before version: `git show {from}:{path}`
2. After version: current file
3. A/B comparison using [Subcommand: compare] logic (judge panel)
4. Compute quality delta (score delta) for each plugin

### Final Output

```
📊 [eval] Diff: {from_short}..{to_short} ({N} commits)

## Change Summary
| Plugin | Files | +Lines | -Lines | Net |
|--------|-------|--------|--------|-----|
| x-op | 2 | +176 | -2 | +174 |
| x-build | 3 | +139 | -4 | +135 |
| x-eval | 1 | +44 | 0 | +44 |
| x-kit | 4 | +49 | 0 | +49 |
| **Total** | **10** | **+408** | **-6** | **+402** |

## Structural Changes
| Plugin | Metric | Before | After | Delta |
|--------|--------|--------|-------|-------|
| x-op | strategies | 16 | 18 | +2 |
| x-op | options | 15 | 22 | +7 |
| x-op | SKILL.md lines | 1200 | 1645 | +445 |
| x-build | phases | 5 | 5 | 0 |
| x-build | sub-steps | 6 | 9 | +3 |
| x-build | SKILL.md lines | 650 | 803 | +153 |

## Key Changes
- x-op: +investigate, +monitor strategies added
- x-op: Self-Score Protocol, --verify, Consensus Loop
- x-build: PRD Generation, PRD Review, plan-check --strict
- x-eval: Reusable Judge Prompt

## Versions
| Plugin | Before | After |
|--------|--------|-------|
| x-op | 1.0.0 | 1.3.0 |
| x-build | 1.0.0 | 1.2.0 |
| x-eval | 1.0.0 | 1.1.0 |
| x-kit | 1.0.0 | 1.6.0 |
```

With `--quality`:
```
## Quality Comparison (plan-quality rubric)
| Plugin | Before | After | Delta | Verdict |
|--------|--------|-------|-------|---------|
| x-op SKILL.md | 6.8 | 8.2 | +1.4 | ✅ improved |
| x-build SKILL.md | 7.0 | 8.5 | +1.5 | ✅ improved |
```

### Storage

Save results to `.xm/eval/diffs/{timestamp}-diff.json`.

### Storage Schema

```json
{
  "type": "diff",
  "timestamp": "ISO8601",
  "from": "commit-sha",
  "to": "commit-sha",
  "commits": 12,
  "plugins": {
    "x-op": {
      "files_changed": 2,
      "lines_added": 176,
      "lines_removed": 2,
      "structure": {
        "strategies": { "before": 16, "after": 18 },
        "options": { "before": 15, "after": 22 },
        "skill_lines": { "before": 1200, "after": 1645 }
      },
      "quality": { "before": 6.8, "after": 8.2, "delta": 1.4 }
    }
  },
  "summary": "..."
}
```

---

## Subcommand: rubric

**Create custom rubrics or list available ones.**

### rubric create

`/x-eval rubric create <name> --criteria "c1,c2,c3"`

- `<name>`: Rubric name (alphanumeric, hyphens allowed)
- `--criteria "c1,c2,c3"`: Evaluation criteria (comma-separated)
- `--weights "w1,w2,w3"`: Weights (optional, must sum to 1.0, default equal)
- `--description "..."`: Description (optional)

Criterion names are passed directly to the judge prompt. More specific names yield more consistent scoring.

Storage location: `.xm/eval/rubrics/<name>.json`

Output:
```
✅ [eval] Rubric 'strict-code' created
Criteria (3): correctness, edge-cases, complexity
Weights: equal (0.33 each)
Saved: .xm/eval/rubrics/strict-code.json
```

### rubric list

`/x-eval rubric list`

Shows both built-in and custom rubrics:

```
📋 [eval] Available Rubrics

Built-in:
  code-quality    correctness, readability, maintainability, security, test-coverage
  review-quality  coverage, actionability, severity-accuracy, false-positive-rate
  plan-quality    completeness, actionability, scope-fit, risk-coverage
  general         accuracy, completeness, consistency, clarity, hallucination-risk

Custom (.xm/eval/rubrics/):
  strict-code     correctness, edge-cases, complexity
```

---

## Subcommand: report

**Output a summary of evaluation results for the current or a specific session.**

### Parsing

- `report` (no arguments) = all results from current session
- `report <session-id>` = specific session results
- `report --all` = full history

Reads and aggregates from both `.xm/eval/results/` and `.xm/eval/benchmarks/`.

### Output

```
📊 [eval] Evaluation Report (current session)

Scores (3):
  2026-03-25 14:30  code-quality  7.8/10   src/auth.ts
  2026-03-25 14:45  general       8.2/10   "refactoring proposal"
  2026-03-25 15:00  plan-quality  6.9/10   sprint plan v2

Comparisons (1):
  2026-03-25 15:20  general       Winner: B  "response style A vs B"

Benchmarks (1):
  2026-03-25 15:40  3 strategies  Best: tournament (8.5)  Rec: debate

Session avg score: 7.6/10
```

---

## Built-in Rubrics

### code-quality

| Criterion | Description | Weight |
|-----------|-------------|--------|
| correctness | Logic is correct, handles edge cases, no bugs | 0.30 |
| readability | Clear naming, structure, minimal cognitive load | 0.20 |
| maintainability | Extensible, follows patterns, low coupling | 0.20 |
| security | No injection, input validated, secrets safe | 0.20 |
| test-coverage | Critical paths have tests or are testable | 0.10 |

### review-quality

| Criterion | Description | Weight |
|-----------|-------------|--------|
| coverage | All important issues found, nothing critical missed | 0.30 |
| actionability | Each finding has a clear fix suggestion | 0.30 |
| severity-accuracy | Critical bugs labeled critical, nits labeled nits | 0.25 |
| false-positive-rate | No valid code flagged as problematic | 0.15 |

### plan-quality

| Criterion | Description | Weight |
|-----------|-------------|--------|
| completeness | All requirements addressed by tasks | 0.30 |
| actionability | Each task is concrete and executor can start immediately | 0.30 |
| scope-fit | Plan fits the stated goal — not over or under | 0.20 |
| risk-coverage | Key risks and dependencies identified | 0.20 |

### general

| Criterion | Description | Weight |
|-----------|-------------|--------|
| accuracy | Factually correct, no errors | 0.25 |
| completeness | All aspects of the question addressed | 0.25 |
| consistency | No internal contradictions | 0.20 |
| clarity | Easy to follow, well structured | 0.20 |
| hallucination-risk | No unsupported claims or fabricated facts | 0.10 |

---

## Domain Rubric Presets

Domain-specific presets beyond the built-in rubrics. Viewable via `rubric list`.

### api-design

| Criterion | Description | Weight |
|-----------|-------------|--------|
| consistency | Naming, patterns, error format uniform across endpoints | 0.25 |
| completeness | All CRUD + edge cases covered, pagination, filtering | 0.25 |
| security | Auth, rate limiting, input validation, OWASP compliance | 0.25 |
| developer-experience | Clear errors, self-documenting, discoverable | 0.15 |
| extensibility | Versioning strategy, backward compatibility | 0.10 |

### frontend-design

| Criterion | Description | Weight |
|-----------|-------------|--------|
| visual-coherence | Color, typography, spacing create unified identity | 0.25 |
| originality | Custom decisions vs template defaults, avoids generic patterns | 0.25 |
| craft | Typography hierarchy, spacing rhythm, color harmony, contrast | 0.20 |
| usability | Intuitive navigation, accessible, responsive | 0.20 |
| performance | Minimal layout shift, fast paint, optimized assets | 0.10 |

### data-pipeline

| Criterion | Description | Weight |
|-----------|-------------|--------|
| correctness | Data transformations produce expected output, no data loss | 0.30 |
| reliability | Error handling, retry logic, idempotency, dead-letter queues | 0.25 |
| observability | Logging, metrics, alerting, data lineage tracking | 0.20 |
| efficiency | Batch sizing, parallelism, resource utilization | 0.15 |
| schema-safety | Schema evolution handled, backward/forward compatibility | 0.10 |

### security-audit

| Criterion | Description | Weight |
|-----------|-------------|--------|
| vulnerability-coverage | OWASP Top 10 addressed, injection/XSS/CSRF checked | 0.30 |
| auth-correctness | Authentication + authorization logic sound, no bypasses | 0.25 |
| data-protection | Secrets management, encryption at rest/transit, PII handling | 0.20 |
| attack-surface | Unnecessary endpoints/ports closed, minimal exposure | 0.15 |
| compliance | Relevant standards (GDPR, SOC2, HIPAA) addressed if applicable | 0.10 |

### architecture-review

| Criterion | Description | Weight |
|-----------|-------------|--------|
| modularity | Clear boundaries, low coupling, high cohesion | 0.25 |
| scalability | Handles growth in data, users, features without redesign | 0.25 |
| simplicity | No unnecessary abstractions, appropriate complexity for requirements | 0.20 |
| resilience | Failure handling, degradation strategy, recovery mechanisms | 0.15 |
| operability | Deployable, observable, configurable without code changes | 0.15 |

---

## Bias-Aware Judging (x-humble Integration)

Selectively expose high-confidence lessons from x-humble as context in judge prompts. This does not alter rubric weights; it helps judges recognize known bias patterns.

### Activation Conditions

- Only lessons with `confirmed_count >= 3` AND `status: "active"` are eligible
- Inject only when the lesson's `bias_tags` are relevant to the current evaluation target

### Judge Prompt Injection Format

Append after rubric criteria in the existing Judge Prompt:

```
## Known Bias Warnings (from x-humble, confirmed ≥3 times)
- ⚠ anchoring: "Pattern of fixating on the first approach" (confirmed 5x) — avoid rating only the first suggestion highly
- ⚠ confirmation_bias: "Preference for existing tech stack" (confirmed 3x) — fairly evaluate the merits of alternative technologies

These warnings are for reference only. Score independently according to the rubric, but self-check whether the above biases are influencing your judgment.
```

### Deactivation Conditions

- If `.xm/humble/lessons/` directory does not exist or is empty, skip this section
- Ignore lessons with `confirmed_count < 3` (insufficient verification)
- Ignore lessons with `status: "deprecated"`

---

## Storage Layout

```
.xm/eval/
├── rubrics/               # Custom rubric definitions
│   └── <name>.json
├── results/               # Score and compare results
│   ├── {timestamp}-score.json
│   └── {timestamp}-compare.json
├── benchmarks/            # Benchmark results
│   └── {timestamp}-bench.json
└── diffs/                 # Diff analysis results
    └── {timestamp}-diff.json
```

### Result Schema (score)

```json
{
  "type": "score",
  "timestamp": "ISO8601",
  "rubric": "code-quality",
  "judges": 3,
  "scores": {
    "correctness": [9, 8, 9],
    "readability": [7, 8, 7]
  },
  "averages": { "correctness": 8.7, "readability": 7.3 },
  "overall": 7.8,
  "sigma": 0.6,
  "content_preview": "function add(a,b)..."
}
```

### Result Schema (compare)

```json
{
  "type": "compare",
  "timestamp": "ISO8601",
  "rubric": "general",
  "judges": 3,
  "winner": "B",
  "judge_votes": ["B", "B", "A"],
  "scores": { "A": 7.9, "B": 7.9 },
  "tiebreak": "accuracy",
  "content_previews": { "A": "...", "B": "..." }
}
```

### Rubric Schema

```json
{
  "name": "strict-code",
  "description": "Strict code evaluation",
  "criteria": ["correctness", "edge-cases", "complexity"],
  "weights": [0.5, 0.3, 0.2],
  "created_at": "ISO8601"
}
```

---

## Shared Config Integration

x-eval references shared settings from `.xm/config.json`:

| Setting | Key | Default | Effect |
|------|----|--------|------|
| Agent count | `agent_max_count` | `4` | Default judge count |

Judge count is specified via `--judges N`, or uses the agent_max_count value (default 4).

### Config Resolution Priority

1. CLI flag (`--judges N`) — highest priority when specified
2. Shared config (`agent_max_count`)
3. Default (4)

---

## Trace Recording

session_start and session_end are **automatic** — recorded by `.claude/hooks/trace-session.mjs` on Skill tool invocation. No manual action needed.

### Per agent call (SHOULD — best-effort)
Read session ID from `.xm/traces/.active`, then record agent_step after each agent completes.

### Rules
1. session_start/session_end — **automatic** via hook, do not emit manually
2. agent_step — **best-effort**, record when possible
3. **Metadata only** — never include output content in trace entries
4. If trace write fails, continue — never block execution

## Natural Language Mapping

| User says | Command |
|-----------|---------|
| "evaluate this", "grade this", "score this" | `score <content>` |
| "which is better?", "compare A vs B" | `compare <a> <b>` |
| "strategy comparison", "benchmark", "which strategy is better?" | `bench <task> --strategies "..."` |
| "create a rubric" | `rubric create <name>` |
| "list rubrics", "what criteria are available?" | `rubric list` |
| "show evaluation results", "report" | `report` |
| "what changed?", "change analysis", "diff" | `diff` |
| "compare with previous version", "how much did it improve?" | `diff --quality` |
| "what's in eval?", "help" | `list` |

---

## Reusable Judge Prompt

Standard prompt for inline reuse of x-eval scoring logic from other x-kit plugins (e.g., x-op --verify).

### Usage

x-op's `--verify` option uses this prompt to summon a judge panel. Instead of calling x-eval separately, pass this prompt directly to the Agent tool.

### Judge Prompt

```
"## Quality Evaluation
Rubric: {rubric_name}
Criteria: {criterion1} ({weight1}), {criterion2} ({weight2}), ...

Output to evaluate:
---
{text to evaluate}
---

Score each criterion on a 1-10 scale:
- 1: Fail — does not meet basic requirements
- 5: Acceptable — meets requirements but room for improvement
- 7: Good — clear and actionable
- 10: Excellent — expert-level, immediately usable

Output format (strict):
Criterion: <name> | Score: <N> | Reason: <one-line justification>
Criterion: <name> | Score: <N> | Reason: <one-line justification>
...
Final: <weighted_avg>/10"
```

### Built-in Rubric Reference

| Rubric | Criteria (weight) |
|--------|-------------------|
| code-quality | correctness (0.30), readability (0.20), maintainability (0.20), security (0.20), test-coverage (0.10) |
| review-quality | coverage (0.30), actionability (0.30), severity-accuracy (0.25), false-positive-rate (0.15) |
| plan-quality | completeness (0.30), actionability (0.30), scope-fit (0.20), risk-coverage (0.20) |

## Interaction Protocol

**CRITICAL: x-eval MUST use AskUserQuestion before executing evaluations and after showing results.**

Rules:
1. Before running evaluation judges → AskUserQuestion to confirm rubric and target
2. After showing evaluation results → AskUserQuestion to confirm next action (re-run, accept, adjust)
3. For A/B experiments → AskUserQuestion to confirm both variants before running

Anti-patterns:
- ❌ Auto-run evaluation without confirming what to evaluate
- ✅ Show rubric + target, AskUserQuestion("Run evaluation with these settings?")
| general | accuracy (0.25), completeness (0.25), consistency (0.20), clarity (0.20), hallucination-risk (0.10) |

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "The output looks good to me" | Subjective evaluation is not evaluation — it's a vibe check. Use a rubric so the judgment is reproducible. |
| "One sample is enough to judge" | N=1 is anecdote. Benchmark across at least 3-5 examples; single-sample eval fools you. |
| "LLM-as-judge is probably accurate" | LLM-as-judge has biases (positional, verbosity, self-preference). Validate it against ground truth before trusting it for gating decisions. |
| "Evaluation slows down iteration" | Un-measured iteration is a random walk. Evals are the compass — without them you can't tell if a change is an improvement. |
| "I'll just eyeball the differences" | Differences small enough to eyeball are usually noise. Quantify or move on. |
| "The rubric is overkill for this task" | The rubric is how "good" becomes inspectable. If you skip it, "good" lives only in your head and can't be argued with. |
| "I trust my gut on this one" | Gut is useful for hypothesis generation. It is not useful for gating decisions — those need numbers. |
