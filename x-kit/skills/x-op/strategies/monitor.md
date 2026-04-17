# Strategy: monitor

One-shot OODA cycle: observe → orient → decide → act. Periodicity is delegated to external tools (cron/tmux).

> Note: Claude Code has no time-based triggers, so monitor performs "one observation at invocation time" only.
> For periodic monitoring, use external cron + `claude -p "/x-op monitor ..."` or OMC `/loop`.

## Phase 1: OBSERVE
> 👁️ [monitor] Phase 1: Observe

Leader collects observation targets:
- `--target <file|dir|cmd>` → Read file, check directory state, or execute Bash command
- If absent → `git diff HEAD` + `git log --oneline -5` (recent changes)

**Call AskUserQuestion to confirm before Phase 2. Show phase results first.**

## Phase 2: ORIENT
> 🧭 [monitor] Phase 2: Orient

broadcast — each agent gets a different observation angle and interprets what the raw data *means* in context:
```
"## Monitor: {TARGET}
Observation target: {Phase 1 collected data}
Angle: {ANGLE}

Assess anomalies against the following criteria:
1. Are there changes outside expected range
2. Are there signs of potential issues (bugs, security, performance regression)
3. Are there items requiring immediate action

Result: NORMAL / WARNING / ALERT + rationale. Each assessment must cite a specific observation (file:line, metric value, or diff hunk) per the Agent Output Quality Contract. 200 words max."
```

Default angles (assigned to match agent count):
- `code-quality`: Code quality regression
- `security`: Security vulnerability introduction
- `dependency`: Dependency changes/conflicts
- `test-coverage`: Missing tests

Leader then synthesizes agent results into a contextual interpretation by comparing against:
- **Historical patterns** — `git log` trends: is this a recurring problem or a first occurrence?
- **Known good state** — baseline from last successful deploy: what changed since then?
- **Current environment** — active branch, recent config changes, in-flight PRs

Orient distinguishes signal from noise: the same ALERT from a feature branch mid-refactor carries different weight than the same ALERT on main post-deploy.

**Call AskUserQuestion to confirm before Phase 3. Show phase results first.**

## Phase 3: DECIDE
> 🎯 [monitor] Phase 3: Decide

Leader applies decision criteria to the Orient synthesis:

| Condition | Decision |
|-----------|----------|
| All NORMAL | Wait — output summary, no action |
| 1+ WARNING, no ALERT | Wait — warning summary + recommended strategy for user review |
| 1+ ALERT, low confidence in Orient | Escalate — surface findings, request user judgment |
| 1+ ALERT, high confidence in Orient | Act — auto-execute recommended strategy (after user confirmation) |

Decision output: chosen response (wait / escalate / act), rationale tied to Orient context, and reversibility assessment.

**Call AskUserQuestion to confirm before Phase 4. Show phase results first.**

## Phase 4: ACT
> ⚡ [monitor] Phase 4: Act

Execute the decided response:

Auto-dispatch rules:
| Alert type | Recommended strategy |
|-----------|---------------------|
| Security vulnerability | → red-team --target {file} |
| Code quality regression | → review --target {file} |
| Missing tests | → chain "test-gap-analysis → test-generation" |
| Dependency conflict | → investigate "dependency conflict" |
| Compound issue | → hypothesis "What caused {issue}?" |

## Final Output
```
👁️ [monitor] Complete — {N} agents, {alerts} alerts, {warnings} warnings

## Observation Results
| # | Angle | Status | Finding |
|---|-------|--------|---------|
| 1 | code-quality | ✅ NORMAL | No changes |
| 2 | security | ⚠️ WARNING | New dependency has known CVE |
| 3 | test-coverage | 🚨 ALERT | 3 functions lack tests |

## Orient: Contextual Interpretation
Historical: first occurrence of test-coverage gap on this path.
Baseline: last deploy (main@abc1234) had full coverage on src/auth/.
Environment: feature branch, no config changes. Signal confidence: HIGH.

## Decision
Act — escalate test-coverage alert; wait on security warning (CVE unconfirmed in context).

## Auto Dispatch
| Alert | Strategy | Status |
|-------|----------|--------|
| test-coverage | → review --target src/auth/ | Pending (user confirmation required) |
```
