---
name: x-memory
description: Cross-session decision and pattern memory — persist learnings, auto-inject relevant context on session start
---

<Purpose>
x-memory persists project decisions, patterns, failures, and learnings across sessions. On session start it auto-injects relevant memories into agent context. Goes beyond x-build's per-project decisions by supporting cross-project search, tagging, TTL, and human-readable markdown storage.
</Purpose>

<Use_When>
- User wants to save a decision, pattern, failure, or learning for future sessions
- User says "기억해줘", "저장해줘", "나중에도 기억해"
- User asks to recall or search past decisions ("이전에 어떻게 했지?", "recall auth")
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

## CLI

All commands via:
```bash
node ${CLAUDE_PLUGIN_ROOT}/lib/x-memory-cli.mjs <command> [args]
```

Shorthand in this document: `$XMM` = `node ${CLAUDE_PLUGIN_ROOT}/lib/x-memory-cli.mjs`
When executing via Bash tool, always use the full command — do NOT assign to a shell variable.

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
/x-memory save "JWT 인증 선택" --type decision --why "수평 확장 용이, 서버 상태 불필요" --tags "auth,architecture"
```

Output:
```
[memory] Saved: mem-003 "JWT 인증 선택"
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
/x-memory recall "인증"
```

Output:
```
[memory] 2 memories found for "인증"

  mem-003 [decision] JWT 인증 선택 (2026-03-25)
    Tags: auth, architecture | Confidence: high
    → 수평 확장 용이, 서버 상태 불필요

  mem-001 [pattern] 미들웨어 인증 체인 (2026-03-20)
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
  - mem-003: JWT 인증 선택 (decision)
  - mem-001: 미들웨어 인증 체인 (pattern)
  - mem-007: rate limiting 실패 사례 (failure)
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

  mem-003  JWT 인증 선택              2026-03-25  auth,architecture
  mem-008  PostgreSQL 선택            2026-03-22  database,architecture
  mem-012  모노레포 구조 채택          2026-03-18  monorepo,build
  mem-015  API 버전 전략 (URL prefix) 2026-03-10  api,versioning
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
[memory] mem-003 — JWT 인증 선택
  Type: decision | Confidence: high
  Tags: auth, architecture
  Created: 2026-03-25T12:00:00Z | TTL: none
  Source: x-build:my-project
  Related files: src/auth/jwt.ts, src/middleware/auth.ts

---
## JWT 인증 선택

### 배경 (WHY)
수평 확장 요구사항과 서버 무상태(stateless) 아키텍처 결정에 따라 세션 기반 인증을 제외.

### 내용 (WHAT)
- JWT (HS256) 발급: 액세스 토큰 15분, 리프레시 토큰 7일
- 토큰 블랙리스트는 Redis에 저장 (리프레시 토큰 폐기 시)
- 미들웨어 체인: validateToken → extractClaims → checkPermission

### 영향 (IMPACT)
세션 스토어 불필요, 수평 확장 시 별도 동기화 없음. 토큰 즉시 폐기 불가 트레이드오프 수용.
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
[memory] Deleted: mem-003 "JWT 인증 선택"
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

## Memory Schema

### Index Entry (`index.json`)

```json
{
  "id": "mem-001",
  "title": "PostgreSQL 선택",
  "type": "decision",
  "tags": ["database", "architecture"],
  "created": "2026-03-25T12:00:00Z",
  "ttl": null,
  "expires_at": null,
  "related_files": ["src/db/connection.ts"],
  "confidence": "high",
  "source": "x-build:my-project",
  "why": "ACID 요구사항, 팀 경험치"
}
```

Field notes:
- `ttl` — Human-readable duration string (`"30d"`) or `null` for permanent
- `expires_at` — ISO8601 computed from `created + ttl`, or `null`
- `source` — Free-form string, convention: `"x-build:<project>"` or `"manual"`
- `confidence` — `"high"` | `"medium"` | `"low"`

### Memory File (`.xm/memory/memories/<id>.md`)

```markdown
---
id: mem-001
title: PostgreSQL 선택
type: decision
tags: [database, architecture]
created: 2026-03-25T12:00:00Z
ttl: null
expires_at: null
confidence: high
source: x-build:my-project
related_files:
  - src/db/connection.ts
why: ACID 요구사항, 팀 경험치
---

## PostgreSQL 선택

### 배경 (WHY)
ACID 요구사항 충족 필요. 팀 전원 PostgreSQL 경험 보유.

### 내용 (WHAT)
- PostgreSQL 16 사용
- Connection pooling: PgBouncer (transaction mode)
- 마이그레이션: Flyway

### 영향 (IMPACT)
MySQL 대비 JSON 쿼리 성능 우위. 별도 캐시 레이어 없이도 충분한 읽기 성능.
```

