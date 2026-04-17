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

See `references/ask-user-question-rule.md` — the `question` field is invisible on dark terminals; put context in markdown, use `header`/`label`/`description` for user-facing text.

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

See `subcommands/score.md` — standard + adversarial judge panel; sigma-based bias detection; `--grounded` for tool-assisted verification; saves to `.xm/eval/results/`.

---

## Subcommand: compare

See `subcommands/compare.md` — randomized A/B order per judge (position bias prevention); tiebreak by rubric's first criterion; saves to `.xm/eval/results/`.

---

## Subcommand: bench

See `subcommands/bench.md` — strategies × models × trials matrix; recommends best quality and best value (Score/$); supports x-op compose pipelines via `|` separator.

---

## Subcommand: consistency

See `subcommands/consistency.md` — deterministic vs exploratory metric systems; PASS ≥ 0.80, WARN 0.70–0.79, FAIL < 0.70; saves to `benchmarks/{plugin}-consistency.json`.

---

## Subcommand: diff

See `subcommands/diff.md` — git-based quantitative analysis (Phase 1–2) + optional judge-panel quality comparison (`--quality`); saves to `.xm/eval/diffs/`.

---

## Subcommand: rubric

See `subcommands/rubric.md` — `rubric create <name> --criteria "c1,c2,c3"` saves to `.xm/eval/rubrics/`; `rubric list` shows built-in and custom rubrics.

---

## Subcommand: report

See `subcommands/report.md` — aggregates `.xm/eval/results/` and `.xm/eval/benchmarks/`; supports current session, `<session-id>`, or `--all`.

---

## Built-in Rubrics + Domain Rubric Presets

See `references/rubrics.md` — 4 built-in rubrics (code-quality, review-quality, plan-quality, general) and 5 domain presets (api-design, frontend-design, data-pipeline, security-audit, architecture-review) with full criterion/weight tables.

---

## Bias-Aware Judging

See `references/bias-aware.md` — x-humble integration; injects confirmed bias warnings (confirmed_count ≥ 3, status active) into judge prompts without altering rubric weights; deactivates if `.xm/humble/lessons/` is missing or empty.

---

## Storage Layout

See `references/storage-layout.md` — `.xm/eval/` directory tree; result schemas for score/compare/bench/diff; rubric JSON schema.

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

See `references/trace-recording.md` — session_start/session_end are automatic via `.claude/hooks/trace-session.mjs`; emit best-effort `agent_step` entries for long sub-operations.

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

See `judges/reusable.md` — standard inline judge for x-op --verify and x-build prd-gate. Substitute `{rubric_name}`, `{criteria_list}`, `{content}` and pass directly to Agent tool.

---

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
