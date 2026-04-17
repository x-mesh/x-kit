# x-review Data Directory

State persistence layout and JSON/MD schemas for review artifacts.

## Directory Layout

Review state is stored in `.xm/review/`.

```
.xm/review/
├── last-result.json                    # Latest review result (JSON)
├── last-result.md                      # Latest review result (Markdown, human-readable)
└── history/
    └── {YYYY-MM-DD}-{ref-slug}.md      # Past review reports
```

## Review Result MD Save (MANDATORY)

After every review completes, save the Phase 4 final output as an MD file under `.xm/review/`. **This step cannot be skipped.**

1. `last-result.md` — latest review result (overwrite)
2. `history/{YYYY-MM-DD}-{ref-slug}.md` — preserve history

**ref-slug generation:**
- `diff HEAD~1` → `head-1`
- `pr 142` → `pr-142`
- `diff main..HEAD` → `main-head`
- `full` → `full`
- `file src/auth.ts` → `file-src-auth-ts`

**MD file content:** Save Phase 4 final output (verdict, findings, summary table, observations) as-is.
Prepend metadata at the top of the file:
```markdown
# x-review: {target} — {verdict}
- Date: {YYYY-MM-DD HH:MM}
- Branch: {branch}
- Lenses: {lenses}
- Agents: {N}
- Findings: {count} (Critical: {n}, High: {n}, Medium: {n}, Low: {n})

---
{Phase 4 output}
```

## last-result.json Schema

```json
{
  "timestamp": "ISO8601",
  "target": { "type": "diff|pr|file", "ref": "HEAD~1|142|src/auth.ts" },
  "lenses": ["security", "logic", "perf", "tests"],
  "agents": 4,
  "verdict": "LGTM|Request Changes|Block",
  "findings": [
    {
      "severity": "Critical|High|Medium|Low",
      "file": "src/auth.ts",
      "line": 42,
      "description": "SQL injection via unsanitized user input",
      "fix": "Use parameterized query",
      "lenses": ["security", "logic"],
      "consensus": true
    }
  ],
  "summary": {
    "security": { "total": 2, "critical": 1, "high": 1, "medium": 0, "low": 0 },
    "logic":    { "total": 1, "critical": 0, "high": 1, "medium": 0, "low": 0 },
    "perf":     { "total": 1, "critical": 0, "high": 0, "medium": 1, "low": 0 },
    "tests":    { "total": 0, "critical": 0, "high": 0, "medium": 0, "low": 0 }
  }
}
```

## Applies to

Phase 4 finalization writes `.xm/review/last-result.{md,json}` + appends to history.
