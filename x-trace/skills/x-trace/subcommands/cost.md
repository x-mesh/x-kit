# Subcommand: cost

Outputs a detailed cost report broken down by agent/task.

## Subcommand: cost

### Parsing

Same session file lookup as `show`.

### Cost calculation (token rates)

| Model | Input ($/1M tokens) | Output ($/1M tokens) |
|------|-------------------|-------------------|
| haiku | $0.80 | $4.00 |
| sonnet | $3.00 | $15.00 |
| opus | $15.00 | $75.00 |

Calculated from `input_tokens_est`, `output_tokens_est`, and `agent.model` fields:
```
cost = (input_tokens_est / 1_000_000 * input_rate) + (output_tokens_est / 1_000_000 * output_rate)
```

### Output

```
[trace] Cost Report: feature-auth

| Agent        | Model  | In Tokens | Out Tokens | Est. Cost |
|--------------|--------|-----------|------------|-----------|
| security     | sonnet |     2,500 |        800 |    $0.012 |
| logic        | sonnet |     2,500 |        600 |    $0.017 |
| performance  | sonnet |     2,500 |        700 |    $0.018 |
| tests        | sonnet |     2,500 |        500 |    $0.015 |
| synthesize   | sonnet |     3,000 |        600 |    $0.018 |
|--------------|--------|-----------|------------|-----------|
| TOTAL        |        |    15,000 |      3,200 |    $0.080 |

Source: x-op:review | Duration: 16s | Agents: 5
```

## Applies to
Invoked via `/x-trace cost [session]`.
