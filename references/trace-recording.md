# Trace Recording

Reference for plugins emitting trace entries. session_start/session_end are automatic via `.claude/hooks/trace-session.mjs`.

session_start and session_end are **automatic** — recorded by `.claude/hooks/trace-session.mjs` on Skill tool invocation. No manual action needed.

### Per agent call (SHOULD — best-effort)

Read session ID from `.xm/traces/.active`, then record agent_step with role, model, estimated tokens, duration, and status. Use parent_id for fan-out trees (null for root agents).

### Rules
1. session_start/session_end — **automatic** via hook, do not emit manually
2. agent_step — **best-effort**, record when possible
3. **Metadata only** — never include LLM output or verdicts in trace entries
4. If trace write fails, log to stderr and continue — never block strategy execution

## Applies to

Used by 9 plugins: x-memory, x-build, x-solver, x-eval, x-op, x-probe, x-humble, x-review, x-agent
