# Subcommand: bench

Run the same task with multiple strategies/models, evaluate each output, and find the optimal one. Usage: `/x-eval bench <task> --strategies "s1,s2" [--models "m1,m2"] [--trials N]`.

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

## Applies to
Invoked via `/x-eval bench ...`. See Subcommand: list in SKILL.md for all available commands.
