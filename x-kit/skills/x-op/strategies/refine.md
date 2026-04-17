# Strategy: refine

Diverge → converge → verify round-based refinement.

## Round 1: DIVERGE

> 🔄 [refine] Round 1/{max}: Diverge

Invoke N Agent tools simultaneously (fan-out):
```
Each agent prompt:
"## Task: {TASK}
Propose your own independent solution to this task. 400 words max.
Do not consider other agents' answers — suggest your own approach.
Tag 3+ dimensions from the Dimension Anchors (Agent Output Quality Contract). Each proposal must be evidence-based and falsifiable."
```
- `run_in_background: true` (parallel)
- Wait for all agents to complete

**Call AskUserQuestion to confirm before Round 2. Show phase results first.**

## Round 2: CONVERGE

> 🔄 [refine] Round 2/{max}: Converge

You (Claude, the leader) directly synthesize all results:
- Identify commonalities/differences, extract strengths from each, draft a unified proposal

Share the unified proposal with agents and request a vote (fan-out):
```
"## Synthesis of All Results
{synthesized results}

Select the best approach by number and explain your reasoning in 2-3 lines."
```

The leader tallies the votes → determines the adopted proposal.

**Call AskUserQuestion to confirm before Round 3. Show phase results first.**

## Round 3+: VERIFY

> 🔄 [refine] Round {n}/{max}: Verify

Send the adopted proposal to agents (fan-out):
```
"## Verify Adopted Proposal
{adopted proposal}
Verify from your perspective. If there are issues, point them out and suggest fixes. If none, respond 'OK'."
```

- **All OK** → Early termination
- **Issues raised** → Leader incorporates feedback and proceeds to next round
- **max_rounds reached** → Best-effort output

## Final Output

```
🔄 [refine] Complete — {actual}/{max} rounds

## Adopted Solution
{final solution}

## Round Summary
| Round | Phase | Participants | Result |
|-------|-------|-------------|--------|
| 1 | Diverge | {N} agents | {N} independent solutions |
| 2 | Converge | {N} agents | Adopted (votes {M}/{N}) |
| 3 | Verify | {N} agents | {OK count}/{N} OK |
```
