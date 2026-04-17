---
name: x-kit
description: x-mesh toolkit — list available tools and their status
---

<Purpose>
Show available x-mesh tools and their installation status.
</Purpose>

<Use_When>
- User asks "what tools are available"
- User says "x-kit", "x-mesh tools"
</Use_When>

<Do_Not_Use_When>
- User wants a specific tool (use x-build or x-op directly)
</Do_Not_Use_When>

# x-kit — x-mesh Toolkit

## First-Run Init Check

**Before executing any x-kit subcommand** (except `init` itself), verify the project is initialized:

1. Check `test -f .claude/hooks/trace-session.mjs` in the current working directory.
2. If **missing**, pause the requested command and prompt via AskUserQuestion:
   - header: `x-kit init`
   - option 1 label: `Yes (권장)` — description: `hooks + settings + x-sync client 설치`
   - option 2 label: `Skip sync` — description: `hooks + settings만, x-sync 제외`
   - option 3 label: `No` — description: `이번만 건너뛰기`
3. Before the AskUserQuestion, print:
   ```
   ⚠ x-kit이 이 프로젝트에 초기화되지 않았습니다.
     설치 항목: trace hook, block-marketplace hook, .claude/settings.json, x-sync client
   ```
4. On **Yes** → run `x-kit init`. On **Skip sync** → run `x-kit init --skip-sync`. On **No** → proceed with the original command without init (do not re-prompt this session).
5. After init completes, resume the originally requested subcommand.

Skip this check when the user explicitly invokes `x-kit init`, `x-kit doctor`, or passes `--no-init-check`.

For a fuller picture (not just trace-session.mjs), suggest `x-kit doctor` — but the fast `test -f` check is sufficient as the entry gate.

## Model Routing

| Subcommand | Model | Reason |
|------------|-------|--------|
| `version`, `update`, `agents list/match/get` | **haiku** (Agent tool) | Read-only, no reasoning needed |
| `cost`, `cost --session` | **haiku** (Agent tool) | Read-only aggregation |
| `config show/set/get/reset` | **haiku** (Agent tool) | Simple command execution |
| `config` (interactive wizard) | **sonnet** | Requires AskUserQuestion |
| `init`, `init --dry-run`, `init --skip-sync`, `init --with-server`, `init --rollback` | **sonnet** | Multi-step install orchestration (backup + hooks + settings merge + curl) |
| `doctor`, `doctor --fix` | **sonnet** | Diagnostic reasoning + conditional AskUserQuestion for network fixes |
| `pipeline list`, `validate` | **haiku** (Agent tool) | Read-only display |
| `pipeline <name>` | **sonnet** | Multi-step orchestration with AskUserQuestion |

For haiku-eligible commands, delegate via: `Agent tool: { model: "haiku", prompt: "Run: [command]" }`

### Model Guardrail

Before delegating to haiku, verify the task is display/query only. If ANY of the following apply, use sonnet or higher — never haiku:

| Signal | Example | Why |
|--------|---------|-----|
| Produces analysis or recommendations | code review, plan critique, risk assessment | Reasoning quality degrades |
| Generates or modifies code | implement feature, fix bug, refactor | Edge case handling (NaN, negative, boundary) drops significantly |
| Multi-step orchestration | strategy execution, pipeline run | Loses coherence across steps |
| Evaluates quality | x-eval scoring, x-probe validation | Calibration requires stronger model |

If a haiku-eligible command receives `--thorough` or similar depth flags, escalate to sonnet.

**Scope:** This guardrail applies to top-level command routing only. Sub-agents spawned by the leader inherit the leader's model context and do not require a separate routing check.

**Violation output:** If the leader detects a reasoning task routed to haiku (e.g., via user override or misconfigured pipeline), prepend this warning to the output:
```
⚠️ Model mismatch: this task requires reasoning but is running on haiku.
   Results may miss edge cases. Re-run without --model haiku for full quality.
```

## AskUserQuestion Dark-Theme Rule

**CRITICAL:** The `question` field in AskUserQuestion is invisible on dark terminals.

