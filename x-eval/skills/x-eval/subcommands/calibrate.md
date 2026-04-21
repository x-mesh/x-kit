# Subcommand: calibrate

Validate LLM judge scores against human judgment. Surface systematic per-criterion bias so you know where to trust the judges and where to add guardrails. Usage: `/x-eval calibrate --rubric <name> [--samples N]`.

## Subcommand: calibrate

**Validate judge scores against human ground truth. Identify systematic over/under-scoring per criterion.**

The article principle: "누군가 트랜스크립트를 읽기 전에는 점수를 액면 그대로 믿지 말라." Calibrate is the systematic version of that check — not one transcript, but a structured human-vs-judge comparison across N samples.

### Parsing

From `$ARGUMENTS`:
- `calibrate` (no args) = interactive rubric selection from recent results
- `--rubric <name>` = rubric to calibrate against (required if no recent results)
- `--samples N` = number of results to pull for human scoring (default 5; min 3 for meaningful signal)
- `--from <file>` = score a specific result file instead of pulling from history

### Execution Flow

1. **Sample selection**: Pull N recent score results from `.xm/eval/results/` matching `--rubric`. If fewer than N exist, use all available and warn.
2. **Human scoring loop**: For each sample, present content preview + judge scores, then use AskUserQuestion to collect human score per criterion.
3. **Delta computation**: `bias_delta[criterion] = mean(judge_avg - human_score)` across all samples.
4. **Calibration report**: Print per-criterion bias table with status labels and recommendations.
5. **Storage**: Save to `.xm/eval/calibrations/{timestamp}-calibrate.json`.

### Human Scoring (AskUserQuestion per criterion)

For each sample × criterion, present:
- A one-paragraph excerpt of the evaluated content
- The judge's score for this criterion with their stated reason
- AskUserQuestion with score bands as options

```
header: "{criterion} score"
options:
  - label: "1–3 (poor)"       description: Fails basic expectations for this criterion
  - label: "4–6 (below bar)"  description: Present but insufficient
  - label: "7–8 (good)"       description: Meets expectations; minor gaps acceptable
  - label: "9–10 (excellent)" description: Expert-level; nothing to improve
  - Other                     (user types exact number 1–10)
```

Map band labels to midpoints for delta math: `1–3 → 2`, `4–6 → 5`, `7–8 → 7.5`, `9–10 → 9.5`. Use "Other" value when provided.

### Calibration Report

```
📊 [eval] Calibration Report: code-quality  (5 samples)

| Criterion       | Judge Avg | Human Avg | Bias Δ  | Status              |
|-----------------|-----------|-----------|---------|---------------------|
| correctness     |      8.2  |      7.8  |  +0.4   | slight inflation    |
| readability     |      7.5  |      7.6  |  -0.1   | ✓ calibrated        |
| maintainability |      7.8  |      7.0  |  +0.8   | ⚠ inflating         |
| security        |      6.5  |      8.1  |  -1.6   | ⚠ deflating         |
| test-coverage   |      8.0  |      7.5  |  +0.5   | slight inflation    |

Calibration status:
  ✓ Calibrated (|Δ| < 0.5):    readability
  ~ Slight bias (0.5 ≤ |Δ| < 1.0): correctness (+0.4), test-coverage (+0.5)
  ⚠ Systematic bias (|Δ| ≥ 1.0): security (-1.6 deflating), maintainability (+0.8 inflating)

Recommendations:
  - security: Judges consistently under-score — add explicit scoring guidance to
    judge prompts (e.g., "8+ when no obvious vulnerability; 6 if validation absent").
  - maintainability: Judges inflate — consider tightening rubric description or
    raising criterion-specific bar in judge prompt.

Saved: .xm/eval/calibrations/2026-04-21T12:00:00-calibrate.json
```

### Bias Thresholds

| |Δ| range | Status | Interpretation |
|-----------|--------|----------------|
| < 0.5 | ✓ calibrated | Judge and human agree within noise |
| 0.5–0.9 | ~ slight bias | Monitor; acceptable for non-gating uses |
| ≥ 1.0 | ⚠ systematic | Add criterion-specific guidance to judge prompt before trusting scores |

**Positive Δ (inflate):** judges score higher than humans → false confidence; high-risk for gating decisions.
**Negative Δ (deflate):** judges score lower than humans → useful strategies may get filtered out.

### Storage Schema

```json
{
  "type": "calibrate",
  "timestamp": "ISO8601",
  "rubric": "code-quality",
  "samples": 5,
  "criteria": {
    "correctness":     { "judge_avg": 8.2, "human_avg": 7.8, "bias_delta": 0.4,  "status": "slight" },
    "readability":     { "judge_avg": 7.5, "human_avg": 7.6, "bias_delta": -0.1, "status": "calibrated" },
    "maintainability": { "judge_avg": 7.8, "human_avg": 7.0, "bias_delta": 0.8,  "status": "systematic" },
    "security":        { "judge_avg": 6.5, "human_avg": 8.1, "bias_delta": -1.6, "status": "systematic" },
    "test_coverage":   { "judge_avg": 8.0, "human_avg": 7.5, "bias_delta": 0.5,  "status": "slight" }
  },
  "systematic_criteria": ["security", "maintainability"],
  "sample_ids": ["2026-04-21T11:00:00-score.json", "..."]
}
```

### When calibration results should gate judge usage

- Any criterion with `|Δ| ≥ 1.5` AND that criterion weight ≥ 0.20 → **do not use this rubric for automated gating** until addressed.
- Calibration result older than 30 days → treat as expired; re-run before using for release decisions.

## Applies to
Invoked via `/x-eval calibrate ...`. Calibration data is consumed by `report` (surfaces calibration age and systematic criteria). See `references/storage-layout.md` for schema.
