---
name: xm-solver
description: Structured problem solving — decompose, iterate, constrain, or auto-pipeline with strategy recommendation
---

<Purpose>
xm-solver는 복잡한 문제를 구조적으로 해결한다. 문제 유형을 자동 감지하여 최적 전략을 추천하되, 수동 선택도 가능하다.
4가지 전략: 분해(decompose), 반복(iterate), 제약(constrain), 자동(pipeline).
Stateful — 문제 상태를 `.xm/solver/`에 저장하여 세션 간 연속성 유지.
</Purpose>

<Use_When>
- User wants to solve a complex problem structurally
- User says "문제 해결", "분석해줘", "버그 찾아줘", "어떤 방법이 나을까"
- User describes a bug, error, design question, or multi-faceted problem
- User says "solve", "debug", "decompose", "어떻게 해야 하지"
</Use_When>

<Do_Not_Use_When>
- Simple one-off questions that don't need structured solving
- Project lifecycle management (use xm-build instead)
- Strategy orchestration without problem tracking (use xm-op instead)
</Do_Not_Use_When>

## Arguments

User provided: $ARGUMENTS

## Mode Detection

Check mode before every command:
```bash
node ${CLAUDE_PLUGIN_ROOT}/lib/xm-solver-cli.mjs mode show 2>/dev/null | head -1
```

## CLI

All commands via:
```bash
node ${CLAUDE_PLUGIN_ROOT}/lib/xm-solver-cli.mjs <command> [args]
```

Shorthand in this document: `$XMS` = `node ${CLAUDE_PLUGIN_ROOT}/lib/xm-solver-cli.mjs`

## Routing

Parse `$ARGUMENTS`의 첫 단어로 명령을 결정한다:

- `init` → [Command: init]
- `list` → Run `$XMS list`
- `status` → Run `$XMS status`
- `describe` → Run `$XMS describe --content "..."`
- `context` → Run `$XMS context <add|list>`
- `constraints` → Run `$XMS constraints <add|list|remove>`
- `classify` → [Command: classify]
- `strategy` → Run `$XMS strategy <set|show>`
- `solve` → [Command: solve]
- `solve-status` → Run `$XMS solve-status`
- `hypotheses` → Run `$XMS hypotheses <list|add|update>`
- `tree` → Run `$XMS tree <show|add|update>`
- `candidates` → Run `$XMS candidates <list|add|select|score>`
- `phase` → Run `$XMS phase <next|set>`
- `verify` → [Command: verify]
- `close` → Run `$XMS close`
- `history` → Run `$XMS history`
- `next` → [Command: next]
- `handoff` → Run `$XMS handoff [--restore]`
- 빈 입력 → 사용자에게 문제 설명 질문 (AskUserQuestion)
- 그 외 자연어 → [Command: auto] 문제 설명으로 간주하여 `init` + `classify`

## Natural Language Mapping

| User says | Action |
|-----------|--------|
| "이 버그 좀 해결해줘" | init → classify (likely iterate) |
| "어떤 방법이 나을까" | init → classify (likely constrain) |
| "이 문제 분석해줘" | init → classify (pipeline) |
| "분해해서 풀어봐" | init → strategy set decompose → solve |
| "가설 추가" | hypotheses add |
| "트리 보여줘" | tree show |
| "후보 목록" | candidates list |
| "검증해봐" | verify |
| "다음은?" | next |

---

## Agent Primitives

이 스킬은 Claude Code 내장 Agent tool만 사용한다:

### fan-out (병렬 에이전트)
하나의 메시지에서 N개의 Agent tool을 **동시에** 호출:
```
Agent tool 1: { description: "agent-1", prompt: "...", run_in_background: true, model: "sonnet" }
Agent tool 2: { description: "agent-2", prompt: "...", run_in_background: true, model: "sonnet" }
Agent tool 3: { description: "agent-3", prompt: "...", run_in_background: true, model: "sonnet" }
```

### delegate (단일 에이전트 위임)
```
Agent tool: { description: "역할명", prompt: "...", run_in_background: false, model: "opus" }
```

### broadcast (각각 다른 프롬프트)
fan-out과 동일하되 각 에이전트에게 다른 프롬프트 전달.

---

## Command: init

1. Run: `$XMS init "problem description"`
2. Parse JSON output (`action: "init"`)
3. 사용자에게 추가 정보 질문 (AskUserQuestion):
   - 문제의 배경/맥락
   - 관련 코드/파일
   - 제약조건
4. 답변 수집 후:
   ```bash
   $XMS context add --content "..." --type code
   $XMS constraints add "constraint" --type hard
   ```
