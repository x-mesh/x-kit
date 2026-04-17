# Strategy: chain

A→B→C sequential pipeline with conditional branching.

## Execution
`--steps "explorer:analysis,architect:design,executor:implementation"` or auto-configured by the leader.

For each step, invoke **1** Agent tool (delegate, foreground):
```
"## Chain Step {n}/{total}: {task}
Task: {original}
Previous step result: {previous result or 'none'}
Based on the above context, perform '{task}'. Tag output with scope-clarity and interface-completeness dimensions. Flag any ambiguity from the previous step. 400 words max."
```
Pass the result as input to the next step.

## Final Output
```
⛓️ [chain] Complete — {total} steps
| Step | Role | Task | Status |
| 1 | explorer | analysis | ✅ |
```

---

## Enhanced: conditional branching

Adds conditional branching support to the existing chain.

### Branch syntax
`--steps` extension: compose a DAG using `if:condition->step,else:step` format.

```
--steps "analyst:analysis,if:confidence<0.7->researcher:deep-research,architect:design,executor:implementation"
```

### Execution flow
After each step completes, the leader evaluates the `if` condition:
- Condition met → Execute branch step
- Condition not met → Proceed to next step
- After branch step completes, return to the original flow

Without `--steps`, the leader auto-decides: if the previous step's confidence/quality is low, a supplementary step is auto-inserted.
