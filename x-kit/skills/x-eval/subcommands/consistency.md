# Subcommand: consistency

Measure whether a plugin produces consistent outputs across repeated trials on the same input. Usage: `/x-eval consistency [plugin] [--trials N] [--input "..."]`.

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

## Applies to
Invoked via `/x-eval consistency ...`. See Subcommand: list in SKILL.md for all available commands.
