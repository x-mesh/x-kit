---
name: x-memory
description: Cross-session decision and pattern memory — persist learnings, auto-inject relevant context on session start
---

<Purpose>
x-memory persists project decisions, patterns, failures, and learnings across sessions. On session start it auto-injects relevant memories into agent context. Goes beyond x-build's per-project decisions by supporting cross-project search, tagging, TTL, and human-readable markdown storage.
</Purpose>

<Use_When>
- User wants to save a decision, pattern, failure, or learning for future sessions
- User says "remember this", "save this", "remember this for later"
- User asks to recall or search past decisions ("how did we do this before?", "recall auth")
- Session starts and relevant context should be injected automatically
- User wants to export/import memory across machines or projects
- User asks for memory statistics or a list of saved memories
</Use_When>

<Do_Not_Use_When>
- Storing ephemeral session notes that don't need to survive context resets (use x-build decisions instead)
- Storing large binary artifacts or generated code files
- Replacing version-controlled documentation (ADR, CHANGELOG)
</Do_Not_Use_When>

# x-memory — Cross-Session Decision and Pattern Memory

## Model Routing

| Subcommand | Model | Reason |
|------------|-------|--------|
| `list`, `search`, `get`, `stats` | **haiku** (Agent tool) | Read-only query and display |
| `save`, `update`, `delete` | **haiku** (Agent tool) | Simple write operations |
| `inject` (context injection) | **sonnet** | Requires reasoning about relevance |

For haiku-eligible commands, delegate via: `Agent tool: { model: "haiku", prompt: "Run: [command]" }`

## Mode Detection

Read mode from `.xm/config.json` (`mode` field). Default: `developer`.

**Developer mode**: Use technical terms (TTL, verdict, tag, inject). Concise.

**Normal mode**: Use plain, accessible language.
- Prefer user-friendly terms: "TTL" → "retention period", "verdict" → "result", "inject" → "auto-load", "tag" → "label"
- Lead with the key information; keep responses concise

## CLI

All commands via:
```bash
node ${CLAUDE_PLUGIN_ROOT}/lib/x-memory-cli.mjs <command> [args]
```

Shorthand in this document: `$XMM` = `node ${CLAUDE_PLUGIN_ROOT}/lib/x-memory-cli.mjs`

> **⚠ When using Bash tool, always define a shell function first:**
> ```bash
> xmm() { node "${CLAUDE_PLUGIN_ROOT}/lib/x-memory-cli.mjs" "$@"; }
> xmm save "decision text" --type decision
> ```
> **Forbidden:** Assigning `XMM="node ..."` then calling `$XMM save` — zsh treats the entire quoted string as a single command name and fails with `no such file or directory`.
> When running multiple commands sequentially, define the function on the first line then call `xmm <command>` afterward.
> Alternative: use the unified dispatcher `x-kit memory <command>` — no function needed.

---

## Commands

### Save
```
save <title> --type decision|pattern|failure|learning [--why "reason"] [--tags "t1,t2"] [--ttl 30d]
```
Persist a memory entry to `.xm/memory/`.

Options:
- `--type` — Memory category (required): `decision`, `pattern`, `failure`, `learning`
- `--why` — Short rationale or summary (stored in memory front-matter)
- `--tags` — Comma-separated tags for search and filtering
- `--ttl` — Time-to-live before expiry (e.g. `7d`, `30d`, `90d`). Omit for permanent.
- `--files "a.ts,b.ts"` — Related source files
- `--confidence high|medium|low` — Confidence level (default: `high`)
- `--source "x-build:project-name"` — Origin context

Example:
```
/x-memory save "Choose JWT auth" --type decision --why "Easy horizontal scaling, no server state needed" --tags "auth,architecture"
```

Output:
```
[memory] Saved: mem-003 "Choose JWT auth"
  Type: decision | Tags: auth, architecture
  Stored: .xm/memory/memories/mem-003.md
```

### Recall
```
recall <query>
```
Search memories by keyword or tag overlap. Matches against title, content, tags, and `--why` rationale.

Example:
```
/x-memory recall "auth"
```

Output:
```
[memory] 2 memories found for "auth"

  mem-003 [decision] Choose JWT auth (2026-03-25)
    Tags: auth, architecture | Confidence: high
    → Easy horizontal scaling, no server state needed

  mem-001 [pattern] Middleware auth chain (2026-03-20)
    Tags: auth, middleware | Confidence: medium
    → validateToken → checkPermission → handler
```

### Inject
```
inject
```
Reads current context (open files, recent git changes, active x-build project) and finds relevant memories to inject into the agent prompt.

Relevance is determined by keyword overlap between memory titles/tags and:
1. File paths currently open or recently edited
2. Active x-build project name and phase
3. Recent git commit messages (last 10)

Output:
```
[memory] Injected 3 relevant memories:
  - mem-003: Choose JWT auth (decision)
  - mem-001: Middleware auth chain (pattern)
  - mem-007: Rate limiting failure case (failure)
```

After injecting, print the full content of each matched memory so the agent can use it.

### List
```
list [--type decision|pattern|failure|learning] [--tag <tag>] [--since 7d]
```
List memories with optional filters.

Options:
- `--type` — Filter by memory type
- `--tag` — Filter by tag (partial match)
- `--since` — Show only memories created within the given window (e.g. `7d`, `30d`)
- `--expired` — Include expired memories in output

Example:
```
/x-memory list --type decision --since 30d
```

