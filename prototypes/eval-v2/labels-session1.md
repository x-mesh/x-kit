# Labeling Session 1 — 2026-04-14

Controlled experiment: label v7 outputs on "would you actually use this?" scale.

## Labels

| # | Output | v8 score | label | comment |
|---|--------|----------|-------|---------|
| A | diverse-ml.bcast-3-fixed.s2 | 9.67 | use | 괜찮 |
| B | diverse-ml.bcast-3-matched.s1 | 9.67 | (invalid — file missing) | (labeled sight-unseen; dropped) |
| C | refine-001.bcast-1.s1 | 9.00 | use | 짧지만 가시성 좋음 |
| D | diverse-ml.bcast-5.s3 | 9.00 | partial | (no detail) |
| E | refine-001.direct.s3 | 8.00 | partial | (no detail) |
| F | refine-001.bcast-3-fixed.s3 | 7.67 | partial | (no detail) |

## Correlation (n=5, excluding B)

- label encoding: use=2, partial=1, abandon=0
- Pearson r = 0.746
- t-stat = 1.94 (df=3, critical |t|=3.18 for p<0.05) → NOT statistically significant
- Direction: positive (higher v8 score → more likely "use")

## Mean score by label
- use (n=2): 9.34
- partial (n=3): 8.22

## Takeaways
- Direction confirms v8 rubric is at least non-random
- n too small for statistical claim — need n≥30 for p<0.05 at this effect size
- Score range 7.67–9.67 is narrow (no real "abandon" examples). Survivorship bias: v7 outputs are all golden-set-generated, none truly bad.
- Known rubric gap: architectural depth — B initially labeled "partial" based on topic alone hinted the rubric misses depth dimension, but the label itself is invalid.
