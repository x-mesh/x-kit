# Strategy: compose

Chain multiple strategies into a pipeline.

## Usage
```
/x-op compose "brainstorm | tournament | refine" --topic "v2 feature plan"
```

Or with the `--pipe` flag:
```
/x-op brainstorm "v2 features" --pipe tournament --pipe refine
```

## Execution flow
1. Run the first strategy → collect results
2. Leader constructs `pipe_payload` from the results (see schema below)
3. Inject `pipe_payload` as input context for the next strategy
4. The last strategy's result becomes the final output

## pipe_payload standard schema

After each strategy completes, the leader parses the markdown result and internally constructs the following structure (the existing markdown is exposed to the user as-is):

```json
{
  "strategy": "tournament",
  "status": "completed",
  "result": {
    "winner": "Solution B",
    "score": 18,
    "summary": "REST + OpenAPI direction"
  },
  "candidates": [
    { "id": "A", "summary": "...", "score": 14 },
    { "id": "B", "summary": "...", "score": 18 }
  ],
  "pipe_payload": "Key content text to pass to the next strategy"
}
```

Per-strategy `pipe_payload` extraction rules:
| Strategy | pipe_payload content |
|----------|---------------------|
| brainstorm | Representative ideas per cluster (top N when voted) |
| tournament | Full winning solution |
| refine | Full final adopted proposal |
| review | Critical/High issue list |
| debate | Verdict + key arguments |
| hypothesis | Surviving hypotheses + recommended verification methods |
| investigate | Key Insights + Knowledge Gaps |
| council | Consensus statement (or key contentions if NO CONSENSUS) |

Sub-agents respond in free text; JSON is not enforced. Constructing pipe_payload is the leader's responsibility.

## Transformation rules
| From → To | Transformation |
|-----------|---------------|
| brainstorm → tournament | Cluster representative ideas become candidates |
| brainstorm → refine | Top-voted idea becomes the seed |
| tournament → refine | Winning solution becomes the refinement target |
| review → red-team | Critical/High issues become attack targets |
| chain → review | Chain final output becomes the review target |
| investigate → debate | Conflicting findings become PRO/CON positions |
| investigate → hypothesis | Knowledge gaps become hypotheses |
| investigate → review | Identified files become review targets |
| investigate → red-team | Discovered attack surfaces become targets |
| investigate → refine | Key insights become the seed |
| brainstorm → investigate | Top ideas become investigation topics |
| hypothesis → investigate | Surviving hypotheses become verification investigation targets |
| hypothesis → scaffold | Adopted hypothesis solutions become module design input |
| hypothesis → chain | Adopted hypothesis becomes the analysis→design→implementation pipeline seed |
| council(no-consensus) → debate | On failed consensus, escalate to pro/con debate |
| review → chain "fix" | Critical issues become the analysis→fix pipeline input |
| persona → council | Per-perspective analyses become deliberation input |

## Final Output
```
🔗 [compose] Complete — {N} strategies

## Pipeline
| Step | Strategy | Input | Output |
|------|----------|-------|--------|
| 1 | brainstorm | "v2 features" | 12 ideas, 4 themes |
| 2 | tournament | top 4 ideas | Winner: idea #3 |
| 3 | refine | idea #3 | Refined solution |

## Final Result
{last strategy's output}
```