5. 자동으로 classify 실행

## Command: classify

1. Run: `$XMS classify`
2. Parse JSON output (`action: "classify"`)
3. 사용자에게 결과 표시:
   - 추천 전략과 신뢰도
   - 추천 이유
   - 대안 전략 목록
4. AskUserQuestion으로 전략 선택:
   - 추천 전략 (Recommended)
   - 대안 전략들
5. 선택 후: `$XMS strategy set <chosen>`

## Command: solve

전략별 에이전트 오케스트레이션을 실행한다.

1. Run: `$XMS solve`
2. Parse JSON output (`action: "solve"`)
3. `strategy`와 `current_phase`에 따라 적절한 에이전트 오케스트레이션 실행:

### Strategy: decompose

#### Phase: decompose
**delegate** (architect, opus):
```
이 문제를 2-5개의 독립적인 하위 문제로 분해해주세요.

문제:
{problem_context}

각 하위 문제에 대해:
- ID (sp1, sp2, ...)
- 설명
- 난이도 (trivial/medium/hard)
- 다른 하위 문제와의 관계

JSON 형식으로 출력:
{ "sub_problems": [{ "id": "sp1", "description": "...", "difficulty": "medium" }] }
```

결과로 `$XMS tree add "description" --difficulty medium` 호출.
Advance: `$XMS solve-advance --phase explore`

#### Phase: explore
**fan-out** (N agents per sub-problem, sonnet):
각 하위 문제당 3개 에이전트가 병렬로 해결 방안 제시:
```
다음 문제에 대한 해결 방안을 제시해주세요:

하위 문제: {sub_problem.description}
전체 맥락: {problem_context}
제약조건: {constraints}

구체적이고 실행 가능한 해결 방안을 제시하세요.
```

결과로 `$XMS candidates add "description" --source agent-N --sub-problem spN`.
Advance: `$XMS solve-advance --phase evaluate`

#### Phase: evaluate
**delegate** (reviewer, sonnet):
```
각 하위 문제의 후보들을 평가하고 최적의 것을 선택해주세요.

후보 목록: {candidates}
제약조건: {constraints}

각 후보를 제약조건에 대해 0-10으로 점수 매기고, 최적을 선택하세요.
```

결과로 `$XMS candidates score <id> --constraint c1 --score 8`.
Advance: `$XMS solve-advance --phase synthesize`

#### Phase: synthesize
**delegate** (architect, opus):
```
선택된 하위 해결책들을 하나의 통합 솔루션으로 합성해주세요.

하위 해결책: {selected_candidates}
전체 문제: {problem_context}
제약조건: {constraints}

충돌이 있다면 해결하고, 최종 통합 솔루션을 제시하세요.
```

결과로 최종 candidate 생성 + select.

### Strategy: iterate

#### Phase: hypothesize
**delegate** (debugger, sonnet):
```
이 문제에 대해 3-5개의 가설을 생성해주세요.

문제: {problem_context}
맥락: {additional_context}

각 가설에 대해:
- 설명
- 찬성 증거
- 반대 증거
- 검증 방법

JSON 형식으로 출력.
```

결과로 `$XMS hypotheses add "description"`.
Advance: `$XMS solve-advance --phase test`

#### Phase: test
**fan-out** (1 agent per hypothesis, sonnet):
```
다음 가설을 검증해주세요:

가설: {hypothesis.description}
문제: {problem_context}

코드를 읽고, 로그를 확인하고, 필요하면 명령을 실행하여 검증하세요.
결과: confirmed / refuted / inconclusive + 근거
```

결과로 `$XMS hypotheses update <id> --status confirmed|refuted|inconclusive`.
Advance: `$XMS solve-advance --phase refine`

#### Phase: refine
검증된(confirmed/inconclusive) 가설 확인:
- 모두 refuted → hypothesize로 돌아감 (iteration 증가)
- confirmed 있음 → resolve로 진행
- max_iterations 도달 → 가장 유력한 가설로 resolve

`$XMS solve-advance --phase resolve` 또는 `$XMS solve-advance --phase hypothesize`

#### Phase: resolve
**delegate** (executor, sonnet):
```
확인된 가설을 기반으로 해결책을 구현/설명해주세요.

확인된 가설: {confirmed_hypotheses}
문제: {problem_context}

구체적인 해결 방안을 제시하세요.
```

결과로 candidate 생성 + select.

### Strategy: constrain

#### Phase: elicit
**delegate** (analyst, opus):
```
이 문제의 모든 제약조건을 추출하고 분류해주세요.

문제: {problem_context}
기존 제약: {constraints}

추가로 발견한 제약조건을:
- hard (반드시 충족)
- soft (가능하면 충족)
- preference (선호)

로 분류해주세요.
```

