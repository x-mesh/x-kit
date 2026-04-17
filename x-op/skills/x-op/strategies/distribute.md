# Strategy: distribute

Split a large task into independent subtasks → parallel execution → merge.

## Phase 1: SPLIT
`--splits "role:task,role:task"` or auto-split by the leader.

**Call AskUserQuestion to confirm before Phase 2. Show phase results first.**

## Phase 2: DISPATCH
fan-out with unique subtasks per agent:
"Overall task: {original}. Your assignment: {subtask}. Confirm scope-clarity and interface-completeness per Dimension Anchors before starting. Do not modify anything outside your scope."

**Call AskUserQuestion to confirm before Phase 3. Show phase results first.**

## Phase 3: MERGE
Leader merges all results: check for conflicts, synthesize by theme.

## Final Output
```
📦 [distribute] {N} subtasks, {completed} succeeded
| # | Agent | Subtask | Status |
```
