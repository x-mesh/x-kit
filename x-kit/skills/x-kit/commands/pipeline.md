# x-kit pipeline

Automated plugin chaining via SKILL.md Wiring declarations + user-defined pipelines.

## Wiring Protocol

Each plugin can declare dependencies in its SKILL.md:

```markdown
## Wiring
after: x-build:verify       # auto-run after this plugin completes
suggests: x-humble           # suggest to user (default: N)
```

| Keyword | Meaning | On upstream failure |
|---------|---------|-------------------|
| `after` | Auto-run when upstream completes | **skip + warn** |
| `suggests` | Prompt user after completion | Show regardless |

## User Pipeline Override

Users can define named pipelines in `.xm/config.json`:

```json
{
  "pipelines": {
    "release": ["x-review", "x-ship"],
    "full": ["x-review", "x-eval", "x-ship", "x-humble"]
  }
}
```

**Rule: config pipeline overrides SKILL.md Wiring completely.** No merge.

## Commands

| Command | Description |
|---------|-------------|
| `x-kit pipeline <name>` | Execute a named pipeline |
| `x-kit pipeline list` | Show all defined pipelines |
| `x-kit pipeline <name> --auto` | Execute without confirmation prompts |
| `x-kit pipeline <name> --dry-run` | Preview execution plan |
| `x-kit validate` | Check DAG for cycles and unknown plugin references |

## Model Routing

See the [Model Routing](../SKILL.md#model-routing) table in SKILL.md for `pipeline list`, `pipeline validate`, and `pipeline <name>` model assignments.

## Execution Modes

| Mode | Flag | Behavior |
|------|------|----------|
| **interactive** (default) | (none) | Confirm before each step: `[Y/n/skip]` |
| **auto** | `--auto` | Run all steps, stop only on failure |
| **dry-run** | `--dry-run` | Show plan without executing |

## pipeline <name>

1. Read `.xm/config.json` → check `pipelines.<name>`
   - If found → use that array as execution order
   - If not found → build DAG from all plugins' `## Wiring` sections (topological sort)
2. For each step:
   - **interactive**: Show step, execute, ask `"다음: {next} → 계속할까요? [Y/n/skip]"`
   - **auto**: Execute silently, halt on failure with `"❌ {plugin} 실패. 1) 재시도 2) 건너뛰기 3) 중단"`
3. After all steps, show `suggests` plugins: `"💡 {plugin} 실행을 추천합니다. 실행할까요? [y/N]"` (default N)

Output format:
```
📋 Pipeline: {name} ({N} steps)

[1/N] {plugin}
  ... (output) ...
  ✅ 완료

  다음: {next} → 계속할까요? [Y/n/skip]

[2/N] {plugin}
  ...

Pipeline complete — {passed}/{total} passed
💡 x-humble (회고) 실행을 추천합니다. 실행할까요? [y/N]
```

## pipeline list

Show all named pipelines from config + auto-discovered DAG:

```
📋 Pipelines

  Named (from .xm/config.json):
    release     x-review → x-ship (2 steps)
    full        x-review → x-eval → x-ship → x-humble (4 steps)

  Auto (from Wiring):
    x-build:verify → x-review → x-eval
                          └──→ x-ship → (suggests) x-humble
```

## validate

Parse all `*/skills/*/SKILL.md` files for `## Wiring` sections.
Check:
- No cycles in DAG (topological sort)
- All referenced plugin names exist
- No duplicate edges

Output: `✅ DAG valid — {N} nodes, {E} edges` or `❌ {error details}`
