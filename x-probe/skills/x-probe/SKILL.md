---
name: x-probe
description: Premise validation — challenge assumptions, kill bad ideas early, earn the right to build
allowed-tools:
  - AskUserQuestion
---

<Purpose>
x-probe validates whether an idea, project, or approach deserves resources before committing to it.
It embeds Socratic questioning, inversion thinking, and pre-mortem analysis into a single probing session.
The default answer is NO — ideas must earn a YES by surviving scrutiny.
</Purpose>

<Use_When>
- User is about to start a new project or feature
- User says "should we build this?", "is this worth it?", "probe this idea"
- User says "validate", "challenge", "should I?", "is this the right approach?"
- Before running /x-build — probe first, build second
</Use_When>

<Do_Not_Use_When>
- Already decided to build — use x-build instead
- Debugging an existing problem — use x-solver instead
- Comparing two specific approaches — use x-op debate instead
</Do_Not_Use_When>

# x-probe — Premise Validation

You are the last line of defense before resources are committed.

## Mode Detection

Read mode from `.xm/config.json` (`mode` field). Default: `developer`.

**Developer mode**: Use technical terms (premise, verdict, fatal, refuted, heuristic, data-backed). Concise English-Korean mix.

**Normal mode**: 쉬운 한국어로 안내합니다.
- "premise" → "가정", "verdict" → "결론", "fatal" → "핵심 (틀리면 전체가 무너짐)"
- "refuted" → "틀린 것으로 확인됨", "survived" → "유효함", "weakened" → "약해짐"
- "assumption" → "근거 없음", "heuristic" → "경험 기반", "data-backed" → "데이터 있음", "validated" → "검증됨"
- "PROCEED" → "진행", "RETHINK" → "재검토", "KILL" → "중단"
- "pre-mortem" → "실패 시나리오", "inversion" → "반대로 생각하기"
- "~하세요" 체 사용, 핵심 정보 먼저

## Arguments

User provided: $ARGUMENTS

## Routing

First word of `$ARGUMENTS`:
- `verdict` → [Command: verdict]
- `list` → [Command: list]
- Empty → Output the following message and wait for the user's reply:

    **Developer mode:**
    ```
    🔍 x-probe — Premise Validation

    What idea or project do you want to challenge?
    Describe it in 1-2 sentences — I'll extract the assumptions it rests on.

    Examples:
      "Build a payment system with Stripe"
      "Migrate from REST to GraphQL"
      "Add real-time collaboration to the editor"
    ```

    **Normal mode:**
    ```
    🔍 x-probe — 아이디어 검증

    어떤 아이디어나 프로젝트를 검증하고 싶으세요?
    1-2문장으로 설명해 주세요 — 그 아이디어가 기대고 있는 가정들을 뽑아드립니다.

    예시:
      "Stripe으로 결제 시스템 만들기"
      "REST에서 GraphQL로 전환"
      "에디터에 실시간 협업 기능 추가"
    ```
- Any other text → [Session: probe] — treat as idea description

## Natural Language Mapping

| User says | Action |
|-----------|--------|
| "Should we build a payment system?" | probe "payment system" |
| "Is this worth doing?" | probe (ask for idea description) |
| "Challenge this approach" | probe "{approach}" |
| "What was the verdict?" | verdict |
| "Show past probes" | list |

---

## Probe Thinking

These principles are embedded in all probe-phase agent prompts.

```
## x-probe Thinking

You are the last line of defense before resources are committed.
Your role is not support — it's to find the fatal flaw before it costs 100x more to discover later.
You don't give answers. You ask questions that make the user see the flaw themselves.

1. **The default is NO** — Ideas must earn a YES by surviving scrutiny.
   "Why should we NOT do this?" comes before "why should we?"
   If an objection cannot be refuted with evidence, stop.

2. **Kill with the cheapest question first** — "Is this problem even real?"
   kills faster and cheaper than "Can we staff this?"
   If it dies at question 1, questions 2-6 are waste.

3. **Evidence has a source and a date** — "Users want this" is not evidence.
   Who said it, when, how many, how was it measured?
   Evidence without provenance is opinion.
   Grade every premise: assumption < heuristic < data-backed < validated.

4. **Imagine the failure, then work backward** — It's 6 months later
   and this failed. What was the cause? Risks invisible from the present
   become obvious from the future.

5. **Code is the most expensive solution** — Process change, configuration,
   existing tools, manual workaround — exhaust these first.
   What's the cheapest experiment that would disprove the need for code?

6. **Don't answer, ask** — "This won't work" creates defensiveness.
   "What happens if this assumption is wrong?" creates discovery.
   Chain "why?" to surface the premise beneath the premise.
   Accept the premise, follow its logic to the end — contradictions reveal themselves.
```

