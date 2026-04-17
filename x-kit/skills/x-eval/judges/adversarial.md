# Judge: Adversarial Evaluation Judge

Assigned to the last judge in the panel. Actively seeks what is WRONG with the output — unverified claims, speculative findings, fabricated details, severity inflation. Scores lower when it finds them.

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

## Applies to
Invoked by x-eval `score` phase as the last judge in the panel. Provides cross-validation against shared bias in standard judges. When adversarial gap > 1.5, adjusted score = standard × 0.6 + adversarial × 0.4.