Output:
```
[memory] 4 decisions (last 30d)

  mem-003  Choose JWT auth             2026-03-25  auth,architecture
  mem-008  Choose PostgreSQL            2026-03-22  database,architecture
  mem-012  Adopt monorepo structure     2026-03-18  monorepo,build
  mem-015  API versioning (URL prefix)  2026-03-10  api,versioning
```

### Show
```
show <id>
```
Print the full content of a single memory entry.

Example:
```
/x-memory show mem-003
```

Output:
```
[memory] mem-003 — Choose JWT auth
  Type: decision | Confidence: high
  Tags: auth, architecture
  Created: 2026-03-25T12:00:00Z | TTL: none
  Source: x-build:my-project
  Related files: src/auth/jwt.ts, src/middleware/auth.ts

---
## Choose JWT auth

### Background (WHY)
Horizontal scaling requirements and the stateless architecture decision ruled out session-based auth.

### Details (WHAT)
- JWT (HS256) issuance: access token 15 min, refresh token 7 days
- Token blacklist stored in Redis (on refresh token revocation)
- Middleware chain: validateToken → extractClaims → checkPermission

### Impact (IMPACT)
No session store needed; no synchronization required for horizontal scaling. Accepted the tradeoff that tokens cannot be revoked instantly.
```

### Forget
```
forget <id>
```
Delete a memory entry permanently. Removes both the index entry and the markdown file.

Example:
```
/x-memory forget mem-003
```

Output:
```
[memory] Deleted: mem-003 "Choose JWT auth"
```

### Export
```
export [--format md|json]
```
Export all non-expired memories to stdout or a file.

Options:
- `--format md` — One markdown file with all memories concatenated (default)
- `--format json` — Full index + content as JSON
- `--output <file>` — Write to file instead of stdout

Example:
```
/x-memory export --format json --output .xm/memory/backup.json
```

Output:
```
[memory] Exported 29 memories → .xm/memory/backup.json
```

### Import
```
import <file>
```
Import memories from a previously exported file. Skips duplicates by title+type match.

Example:
```
/x-memory import .xm/memory/backup.json
```

Output:
```
[memory] Import complete
  Imported: 27 | Skipped (duplicate): 2 | Errors: 0
```

### Stats
```
stats
```
Show memory statistics including type distribution, tag frequency, and expiry status.

Example:
```
/x-memory stats
```

Output:
```
[memory] Statistics

| Type     | Count | Avg Age |
|----------|-------|---------|
| decision | 12    | 15d     |
| pattern  | 8     | 22d     |
| failure  | 3     | 5d      |
| learning | 6     | 10d     |

Total: 29 memories | 0 expired | 2 expiring within 7d
Tags: auth(5), database(4), api(3), architecture(3), middleware(2), ...
Storage: .xm/memory/ | Index: 29 entries | Files: 29
```

---

## Session Start: Auto-Inject Protocol

At the beginning of every session, run `inject` automatically to surface relevant memories:

1. Run: `$XMM inject`
2. Parse output — list of matched memory IDs and titles
3. If matches found, read each matched `.xm/memory/memories/<id>.md`
4. Prepend memory content to agent context as a block:

```
[x-memory: auto-injected context]
─────────────────────────────────
<content of mem-003>
<content of mem-001>
<content of mem-007>
─────────────────────────────────
```

5. Proceed with user request

If no memories match, skip silently — do not mention memory to the user.

---

## Memory Schema & Storage

See `references/memory-schema.md` — schema definitions, `.xm/memory/` storage layout, memory types (decision/bug/incident/idea/code_snippet/lesson), and relevance matching rules for session-start auto-inject.

---

## Integration with x-build

See `references/x-build-integration.md` — auto-surface decisions + requirements + failure patterns during x-build phase transitions.

---

## Trace Recording

See `references/trace-recording.md` — session_start/session_end are automatic via `.claude/hooks/trace-session.mjs`; emit best-effort `agent_step` entries for long sub-operations.

## Natural Language Mapping

| User says | Command |
|-----------|---------|
| "remember this", "save this" | `save` |
| "how did we do this before?", "recall ..." | `recall` |
| "load related memories", "inject" | `inject` |
| "list memories", "show all memories" | `list` |
| "show this memory", "show mem-001" | `show` |
| "delete this", "forget this" | `forget` |
| "export", "export memories" | `export` |
| "import", "import memories" | `import` |
| "stats", "memory stats" | `stats` |

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I'll save everything just in case" | Memory bloat is worse than no memory — it drowns signal. Save decisions and surprises, not code or state. Code lives in git; memory is for the reasoning behind it. |
| "This is obvious, no need to memorize" | Obvious today, forgotten next session. If it took thinking to arrive at, it's worth saving. If it was instant, probably not. |
| "I can re-derive it later" | Re-derivation is the most expensive form of lookup — you pay the thinking cost twice. Memory is the cheapest. |
| "I already saved something similar" | Duplicates drift apart and confuse future-you. Update the existing entry instead — that's why update exists. |
| "The user will tell me what to remember" | Memory is your job, not theirs. Proactively save what's worth saving — they'll tell you what to forget, not what to keep. |
| "git history already has the context I need" | git history has code changes. Memory has the *why* behind them — the part that isn't in any diff. |
| "I'll clean up memories later" | Later never comes. Prune on save, not on audit. One stale memory poisons the search results of every future recall. |