결과로 `$XMS constraints add "description" --type hard|soft|preference`.
Advance: `$XMS solve-advance --phase generate`

#### Phase: generate
**fan-out** (N agents, sonnet):
각 에이전트가 서로 다른 soft constraint를 최적화하는 후보 생성:
```
다음 문제에 대한 해결책을 제시해주세요.
특히 {focus_constraint}를 최적화하되, 모든 hard constraint를 충족하세요.

문제: {problem_context}
Hard constraints: {hard_constraints}
Soft constraints: {soft_constraints}
```

결과로 `$XMS candidates add "description" --source agent-N`.
Advance: `$XMS solve-advance --phase evaluate`

#### Phase: evaluate
**broadcast** (multi-perspective, sonnet):
각 에이전트가 다른 관점에서 후보들을 점수화:
```
다음 후보들을 {perspective} 관점에서 평가해주세요.

후보: {candidates}
제약조건: {constraints}

각 후보를 각 제약조건에 대해 0-10으로 점수 매겨주세요.
```

결과로 `$XMS candidates score <id> --constraint c1 --score N`.
Advance: `$XMS solve-advance --phase select`

#### Phase: select
**delegate** (architect, opus):
```
점수 결과를 종합하여 최적의 후보를 선택해주세요.

후보별 점수: {candidate_scores}
제약조건: {constraints}

트레이드오프를 분석하고 최종 추천을 제시하세요.
Hard constraint 실패 시 어떤 제약이 충돌하는지 식별하세요.
```

결과로 `$XMS candidates select <id>`.

### Strategy: pipeline

#### Phase: classify
`$XMS classify` 실행하여 문제 유형 감지.
결과에 따라 적절한 전략을 자동 선택.

#### Phase: route
선택된 전략(decompose/iterate/constrain)의 solve 워크플로우를 실행.

#### Phase: meta-verify
해결 후 추가 검증: 원래 문제를 실제로 해결했는지 확인.
실패 시 대안 전략으로 재시도.

---

## Command: verify

1. Run: `$XMS verify`
2. Parse JSON output (`action: "verify"`)
3. 점수가 없는 제약조건이 있다면:
   - **delegate** (verifier, sonnet) 에이전트로 검증:
     ```
     이 해결책이 다음 제약조건을 충족하는지 검증해주세요.
     해결책: {selected_candidate}
     제약조건: {unscored_constraints}
     ```
4. 결과를 사용자에게 표시
5. 통과 시: `$XMS phase next` → close 추천
6. 실패 시: 어떤 제약이 미충족인지 표시, solve로 복귀 추천

## Command: next

1. Run: `$XMS next`
2. Parse JSON output (`action: "next"`)
3. `recommendation`에 따라 적절한 명령 자동 실행:
   - `init` → 사용자에게 문제 설명 질문
   - `describe` → 설명 추가 요청
   - `classify` → classify 실행
   - `strategy set` → 전략 선택 질문
   - `solve` → solve 실행
   - `candidates select` → 후보 선택 질문
   - `verify` → verify 실행
   - `close` → close 실행

## Command: auto

`$ARGUMENTS`가 자연어 문제 설명인 경우:
1. `$XMS init "description"`
2. `$XMS classify`
3. 추천 전략을 사용자에게 보여주고 확인
4. `$XMS strategy set <chosen>`
5. `$XMS solve` 실행

---

## Shared Config Integration

xm-solver는 `.xm/config.json`의 공유 설정을 참조한다:

| 설정 | 키 | 기본값 | 영향 |
|------|-----|--------|------|
| 모드 | `mode` | `developer` | 출력 스타일 |
| 에이전트 수 | `agent_level` | `medium` (4) | `solving.parallel_agents` 미설정 시 기본 에이전트 수 결정 |

설정 변경: `xm-kit config set agent_level max`

로컬 config의 `solving.parallel_agents`가 설정되어 있으면 shared config보다 우선한다.

---

## Quick Reference

```
xm-solver — Structured Problem Solving

Strategies:
  decompose    🌳 Tree-of-Thought: break → solve → merge
  iterate      🔄 Hypothesis → Test → Refine loop
  constrain    🎯 Constraints → Candidates → Score → Select
  pipeline     🔀 Auto-detect → Route to best strategy

Workflow:
  init "desc"         Start a new problem
  classify            Auto-recommend strategy
  strategy set <s>    Choose strategy
  solve               Execute strategy
  verify              Check solution
  close               Wrap up

Management:
  list / status / next / history / handoff
```