---

## Storage Layout

```
.xm/memory/
├── index.json              # Memory index — all metadata, no content
└── memories/
    ├── mem-001.md          # Individual memory files (markdown + frontmatter)
    ├── mem-002.md
    └── mem-003.md
```

- All state in `.xm/memory/` — no external dependencies
- `index.json` is the source of truth for search and listing
- Individual `.md` files are human-readable and git-committable
- IDs are auto-incremented: `mem-001`, `mem-002`, ...

---

## Memory Types

| Type | When to use | Retention |
|------|-------------|-----------|
| `decision` | Architectural or technology choices | Permanent (no TTL) |
| `pattern` | Recurring implementation patterns | Long (90d default) |
| `failure` | Mistakes, anti-patterns, dead ends | Medium (30d default) |
| `learning` | New insights, discoveries | Medium (30d default) |

Default TTL by type (applied when `--ttl` is not specified):
- `decision` → no TTL (permanent)
- `pattern` → `90d`
- `failure` → `30d`
- `learning` → `30d`

---

## Relevance Matching (inject)

Relevance is computed by keyword overlap. Steps:

1. Collect context signals:
   - Active x-build project name and phase (from `.xm/build/`)
   - Recent git changes: `git diff --name-only HEAD~5 HEAD`
   - Recently modified files (last 24h)

2. Tokenize signals into keywords (split on `/`, `-`, `_`, `.`, space)

3. For each memory in `index.json`, compute overlap score:
   - Title words: weight 2
   - Tags: weight 3
   - `why` field words: weight 1

4. Return memories with score > 0, sorted by score descending, limit 5

---

## Integration with x-build

x-build decisions can be promoted to x-memory for cross-session persistence:

```bash
# In x-build, after listing decisions:
node .../x-build-cli.mjs decisions list

# Promote a key decision to x-memory:
$XMM save "JWT 인증 선택" --type decision --why "..." --tags "auth" --source "x-build:my-project"
```

### x-build decisions → x-memory 자동 승격 규칙

x-build에서 중요한 결정이 내려지면 x-memory에 자동 저장을 제안한다:

| 조건 | 동작 |
|------|------|
| `decisions add --type architecture` | 자동 저장 제안 (type: decision) |
| `decisions add --type tradeoff` | 자동 저장 제안 (type: decision) |
| 동일 프로젝트에서 3+ decisions 누적 | 일괄 promote 제안 |
| `close` 시 decisions 5개 이상 | `"💡 {N}개 결정을 x-memory에 저장할까요?"` |

저장 형식:
```bash
x-memory save "{decision.title}" --type decision \
  --why "{decision.rationale}" \
  --tags "{decision.type},{project_name}" \
  --source "x-build:{project_name}"
```

### x-review findings → x-memory failure 자동 저장

x-review에서 반복 발견되는 Critical/High 이슈를 x-memory에 failure로 저장:

| 조건 | 동작 |
|------|------|
| Critical finding (모든 경우) | 자동 저장 제안 (type: failure) |
| 동일 파일/패턴 High가 2회+ 발견 | 자동 저장 제안 (type: pattern) |
| Block 판정 | 전체 findings 요약을 failure로 저장 제안 |

저장 형식:
```bash
x-memory save "{finding.description}" --type failure \
  --why "x-review {verdict}: {severity} in {file}:{line}" \
  --tags "review,{lens},{severity}" \
  --related-files "{file}"
```

### x-op 전략 결과 → x-memory learning 저장

x-op 전략 완료 후 Self-Score가 높은 결과를 learning으로 보존:

| 조건 | 동작 |
|------|------|
| Self-Score ≥ 8.0 | `"💡 이 결과를 기억할까요?"` 제안 (type: learning) |
| `--verify` 통과 (score ≥ threshold) | 전략 + rubric + score를 learning으로 저장 제안 |
| compose 파이프라인 성공 | 파이프라인 조합을 pattern으로 저장 제안 |

---

## Natural Language Mapping

| User says | Command |
|-----------|---------|
| "기억해줘", "저장해줘" | `save` |
| "이전에 어떻게 했지?", "recall ..." | `recall` |
| "관련 기억 불러와", "inject" | `inject` |
| "기억 목록", "list memories" | `list` |
| "이 기억 보여줘", "show mem-001" | `show` |
| "삭제해줘", "잊어줘" | `forget` |
| "내보내기", "export" | `export` |
| "가져오기", "import" | `import` |
| "통계", "stats" | `stats` |
