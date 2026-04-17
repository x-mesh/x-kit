# Plugin Integration

## x-op Integration (Research Phase)

The `research` command's 4-agent fan-out can optionally be replaced with x-op's `refine` strategy for iterative convergence:

```
# Default: 4-agent parallel fan-out (stack, features, architecture, pitfalls)
$XMB research "goal"

# Alternative: Use x-op refine for Diverge→Converge→Verify rounds
# Invoke /x-op refine "goal" instead, then save results:
$XMB save requirements --content "..."
$XMB save roadmap --content "..."
```

Use x-op refine when the goal is ambiguous and benefits from multiple iteration rounds.

## x-solver Integration (Execute Phase)

For complex sub-problems within a task, x-solver can be invoked:

```
# During task execution, if a sub-problem needs structured decomposition:
# Invoke /x-solver decompose "sub-problem"
# Then feed the solution back into the task
```

## Shared Decision Context

x-build decisions (`decisions add/list/inject`) can be injected into x-solver sessions:

```bash
# Export decisions for other tools
$XMB decisions inject
# Output: markdown of recent decisions — paste into x-solver context
```

Future: shared `.xm/shared/decisions.json` for automatic cross-tool context.

## Applies to

How x-build uses x-op (alternative to 4-agent research), x-solver (sub-problem decomposition), x-kit shared decisions, and future shared-state plans.
