# Subcommand: score

N judge agents independently score content against a rubric. Usage: `/x-eval score <content> --rubric <name> [--judges N] [--grounded]`.

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

See `judges/evaluation.md` — scores each criterion 1–10 with justification, computes weighted average as Final Score.

**Adversarial Judge Prompt** — Assign to the last judge:

See `judges/adversarial.md` — actively finds fabrications, severity inflation, unverified claims; scores lower when found.

Each judge scores independently. No identifiers beyond role are assigned to prevent order bias.

### Grounded Mode (`--grounded`)

When `--grounded` is specified, judges switch from text-only reasoning to **tool-assisted verification**.

**Grounded Standard Judge Prompt** — replaces the standard prompt when `--grounded`:

See `judges/grounded.md` — tool-assisted verification (Read/Grep/Bash); falsified claims score 1, unverifiable = neutral.

**Grounded Adversarial Judge Prompt** — replaces the adversarial prompt when `--grounded`:

See `judges/grounded-adversarial.md` — tool-assisted disproof of claims; falsified file:line caps criterion score at 3.

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

## Applies to
Invoked via `/x-eval score ...`. See Subcommand: list in SKILL.md for all available commands.
