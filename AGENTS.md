# x-kit Agent Directory

x-kit is a Claude Code plugin marketplace providing 5 tools for structured multi-agent orchestration.
Agent primitives are handled by `x-agent`; strategies by `x-op`; project lifecycle by `x-build`.

## Agent Tiers

| Tier | Model | Use For | Cost |
|------|-------|---------|------|
| Quick | haiku | Exploration, documentation, scanning | Low |
| Standard | sonnet | Implementation, debugging, testing, review | Medium |
| Deep | opus | Architecture, planning, critical review | High |

## Role Presets (x-agent)

| Preset | Model | Description |
|--------|-------|-------------|
| explorer | haiku | Codebase exploration, structure mapping |
| se | sonnet | Implementation, refactoring, testing |
| sre | sonnet | Infrastructure, monitoring, SLO, incidents |
| architect | opus | System design, trade-offs, ADR |
| reviewer | sonnet | Code review, quality, maintainability |
| security | sonnet | OWASP, vulnerabilities, auth/authz |
| debugger | sonnet | Error tracing, root cause, regression isolation |
| optimizer | sonnet | Performance profiling, caching, query tuning |
| documenter | haiku | API docs, README, changelog, onboarding |
| verifier | sonnet | Evidence-based completion checks, test adequacy |
| planner | opus | Structured consultation, work plan generation |
| critic | opus | Plan review, gap detection, simulation |
| test-engineer | sonnet | Test strategy, TDD, coverage, flaky test hardening |
| build-fixer | sonnet | Build/type error resolution, minimal diffs |

## OMC Integration

When oh-my-claudecode is installed, x-build maps agent types to OMC agents:

| x-agent Preset | OMC Agent (`oh-my-claudecode:*`) | Fallback |
|-----------------|----------------------------------|----------|
| explorer | explore | Inline preset |
| se / executor | executor | Inline preset |
| architect | architect | Inline preset |
| reviewer | code-reviewer | Inline preset |
| security | security-reviewer | Inline preset |
| debugger | debugger | Inline preset |
| documenter | writer | Inline preset |
| verifier | verifier | Inline preset |
| planner | planner | Inline preset |
| critic | critic | Inline preset |
| test-engineer | test-engineer | Inline preset |
| build-fixer | build-fixer | Inline preset |

When OMC is NOT installed, x-agent inline presets provide equivalent behavior.

## Development Conventions

- Plugin skill development: `sonnet` tier by default
- Architecture decisions and planning: `opus` tier
- Exploration and documentation: `haiku` tier
- x-build `run` auto-selects tier by task size (small/medium -> sonnet, large -> opus)
- Always verify with `verifier` preset before claiming completion