**Visibility map:**
| Element | Visible | Use for |
|---------|---------|---------|
| `header` | ✅ YES | Short context tag (e.g., "x-op bump", "Pipeline") |
| `question` | ❌ NO | Keep minimal — user cannot see this text |
| option `label` | ✅ YES | Primary info — must be self-explanatory |
| option `description` | ✅ YES | Supplementary detail |

**Always follow this pattern:**
1. Output ALL context (descriptions, status, analysis) as **regular markdown text** BEFORE calling AskUserQuestion
2. `header`: put the key context here (visible, max 12 chars)
3. `question`: keep short, duplicate of header is fine (invisible to user)
4. Option `label` + `description`: carry all decision-relevant information

**WRONG:** Putting context in `question` field → user sees blank space above options
**RIGHT:** Print context as markdown first, use `header` for tag, options for detail

Show available tools:

```
x-mesh Toolkit (x-kit)

Bundled tools (available now):
  /x-build    Phase-based project harness — lifecycle, DAG, cost forecasting
  /x-op       Strategy orchestration — refine, tournament, debate, review
  /x-agent    Agent primitives — fan-out, delegate, broadcast, collect
  /x-solver   Structured problem solving — decompose, iterate, constrain, pipeline

Pipeline:
  /x-kit pipeline <name>    Run a named plugin pipeline (release, full, etc.)
  /x-kit pipeline list      Show all pipelines (config + auto-discovered)
  /x-kit validate           Check Wiring DAG for cycles and errors

Install bundle:     /plugin install x-kit@x-kit
Install individual: /plugin install x-kit@x-build
```

## Sub-file Loading

**Progressive disclosure — use the Read tool to load the required sub-file BEFORE emitting any subcommand output.** The stubs below give you routing + key flags; the sub-file holds the executable procedure (bash blocks, schemas, node -e heredocs). If you generate a subcommand response without first reading the sub-file, you have fabricated the procedure.

Mechanism (strict):
1. **Locate the base directory.** The Claude Code skill loader substitutes `${CLAUDE_PLUGIN_ROOT}` to an absolute path when rendering this SKILL.md, and also injects a `Base directory for this skill: <absolute path>` header at the top of the prompt. Either source gives you the real absolute path already — just read it off.
2. **Resolve the sub-file path** — look up the subcommand in the routing table below to get the `Required file` (e.g., `commands/init.md`), then pass `${CLAUDE_PLUGIN_ROOT}/skills/x-kit/<Required file>` to the Read tool. Since the skill loader substitutes `${CLAUDE_PLUGIN_ROOT}` in the rendered SKILL.md content you see, the path you send to Read is already absolute.
3. **Fallback (only if step 2 fails — corrupted cache, edge case):** resolve the path via Bash `ls -d ~/.claude/plugins/cache/x-kit/x-kit/*/skills/x-kit/ | sort -V | tail -1` — `sort -V` on the full path picks the semver-latest version (so `1.31.10` beats `1.9.0`). Use that path as your base.
4. Then execute the procedure found in that file.

| Subcommand | Required file |
|------------|---------------|
| `cost`, `cost --session` | `commands/cost.md` |
| `init`, `init --dry-run`, `init --skip-sync`, `init --with-server`, `init --rollback` | `commands/init.md` |
| `doctor`, `doctor --fix` | `commands/doctor.md` |
| `version`, `update`, `update <plugin>` | `commands/version-update.md` |
| `pipeline <name>`, `pipeline list`, `validate` | `commands/pipeline.md` |
| `config`, `config show/set/get/reset` | `commands/config.md` |
| `agents list/match/get` | `references/agent-catalog.md` |
| (any cross-plugin data flow question) | `references/cross-plugin-pipeline.md` |

## Status Symbols

Two parallel conventions — do not mix them.

**Install actions** (init output):
| Symbol | Meaning |
|--------|---------|
| `➕ installed` | New item written |
| `🔄 updated` | Existing item replaced with newer content |
| `✅ already installed` | Content matches, no change |
| `🚫 skipped` | User flag skipped this step |
| `🔍 would install/update` | Dry-run preview only |

**Health status** (doctor output):
| Symbol | Meaning |
|--------|---------|
| `✅` | OK |
| `⚠️` | Degraded — works but suboptimal |
| `❌` | Broken — feature unavailable |
| `⏭️` | Not applicable for this context |

