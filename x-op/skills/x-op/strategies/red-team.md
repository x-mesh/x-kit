# Strategy: red-team

Attack/defend. Find vulnerabilities → fix.

## Phase 1: TARGET
Collect targets via `--target` or `git diff HEAD`.

**Call AskUserQuestion to confirm before Phase 2. Show phase results first.**

## Phase 2: ATTACK
Attack team fan-out:
"From an adversarial perspective, find as many vulnerabilities/defects as possible. Each attack must target a distinct dimension from the Code Analysis Anchors. Tag: [dimension] [Critical|High|Medium] location — attack vector — proof scenario."

**Call AskUserQuestion to confirm before Phase 3. Show phase results first.**

## Phase 3: DEFEND
Defense team fan-out (with attack results):
"For each attack, provide a fix or counter-evidence."

**Call AskUserQuestion to confirm before Phase 4. Show phase results first.**

## Phase 4: REPORT
Leader synthesizes: Fixed(🟢), Partial(🟡), Open(🔴).

## Final Output
```
🔴 [red-team] Complete — {total} vulnerabilities
| # | Severity | Attack | Status |
```
