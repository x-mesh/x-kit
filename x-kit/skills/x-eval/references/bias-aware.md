# Bias-Aware Judging Reference

Integration with x-humble to surface confirmed bias patterns into judge prompts, improving evaluation accuracy without altering rubric weights.

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

## Applies to

`score` and `compare` subcommands — injected into each judge agent's prompt when x-humble lessons meet the activation conditions above.
