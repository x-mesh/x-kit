# Strategy: hypothesis

Generate hypotheses → attempt falsification → adopt only survivors. Specialized for bug diagnosis/scientific reasoning.

## Phase 1: GENERATE
> 🔬 [hypothesis] Phase 1: Generate

fan-out — each agent independently generates hypotheses:
```
"## Hypothesis Generation: {TOPIC}
Propose 2-3 possible hypotheses for this problem. Each must address a DISTINCT dimension from the Dimension Anchors. Tag: [dimension] hypothesis.
Each hypothesis: title + rationale + falsifiable prediction (if this hypothesis is correct, then ~ should hold).
200 words max."
```

Leader collects → deduplicates → assigns numbers (H1, H2, ...).

**Call AskUserQuestion to confirm before Phase 2. Show phase results first.**

## Phase 2: FALSIFY
> 🔬 [hypothesis] Phase 2: Falsify

fan-out falsification agents for each hypothesis:
```
"## Falsification: {hypothesis title}
Hypothesis: {hypothesis content}
Prediction: {falsifiable prediction}

Attempt to falsify this hypothesis:
- Find counterexamples or contradictions
- Present cases where the prediction fails
- Find evidence that the hypothesis's premises are wrong

Conclusion: FALSIFIED or SURVIVED. Rationale required."
```

**Call AskUserQuestion to confirm before Phase 3. Show phase results first.**

## Phase 3: SYNTHESIZE
> 🔬 [hypothesis] Phase 3: Synthesize

Leader synthesizes results:
- Remove FALSIFIED hypotheses
- Select the strongest among SURVIVED hypotheses
- If no hypotheses survived → new hypothesis generation round (up to max_rounds)

## Final Output
```
🔬 [hypothesis] Complete — {total} hypotheses, {survived} survived

## Hypothesis Results
| # | Hypothesis | Status | Rationale |
|---|-----------|--------|-----------|
| H1 | {title} | ✅ SURVIVED | {rationale} |
| H2 | {title} | ❌ FALSIFIED | {falsification rationale} |

## Adopted Hypothesis
{strongest surviving hypothesis in detail}

## Recommended Verification Method
{next steps to confirm the hypothesis in practice}
```
