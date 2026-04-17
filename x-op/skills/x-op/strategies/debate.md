# Strategy: debate

Pro vs Con debate followed by verdict.

## Phase 1: POSITION
`--agents N` (minimum 3) → Auto-distribute into PRO team, CON team, and JUDGE.

**Call AskUserQuestion to confirm before Phase 2. Show phase results first.**

## Phase 2: OPENING
PRO/CON simultaneous fan-out:
PRO/CON simultaneous fan-out:
- PRO: "Present 3 arguments in favor. Each must be evidence-based and falsifiable per the Agent Output Quality Contract. Tag each with a dimension. 300 words max."
- CON: "Present 3 arguments against. Each must be evidence-based and falsifiable per the Agent Output Quality Contract. Tag each with a dimension. 300 words max."

**Call AskUserQuestion to confirm before Phase 3. Show phase results first.**

## Phase 3: REBUTTAL
Send CON's opening to PRO, PRO's opening to CON (fan-out):
"Rebut the opposing arguments. 200 words."

**Call AskUserQuestion to confirm before Phase 4. Show phase results first.**

## Phase 4: VERDICT
Send the full record to JUDGE (delegate):
"Evaluate both sides per the Judge/Evaluator Rubric (Agent Output Quality Contract). Score each argument on strength (1-10) and cite its dimension. Verdict must reference dimension scores. PRO or CON? Final recommendation in 200 words."

## Final Output
```
⚖️ [debate] Verdict: {PRO|CON}
| Team | Key Argument |
| PRO | {strongest} |
| CON | {strongest} |
```