## Cost

Load `commands/cost.md` before executing. Aggregates `cost_usd` from `.xm/build/metrics/sessions.jsonl`, grouped by type and model. Flags: `--session` (current session only).

## Init

Load `commands/init.md` before executing. Installs `trace-session.mjs` hook, merges hook entries into `.claude/settings.json` (auto-backup of prior settings, keeps 5 most recent), and runs `curl ... | bash -s client` to install x-sync. Flags: `--dry-run` (preview, no writes), `--skip-sync` (hooks only), `--with-server` (also installs x-sync server, needs Bun), `--rollback` (restores settings.json from most recent backup). Uses install-action symbols above.

## Doctor

Load `commands/doctor.md` before executing. Checks: trace-session hook presence + freshness, settings.json hook entries, x-sync PATH, Bun. Emits health symbols above. Flags: `--fix` (auto re-runs `x-kit init` for local fixes; AskUserQuestion before network installs). **Note:** `block-marketplace-copy.mjs` check only applies inside the x-kit repo — it is intentionally omitted from per-project installs.

## Version & Update

Load `commands/version-update.md` before executing. `version` compares `installed_plugins.json` vs marketplace `.claude-plugin/marketplace.json`. `update [plugin]` **MUST** run `cd ~/.claude/plugins/marketplaces/x-kit && git pull origin main` first (step 1, non-skippable), then `claude plugin update <name>@x-kit -s user`. After update, hint user to run `/reload-plugins` and consider `x-kit init` for hook refresh.

## Cross-Plugin Pipeline

Load `references/cross-plugin-pipeline.md` — data-schema reference. Defines the `xkit_payload` v1 envelope (version, source, type, content, metadata) and the producer/consumer matrix for x-build ↔ x-op ↔ x-eval. Use this when reasoning about what data flows between plugins.

## Pipeline

Load `commands/pipeline.md` — runtime execution reference. Combines SKILL.md Wiring declarations (`after:` = auto-run, skip on upstream failure; `suggests:` = prompt user, default N, show regardless) with user-defined named pipelines in `.xm/config.json` under `pipelines.<name>`. **Config pipeline overrides SKILL.md Wiring completely — no merge.** Modes: interactive (default, `[Y/n/skip]` per step), `--auto` (silent, halt on failure), `--dry-run` (plan only).

## Shared Config

Load `commands/config.md` before executing. `config` with no args = interactive wizard via AskUserQuestion over 5 settings (model_profile, budget, agent_max_count, mode, model_overrides). `set/get/show/reset` are direct CLI. Scope: default global (`~/.xm/config.json`); `--local` writes to `.xm/config.json`; `budget` defaults to local (per-project).

## Agent Catalog

Load `references/agent-catalog.md` before executing. 37 specialist agents at `x-kit/agents/` with two layers — `rules/<name>.md` (full, ~240 lines) and `slim/<name>.md` (~30 lines, for prompt injection). CLI: `node ${CLAUDE_PLUGIN_ROOT}/lib/agent-catalog.mjs {list|match "<topic>" --count N|get <name> [--slim]}`. Consumed by x-op broadcasts, x-review `--specialists`, x-solver fan-out, x-build research.

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I'll write my own config parser" | x-kit's shared config exists for cross-plugin consistency. Duplicating it creates drift that sync-bundle can't catch and that users can't debug. |
| "I'll guess the cost, close enough" | Cost estimates are cheap; surprise bills are expensive. Use the cost engine — it's one call. |
| "Model routing is overengineering" | Model routing is ~78% savings on haiku-eligible commands. That's math, not engineering. |
| "This doesn't need a DAG, tasks are trivial" | DAGs make dependencies explicit. Trivial tasks with implicit dependencies are how parallel runs silently serialize on shared state. |
| "The model guardrail will catch wrong routing" | The guardrail is a safety net, not a planner. Use it for defense in depth, not as your first line of thinking. |
| "I don't need to read shared config, defaults are fine" | Defaults are fine in isolation. Cross-plugin coordination requires reading the actual config — otherwise plugins disagree about state. |
| "Agent catalog is a nice-to-have" | The catalog is how agent rules get discovered across sessions. Without it, every new agent spawn starts from scratch. |