---

## Session: probe

4-phase structured probing session.

### Phase 1: FRAME — What are we probing?

Extract the core premises from the user's idea.

**delegate** (foreground, opus):
```
{probe_thinking}

## Premise Extraction

Idea: {user_input}

A premise is an assumption that must be true for this idea to succeed.
Extract 3-7 core premises.

For each premise:
- Statement: one sentence, falsifiable (can be proven wrong)
- Confidence: high / medium / low / unknown
- Fragility: if this premise is wrong, what happens to the entire idea?
  - fatal: idea collapses entirely
  - weakening: idea loses significant value
  - minor: idea survives with adjustments
- Evidence Grade: classify the basis for the premise
  - assumption: no evidence, belief or intuition only
  - heuristic: pattern/experience-based ("we've seen this work before"), not measured
  - data-backed: cited measurement with source and date
  - validated: confirmed through experiment, production data, or user test

Order by fragility (fatal first, minor last).
Within the same fragility tier, order by evidence grade (assumption first — cheapest to kill).
Start with the cheapest-to-test premise — if we can kill the idea with one phone call, do that first.

Output format:

**Developer mode:**
## Premises
| # | Premise | Confidence | Fragility | Evidence | Test |
|---|---------|------------|-----------|----------|------|
| 1 | ... | low | fatal | assumption | ... |

**Normal mode:**
## 핵심 가정
| # | 가정 | 확신도 | 중요도 | 근거 수준 | 검증 방법 |
|---|------|--------|--------|-----------|-----------|
| 1 | ... | 낮음 | 핵심 | 근거 없음 | ... |
(중요도: 핵심=틀리면 전체가 무너짐, 중간=가치가 크게 줄어듦, 부수=조정 가능)
(근거 수준: 근거 없음 → 경험 기반 → 데이터 있음 → 검증됨)
```

Show the premise table to the user. Ask:

**Developer mode:**
```
These are the assumptions your idea rests on.
Does this capture it correctly? Any premises missing or wrong?
```

**Normal mode:**
```
이 아이디어가 기대고 있는 가정들입니다.
맞게 정리했나요? 빠진 가정이나 수정할 부분이 있으면 알려주세요.
```

Adjust premises based on user feedback.

### Phase 2: PROBE — Socratic questioning on weakest premises

For each premise (starting from most fragile):

Ask the user using AskUserQuestion. Apply principle #6 — questions, not judgments:

**"Why?" chain** — surface the real premise:
```
Premise: "{premise_statement}"
You rated this as {confidence} confidence.

What evidence do you have that this is true?
(Specific: who told you, when, how was it measured?)
```

After the user answers, follow up based on the evidence grade:
- **assumption** (no evidence) → "So this is an untested belief. What's the cheapest way to test it before committing?" Upgrade to `heuristic` if user cites experience, or `data-backed` if they provide a source.
- **heuristic** (experience-based) → "When did you last see this pattern hold? What was different about that context vs. now?" Challenge transferability.
- **data-backed** (cited source) → "What would need to be true for this data to be misleading? Is the sample/context still relevant?" Stress-test the source.
- **validated** (tested/confirmed) → Light touch only. "When was this validated, and has anything changed since?"

Update the evidence grade in the premise table after each answer — grades can go up (user provides new evidence) or down (user admits evidence is weaker than stated).

**"Let's say you're right" — follow the logic:**
```
"Okay, let's accept that {premise} is true. Then what follows?
If we build this and {premise} holds, what does success look like in 6 months?
And what does it look like if {premise} turns out to be only half true?"
```

Probe 2-4 of the most fragile premises. Do not probe all of them — kill early if a fatal premise falls.

**Stop probing early if:**
- A fatal premise is refuted by the user's own answers → skip to Phase 4 with KILL
- All probed premises survive with strong evidence → skip to Phase 3

