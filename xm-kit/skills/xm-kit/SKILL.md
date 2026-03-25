---
name: xm-kit
description: x-mesh toolkit — list available tools and their status
---

<Purpose>
Show available x-mesh tools and their installation status.
</Purpose>

<Use_When>
- User asks "what tools are available"
- User says "xm-kit", "x-mesh tools"
</Use_When>

<Do_Not_Use_When>
- User wants a specific tool (use xm-build or xm-op directly)
</Do_Not_Use_When>

# xm-kit — x-mesh Toolkit

Show available tools:

```
x-mesh Toolkit (xm-kit)

Bundled tools (available now):
  /xm-build    Phase-based project harness — lifecycle, DAG, cost forecasting
  /xm-op       Strategy orchestration — refine, tournament, debate, review
  /xm-agent    Agent primitives — fan-out, delegate, broadcast, collect
  /xm-solver   Structured problem solving — decompose, iterate, constrain, pipeline

Coming soon:
  /xm-handoff  Session handoff between agents

Install bundle:     /plugin install xm-kit@xm-kit
Install individual: /plugin install xm-kit@xm-build
```

## Shared Config

xm-kit manages shared settings at `.xm/config.json` that all tools (xm-build, xm-solver, xm-op) reference.

### Commands

| Command | Description |
|---------|-------------|
| `xm-kit config show` | 현재 공유 설정 표시 |
| `xm-kit config set <key> <value>` | 설정 변경 |
| `xm-kit config get <key>` | 설정 값 조회 |

### Settings

| Key | Values | Default | Description |
|-----|--------|---------|-------------|
| `mode` | `developer`, `normal` | `developer` | 출력 스타일 (기술 용어 vs 쉬운 말) |
| `agent_level` | `min`, `medium`, `max` | `medium` | 에이전트 병렬 실행 수 제어 |

### Agent Level Profiles

| Level | Max Agents | Description |
|-------|-----------|-------------|
| `min` | 2 | 최소 에이전트, 토큰 절약 |
| `medium` | 4 | 균형 (기본값) |
| `max` | 8 | 최대 병렬, 토큰 무제한 |

### Config Resolution

각 도구는 아래 우선순위로 설정을 읽는다:
1. 도구별 로컬 config (`.xm/{tool}/config.json`)
2. 공유 config (`.xm/config.json`)
3. 기본값
