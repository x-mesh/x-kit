# x-memory Schema & Storage

Data model and retrieval logic for x-memory cross-session persistence.

## Memory Schema

### Index Entry (`index.json`)

```json
{
  "id": "mem-001",
  "title": "Choose PostgreSQL",
  "type": "decision",
  "tags": ["database", "architecture"],
  "created": "2026-03-25T12:00:00Z",
  "ttl": null,
  "expires_at": null,
  "related_files": ["src/db/connection.ts"],
  "confidence": "high",
  "source": "x-build:my-project",
  "why": "ACID requirements, team experience"
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
title: Choose PostgreSQL
type: decision
tags: [database, architecture]
created: 2026-03-25T12:00:00Z
ttl: null
expires_at: null
confidence: high
source: x-build:my-project
related_files:
  - src/db/connection.ts
why: ACID requirements, team experience
---

## Choose PostgreSQL

### Background (WHY)
ACID compliance required. Entire team has PostgreSQL experience.

### Details (WHAT)
- PostgreSQL 16
- Connection pooling: PgBouncer (transaction mode)
- Migrations: Flyway

### Impact (IMPACT)
Superior JSON query performance over MySQL. Sufficient read performance without a separate cache layer.
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

## Applies to

Every x-memory read/write touches this schema. Session-start auto-inject uses Relevance Matching rules.