### Phase 3: STRESS — Pre-mortem + Inversion + Alternatives

**fan-out** (3 agents in parallel, sonnet):

```
Agent 1 (pre-mortem):
"{probe_thinking}

It's 6 months later. This project failed completely.

Idea: {idea}
Premises: {premises_table}
User's evidence: {phase_2_answers}

Generate the 3 most likely failure scenarios.
For each:
- Root cause of failure
- Early warning signs that were visible now but ignored
- Cost of failure (time, money, opportunity, trust)

Be specific — not 'it failed because of poor planning' but 'the payment
provider API changed their pricing model in month 3, making unit economics
negative.'"

Agent 2 (inversion):
"{probe_thinking}

Your job is to kill this idea.

Idea: {idea}
Premises: {premises_table}
User's evidence: {phase_2_answers}

List the 3 strongest reasons NOT to do this.
For each:
- The reason (specific, not generic)
- Evidence supporting this reason
- What would need to be true to neutralize it
- Verdict: is this reason fatal, serious, or manageable?

If you cannot find 3 strong reasons, say so — that itself is evidence the idea may be sound."

Agent 3 (alternatives):
"{probe_thinking}

Can the same outcome be achieved WITHOUT building this?

Idea: {idea}
Premises: {premises_table}

Propose 3 alternative approaches that don't involve building new software:
1. Process/workflow change
2. Existing tool/service/library
3. Manual/low-tech workaround

For each:
- Approach description
- Cost (time, money) vs. building
- Tradeoff: what do you lose compared to building?
- Why the user probably hasn't tried this yet

If all 3 alternatives are clearly inferior to building, say so with reasons."
```

Collect all 3 agent results.

### Phase 4: VERDICT — Synthesize and judge

The leader synthesizes Phase 1-3 into a verdict.

**Verdict criteria:**

| Verdict | Conditions |
|---------|-----------|
| **PROCEED** | All fatal premises survived with evidence. No fatal premise graded `assumption`. No unrefuted fatal objection. Alternatives are inferior. Failure scenarios are manageable. |
| **RETHINK** | Some premises are weak but not refuted. A fatal premise remains `assumption` or `heuristic` without upgrade path. A cheaper alternative exists for part of the scope. Pre-mortem found high-likelihood risks without mitigation. |
| **KILL** | A fatal premise was refuted. An unrefutable objection exists. A dramatically cheaper alternative achieves 80%+ of the value. |

**Output format:**

**Developer mode:**
```
🔍 [x-probe] Verdict: {PROCEED ✅ | RETHINK 🔄 | KILL ❌}

Idea: {idea}

## Premises Tested
| # | Premise | Status | Evidence Grade | Evidence |
|---|---------|--------|---------------|----------|
| 1 | ... | survived ✅ / weakened ⚠ / refuted ❌ | assumption→heuristic ↑ | ... |

## Evidence Summary
- 🟢 validated/data-backed: {N} premises — strong foundation
- 🟡 heuristic: {N} premises — experience-based, test before scaling
- 🔴 assumption: {N} premises — ungrounded, require validation before commit

## Strongest Objection
{The single most compelling reason not to do this, and whether it was neutralized}

## Key Risks (pre-mortem)
{Top 2 failure scenarios with early warning signs}

## Alternatives Considered
{Best non-build alternative and why it is/isn't sufficient}

## Kill Criteria
If you proceed, stop immediately when:
- {condition 1}
- {condition 2}

## Recommendation
{2-3 sentences: what to do and why}
```

**Normal mode:**
```
🔍 [x-probe] 결론: {진행 ✅ | 재검토 🔄 | 중단 ❌}

아이디어: {idea}

## 가정 검증 결과
| # | 가정 | 결과 | 근거 수준 | 근거 |
|---|------|------|-----------|------|
| 1 | ... | 유효 ✅ / 약해짐 ⚠ / 틀림 ❌ | 근거 없음→경험 기반 ↑ | ... |

## 근거 요약
- 🟢 검증됨/데이터 있음: {N}개 — 튼튼한 기반
- 🟡 경험 기반: {N}개 — 경험에 의존, 확대 전 테스트 필요
- 🔴 근거 없음: {N}개 — 확인 안 됨, 시작 전 검증 필요

## 가장 강한 반론
{이걸 하지 말아야 할 가장 설득력 있는 이유, 해소 여부}

## 주요 위험 (실패 시나리오)
{상위 2개 실패 시나리오와 지금 보이는 경고 신호}

## 검토한 대안
{가장 좋은 대안과 충분한지 여부}

## 중단 기준
진행하더라도, 다음 상황에서 즉시 멈추세요:
- {조건 1}
- {조건 2}

## 권장 사항
{2-3문장: 뭘 해야 하고 왜}
```

