# Subcommand: diff

Measure change volume and quality delta of x-kit plugins. Git-based quantitative analysis + optional quality comparison. Usage: `/x-eval diff [--from <commit>] [--to <commit>] [--quality]`.

## Subcommand: diff

**Measure change volume and quality delta of x-kit plugins. Git-based quantitative analysis + optional quality comparison.**

### Parsing

From `$ARGUMENTS`:
- `diff` (no arguments) = last tag/release commit vs HEAD
- `--from <commit>` = start commit (default: previous release commit)
- `--to <commit>` = end commit (default: HEAD)
- `--quality` = compare before/after of changed SKILL.md files for quality (expensive)
- `--rubric <name>` = rubric for quality comparison (default: plan-quality)
- `--baseline <tag>` = compare HEAD quality against a pinned reference tag (implies `--quality`; regression-focused output)

### Phase 1: Quantitative Analysis (git-based, immediate)

Run git commands via Bash:

```bash
# Detect changed plugins
git diff --name-only {from}..{to} -- '*/skills/*/SKILL.md' '*/lib/*.mjs' '*/.claude-plugin/*.json'

# Per-plugin change volume
git diff --stat {from}..{to} -- 'x-build/' 'x-op/' 'x-eval/' 'x-kit/' ...

# SKILL.md line count change
git show {from}:{path} | wc -l   # before
wc -l {path}                      # after

# Commit count
git log --oneline {from}..{to} | wc -l

# Version change
git show {from}:package.json | grep version
cat package.json | grep version
```

### Phase 2: Structural Analysis (leader parses)

Read changed SKILL.md files and extract structural changes:
- Strategy/command count change (e.g., 16 → 18 strategies)
- Option count change (e.g., 15 → 22 options)
- Newly added sections
- Removed sections

### Phase 3: Quality Comparison (only with `--quality`)

For each changed SKILL.md, perform before/after A/B comparison:

1. Extract before version: `git show {from}:{path}`
2. After version: current file
3. A/B comparison using [Subcommand: compare] logic (judge panel)
4. Compute quality delta (score delta) for each plugin

### Final Output

```
📊 [eval] Diff: {from_short}..{to_short} ({N} commits)

## Change Summary
| Plugin | Files | +Lines | -Lines | Net |
|--------|-------|--------|--------|-----|
| x-op | 2 | +176 | -2 | +174 |
| x-build | 3 | +139 | -4 | +135 |
| x-eval | 1 | +44 | 0 | +44 |
| x-kit | 4 | +49 | 0 | +49 |
| **Total** | **10** | **+408** | **-6** | **+402** |

## Structural Changes
| Plugin | Metric | Before | After | Delta |
|--------|--------|--------|-------|-------|
| x-op | strategies | 16 | 18 | +2 |
| x-op | options | 15 | 22 | +7 |
| x-op | SKILL.md lines | 1200 | 1645 | +445 |
| x-build | phases | 5 | 5 | 0 |
| x-build | sub-steps | 6 | 9 | +3 |
| x-build | SKILL.md lines | 650 | 803 | +153 |

## Key Changes
- x-op: +investigate, +monitor strategies added
- x-op: Self-Score Protocol, --verify, Consensus Loop
- x-build: PRD Generation, PRD Review, plan-check --strict
- x-eval: Reusable Judge Prompt

## Versions
| Plugin | Before | After |
|--------|--------|-------|
| x-op | 1.0.0 | 1.3.0 |
| x-build | 1.0.0 | 1.2.0 |
| x-eval | 1.0.0 | 1.1.0 |
| x-kit | 1.0.0 | 1.6.0 |
```

With `--quality`:
```
## Quality Comparison (plan-quality rubric)
| Plugin | Before | After | Delta | Verdict |
|--------|--------|-------|-------|---------|
| x-op SKILL.md | 6.8 | 8.2 | +1.4 | ✅ improved |
| x-build SKILL.md | 7.0 | 8.5 | +1.5 | ✅ improved |
```

With `--baseline <tag>`:
```
📊 [eval] Baseline regression check: v1.5.0 → HEAD

Rubric: plan-quality

| Plugin | Baseline | Current | Delta | Status |
|--------|----------|---------|-------|--------|
| x-eval SKILL.md | 8.1 | 7.4 | -0.7 | ⛔ REGRESSION |
| x-op SKILL.md | 8.3 | 8.5 | +0.2 | ✅ improved |
| x-build SKILL.md | 7.9 | 7.9 | 0.0 | ≈ unchanged |

⛔ 1 plugin regressed below baseline threshold (delta < -0.5).
   x-eval: -0.7 — review recent SKILL.md changes before release.
```

**Regression thresholds (--baseline mode):**
- `delta ≤ -0.5` → `⛔ REGRESSION` — flag before release
- `-0.5 < delta < 0` → `⚠ slight drop` — monitor
- `delta == 0` (within ±0.1) → `≈ unchanged`
- `delta > 0` → `✅ improved`

**--baseline execution flow:**
1. Resolve `--baseline <tag>` → `--from <tag> --to HEAD --quality`
2. Run standard diff Phases 1–3
3. Apply regression thresholds to quality deltas
4. Print regression summary above table; exit with non-zero signal if any `⛔ REGRESSION` found

**Typical use case:** CI gate — run `diff --baseline v{last-release}` before release commit; block if any ⛔.

### Storage

Save results to `.xm/eval/diffs/{timestamp}-diff.json`.

### Storage Schema

```json
{
  "type": "diff",
  "timestamp": "ISO8601",
  "from": "commit-sha",
  "to": "commit-sha",
  "commits": 12,
  "plugins": {
    "x-op": {
      "files_changed": 2,
      "lines_added": 176,
      "lines_removed": 2,
      "structure": {
        "strategies": { "before": 16, "after": 18 },
        "options": { "before": 15, "after": 22 },
        "skill_lines": { "before": 1200, "after": 1645 }
      },
      "quality": { "before": 6.8, "after": 8.2, "delta": 1.4 }
    }
  },
  "summary": "..."
}
```

## Applies to
Invoked via `/x-eval diff ...`. See Subcommand: list in SKILL.md for all available commands.