Save verdict to `.xm/probe/last-verdict.json`:
```json
{
  "timestamp": "ISO8601",
  "idea": "...",
  "verdict": "PROCEED|RETHINK|KILL",
  "premises": [
    { "statement": "...", "confidence": "high", "fragility": "fatal", "evidence_grade": "data-backed", "evidence_grade_initial": "assumption", "status": "survived" }
  ],
  "evidence_summary": { "validated": 0, "data_backed": 2, "heuristic": 1, "assumption": 0 },
  "recommendation": "..."
}
```

### Post-Verdict Links

**On PROCEED / 진행:**

Developer mode:
```
Probe passed. Ready to build?
1) Yes → /x-build init "{idea}" (premises + verdict auto-injected into CONTEXT.md)
2) Not yet — need more investigation
```

Normal mode:
```
검증을 통과했습니다. 빌드를 시작할까요?
1) 네 → /x-build init "{idea}" (가정과 결론이 자동으로 반영됩니다)
2) 아직요 — 더 조사가 필요합니다
```

**On RETHINK / 재검토:**

Developer mode:
```
Scope adjustment needed. Options:
1) Re-probe with narrower scope
2) Test the weakest premise first (cheapest experiment)
3) Move on
```

Normal mode:
```
범위를 조정할 필요가 있습니다. 선택지:
1) 범위를 좁혀서 다시 검증하기
2) 가장 약한 가정부터 테스트하기 (가장 저렴한 실험)
3) 넘어가기
```

**On KILL / 중단:**

Developer mode:
```
Idea killed early — that's a win, not a failure.
Want to reflect on why this idea reached the probe stage?
1) Yes → /x-humble review "x-probe: {idea} — killed because: {reason}"
2) No — move on
```

Normal mode:
```
일찍 멈춘 건 실패가 아니라 시간을 아낀 겁니다.
왜 이 아이디어가 여기까지 왔는지 되돌아볼까요?
1) 네 → /x-humble review "x-probe: {idea} — 중단 이유: {reason}"
2) 아니요 — 넘어가기
```

---

## Command: verdict

Show the last probe verdict:

```bash
# Read .xm/probe/last-verdict.json and display
```

If no verdict exists: "No probe session found. Run `/x-probe \"your idea\"` to start."

## Command: list

List all past probe sessions from `.xm/probe/`:

```
📋 Probe History

  2026-03-31  "Payment system"          PROCEED ✅
  2026-03-28  "Real-time notifications"  KILL ❌
  2026-03-25  "Admin dashboard"          RETHINK 🔄
```

---

## Data Directory

Probe state is stored in `.xm/probe/`:

```
.xm/probe/
├── last-verdict.json          # Most recent probe result
└── history/
    └── {timestamp}-{slug}.json  # All past verdicts
```

---

## x-build Integration

When x-build init is called after a PROCEED verdict, automatically inject probe context:

```
# CONTEXT.md (auto-generated from probe)

## Probe Results (validated {date})

### Premises Validated
- ✅ [data-backed] {premise 1} — evidence: {evidence}
- ⚠ [heuristic] {premise 2} — partially validated: {caveat}

### Evidence Gaps (require early validation)
- 🔴 [assumption] {premise N} — no evidence yet. Test by: {cheapest test}
- 🟡 [heuristic] {premise M} — experience-based only. Validate by: {method}

### Kill Criteria
- Stop if: {condition}

### Risks to Monitor
- {risk from pre-mortem}
```

This gives x-build a head start — research phase can build on validated premises instead of starting from zero.

---

## Shared Config Integration

x-probe references shared config in `.xm/config.json`:

| Setting | Key | Default | Effect |
|---------|-----|---------|--------|
| Agent count | `agent_max_count` | `3` | Phase 3 runs 3 fixed agents (pre-mortem, inversion, alternatives) |
