---
name: x-ship
description: Release automation — commit squash, version bump, changelog, push. Works with any project.
---

<Purpose>
Squash WIP commits into meaningful units, bump versions, and push releases.
Works with x-kit marketplace plugins AND standalone projects.
</Purpose>

<Use_When>
- User says "ship", "release", "ship it", "릴리스", "배포"
- User wants to clean up commit history before release
- User wants to bump versions and push
</Use_When>

<Do_Not_Use_When>
- Deploy to production servers (use CI/CD or /land-and-deploy)
- Create a PR without releasing (use git directly)
</Do_Not_Use_When>

## Wiring

```
after: x-review
suggests: x-humble
```

# x-ship — Release Automation

Commit squash + version bump + push. Works with any git project.

## Model Routing

| Subcommand | Model | Reason |
|------------|-------|--------|
| `status`, `dry-run` | **haiku** (Agent tool) | Read-only display |
| `squash` (diff analysis) | main model | Requires reasoning about code scope |
| `interactive` (no args) | main model | Multi-step with quality gates + AskUserQuestion |
| `auto`, `patch/minor/major` | main model | Multi-step orchestration |

## Mode Detection

Read mode from `.xm/config.json` (`mode` field). Default: `developer`.

## Arguments

User provided: `$ARGUMENTS`

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

## Routing

- Empty → [Mode: interactive] (pre-release pipeline with quality gates)
- `auto` → [Mode: auto] (squash + release, no gates)
- `status` → [Mode: status]
- `squash` → [Mode: squash only]
- `dry-run` → [Mode: dry-run]
- `patch` / `minor` / `major` → [Mode: manual bump]

---

## Mode: status

Show release state. Delegate to **haiku**.

```bash
# Last release tag/commit
LAST_RELEASE=$(git log --grep="^release:" --format="%h %s" -1 2>/dev/null || echo "none")

# Commits since last release
SINCE=$(git log --grep="^release:" --format=%H -1 2>/dev/null || git rev-list --max-parents=0 HEAD)
COMMITS=$(git log --oneline $SINCE..HEAD | head -20)
COUNT=$(git log --oneline $SINCE..HEAD | wc -l | tr -d ' ')
```

Output:
```
📊 x-ship Status

  Last release: {hash} {message}
  Commits since: {count}

  {commit list}

  Suggestion: {squash recommendation}
```

---

## Mode: dry-run

Preview without any changes. Delegate to **haiku**.

Same analysis as auto mode Steps 1-2, but output preview only:
```
🔍 [dry-run] Release Preview

  Squash plan:
    Group 1: "feat: cost efficiency improvements" (3 commits → 1)
    Group 2: "chore: remove .xm/ from history" (1 commit, keep as-is)
    Group 3: "docs: model routing" (2 commits → 1)

  Would bump: 1.19.16 → 1.19.17 (patch)
  Would push to: origin/main
```

---

## Mode: interactive

Pre-release pipeline with quality gates. Triggered when `/x-ship` is called with no arguments.

### Step 0.1: Show status

```bash
LAST_RELEASE=$(git log --grep="^release:" --format=%H -1 2>/dev/null)
if [ -z "$LAST_RELEASE" ]; then
  LAST_RELEASE=$(git rev-list --max-parents=0 HEAD)
fi
COUNT=$(git log --oneline $LAST_RELEASE..HEAD | wc -l | tr -d ' ')
```

Output:
```
📊 릴리스 준비 상태

  마지막 릴리스: {hash} {message}
  대기 커밋: {count}개

  {commit list, max 20}
```

If 0 commits → "릴리스할 변경사항이 없습니다." Exit.

### Step 0.2: Select pipeline

Use AskUserQuestion:
```
릴리스 전 검증을 어떻게 할까요?

1) 테스트 → 리뷰 → 릴리스 (full pipeline, 추천)
2) 리뷰만 → 릴리스
3) 바로 릴리스 (squash + bump + push)
```

### Step 0.3: Test gate (option 1 only)

Auto-detect test command:

| Marker file | Test command |
|-------------|-------------|
| `package.json` | `bun test` or `npm test` |
| `Cargo.toml` | `cargo test` |
| `pyproject.toml` / `setup.py` | `pytest` |
| `go.mod` | `go test ./...` |
| `Makefile` with test target | `make test` |

If no test command detected → skip with warning: "테스트 명령어를 감지하지 못했습니다. 리뷰로 넘어갑니다."

Run tests via Bash. If tests fail, use AskUserQuestion:
```
❌ 테스트 실패

1) 실패를 무시하고 계속
2) 릴리스 중단
```

Record `test_passed: true|false` for metrics.

### Step 0.4: Review gate (option 1 or 2)

Invoke x-review:
```
/x-review diff $LAST_RELEASE..HEAD --preset quick
```

Gate on verdict:
- **LGTM** → proceed
- **Request Changes** → show findings, AskUserQuestion:
  ```
  리뷰에서 수정 사항이 발견되었습니다.

  1) 무시하고 릴리스 계속
  2) 릴리스 중단하고 수정
  ```
- **Block** → "리뷰가 릴리스를 차단했습니다. 수정 후 다시 시도하세요." Exit.

Record `review_verdict` for metrics.

### Step 0.5: Proceed to auto flow

Continue to [Mode: auto] (Step 1 onwards), carrying test/review results for metrics.

---

## Mode: squash only

Run Step 1 (squash) without releasing.

---

## Mode: auto

Full flow: squash → bump → commit → push.

### Step 1: SQUASH — Commit Consolidation

#### 1.1 Identify range

**CRITICAL: Squash only LOCAL (unpushed) commits. Never squash commits already on remote.**

```bash
# Find last release commit
LAST_RELEASE=$(git log --grep="^release:" --format=%H -1 2>/dev/null)
if [ -z "$LAST_RELEASE" ]; then
  LAST_RELEASE=$(git rev-list --max-parents=0 HEAD)
fi

# ALL commits since last release (for version bump / changelog)
git log --oneline $LAST_RELEASE..HEAD

# LOCAL-ONLY commits (squash candidates) — NOT yet pushed to remote
LOCAL_ONLY=$(git log --oneline origin/main..HEAD)
LOCAL_COUNT=$(echo "$LOCAL_ONLY" | grep -c . || echo 0)
```

**Squash scope:**
- `origin/main..HEAD` = LOCAL commits only → these are squash candidates
- `$LAST_RELEASE..HEAD` = ALL commits since release → used for changelog/version bump, NOT for squash

If LOCAL_COUNT = 0 → all commits already pushed. **Skip squash entirely**, proceed to Step 2 (bump + release commit + push).
If LOCAL_COUNT = 1-2 → Skip squash, proceed to Step 2.
If LOCAL_COUNT = 3+ → Proceed with squash (local commits only).

**If squash is skipped (all pushed):** no force push needed. Just add release commit and `git push`.

#### 1.2 Auto-group commits (diff-based)

Analyze `git diff` per commit to understand actual code changes, then group by scope.

**Step 1.2.1: Collect per-commit diffs**

```bash
for COMMIT in $(git log --format=%H $LAST_RELEASE..HEAD --reverse); do
  echo "=== $COMMIT ==="
  git diff --stat $COMMIT~1..$COMMIT
  git diff $COMMIT~1..$COMMIT | head -200
done
```

**Step 1.2.2: Classify each commit's diff**

For each commit, analyze the **diff content** (not the message):

| Classification | Detection |
|---------------|-----------|
| Public API change | `+export` or `-export` in diff (JS/TS), `+pub` (Rust), capitalized function (Go) |
| Internal refactor | Changes within function bodies, no export/signature changes |
| Test change | Files matching `*.test.*`, `*.spec.*`, `__tests__/`, `test/` |
| Docs change | `*.md` files, comments-only changes |
| Config/infra | `*.json`, `*.yml`, `*.toml`, `Dockerfile`, `.gitignore` |

**Step 1.2.3: Group by module scope**

Grouping rules (priority order):

1. **Same module scope** — Commits with overlapping diff hunks (same file + adjacent lines) → same group
2. **Public API vs internal** — Separate export-facing changes from internal refactors, even in the same file
3. **Test follows source** — Test changes group with corresponding source (`src/foo.ts` ↔ `test/foo.test.ts`)
4. **Standalone** — Config, docs, or unrelated scope → keep separate

**Step 1.2.4: Generate squash messages from diff**

For each group, generate a message by summarizing **what the diff does**, not copying WIP messages:
- Read actual additions/deletions
- Format: `{type}: {what changed} — {why it matters}`

**Output:**

```
📦 커밋 정리 계획 (diff 분석 기반)

  Group 1: feat: add budget guard to cost module (3 commits)
    Scope: lib/x-build/core.mjs, lib/x-build/tasks.mjs
    Diff: +85 -12 lines, 2 new exports (checkBudget, STRATEGY_MULTIPLIERS)
    → "feat: add cost efficiency — model profiles, budget guards, strategy multipliers"

  Group 2: chore: remove .xm/ from git history (1 commit)
    Scope: .gitignore
    Diff: +2 -3 lines, config only
    → Keep as-is

  Group 3: feat: add model routing to SKILL.md files (2 commits)
    Scope: x-kit/skills/*/SKILL.md
    Diff: +49 lines, docs only
    → "docs: add model routing tables — haiku for display, sonnet+ for reasoning"
```

#### 1.3 Confirm with user

Use AskUserQuestion:
```
커밋을 정리할까요?

1) 위 계획대로 squash (추천)
2) 모든 커밋을 하나로 squash
3) 그대로 유지 (squash 안 함)
4) 직접 수정
```

#### 1.4 Execute squash

**Method: soft reset + re-commit** (safer than rebase)

```bash
# Save current HEAD
CURRENT=$(git rev-parse HEAD)

# Soft reset to last release (keeps all changes staged)
git reset --soft $LAST_RELEASE

# Now re-commit in groups
# For each group, selectively stage and commit
```

For single squash (option 2):
```bash
git reset --soft $LAST_RELEASE
git commit -m "feat: [generated summary of all changes]"
```

For grouped squash (option 1):
```bash
git reset --soft $LAST_RELEASE

# Group 1: stage specific files and commit
git reset HEAD -- .  # unstage all
git add [group1 files]
git commit -m "[group1 message]"

# Group 2: stage and commit
git add [group2 files]
git commit -m "[group2 message]"

# Group 3: remaining files
git add -A
git commit -m "[group3 message]"
```

#### 1.5 Verify squash

```bash
# Verify no changes lost
git diff $CURRENT HEAD  # should be empty
```

If diff is non-empty → rollback: `git reset --hard $CURRENT`

### Step 2: VERSION BUMP

#### 2.1 Detect project type

| Marker file | Project type | Version location |
|-------------|-------------|-----------------|
| `.claude-plugin/marketplace.json` | x-kit marketplace | marketplace.json + plugin.json + package.json |
| `package.json` (no marketplace) | Node.js project | package.json |
| `Cargo.toml` | Rust project | Cargo.toml |
| `pyproject.toml` | Python project | pyproject.toml |
| `go.mod` | Go project | git tags only |
| None | Generic | git tags only |

#### 2.2 Detect changed sub-plugins (x-kit marketplace only)

When project type is `x-kit marketplace`, map changed files to sub-plugins:

```bash
# Get changed files since last release (post-squash)
git diff --name-only $LAST_RELEASE..HEAD
```

| Path pattern | Sub-plugin |
|-------------|-----------|
| `x-agent/**` | x-agent |
| `x-build/**` | x-build |
| `x-op/**` | x-op |
| `x-kit/**` | x-kit |
| `x-eval/**` | x-eval |
| `x-review/**` | x-review |
| `x-trace/**` | x-trace |
| `x-memory/**` | x-memory |
| `x-solver/**` | x-solver |
| `x-probe/**` | x-probe |
| `x-humble/**` | x-humble |
| `x-ship/**` | x-ship (bundled in x-kit) |

Display per-plugin change summary:
```
📊 변경된 플러그인:
  x-kit    🔄 5 files (lib/shared-config.mjs, lib/x-build/core.mjs, ...)
  x-build  🔄 2 files (lib/x-build/tasks.mjs, skills/x-build/SKILL.md)
  x-agent  ✅ no changes
```

#### 2.3 Determine bump level (diff-based)

If explicit (`patch`/`minor`/`major` in args) → use that for all changed plugins.

Otherwise, analyze the actual diff to determine the appropriate bump:

```bash
git diff $LAST_RELEASE..HEAD
```

**Diff analysis rules (highest match wins):**

| Diff pattern | Bump | Detection |
|-------------|------|-----------|
| Export removed | **major** | `-export function/class/const` without corresponding `+` line |
| Export param removed/reordered | **major** | Export function signature changed incompatibly |
| New export added | **minor** | `+export function/class/const` not in old tree |
| New file with exports | **minor** | New file containing `export` statements |
| Export param added (optional) | **minor** | New optional parameter in existing export |
| Function body changed (no export change) | **patch** | Internal changes only |
| Docs/comments only | **patch** | Only `*.md` or comment changes |
| Tests only | **patch** | Only test files changed |
| Config/infra only | **patch** | Config, CI, Docker files |

**Display analysis to user:**

```
🔍 버전 분석 (diff 기반)

  Breaking changes: 없음
  New exports: 2 (checkBudget, STRATEGY_MULTIPLIERS)
  Modified exports: 1 (getModelForRole — param 추가, 하위호환)
  Internal changes: 5 files
  Tests: 1 file (82 lines 추가)
  Docs: 2 files

  추천: minor (새 export 추가)
```

Confirm with AskUserQuestion:
```
버전을 어떻게 올릴까요? (현재: X.Y.Z)

1) patch (X.Y.Z+1) — 내부 변경만
2) minor (X.Y+1.0) — 새 기능/export 추가 (추천, diff 분석 기반)
3) major (X+1.0.0) — breaking change
```

#### 2.4 Update version files

**x-kit marketplace:**

For each changed sub-plugin:
1. Read `{plugin}/.claude-plugin/plugin.json` → Edit version field
2. Read `.claude-plugin/marketplace.json` → Edit matching plugin version
3. If x-kit (meta bundle) is not in changed list but any sub-plugin changed → bump x-kit too (patch)
4. Update `package.json` → sync root version with x-kit version

**Node.js project:**
- `package.json` → version field

**Others:**
- Update the detected version file, or create git tag

### Step 3: README SYNC (x-kit marketplace only)

**This step cannot be skipped.**

For each changed plugin, delegate a **sonnet agent** with this prompt:

```
## README Sync Check

Plugin: {plugin_name}
SKILL.md path: {plugin}/skills/{plugin}/SKILL.md
README.md section: find by "### {plugin_name}" or plugin description

1. Read SKILL.md and README.md section for this plugin
2. Compare and produce a diff checklist:

| Item | SKILL.md | README | Action |
|------|----------|--------|--------|
| Description | "..." | "..." | UPDATE / OK |
| Commands | cmd1, cmd2 | cmd1 | ADD cmd2 |
| Options/flags | ... | ... | ADD / OK |

3. For each ADD/UPDATE, produce the specific Edit
4. If all OK: "README up to date for {plugin_name}"

Rules:
- README is concise — not a SKILL.md copy
- Only add/update what changed
- Both README.md (English) and README.ko.md (Korean) must stay in sync
```

Run agents for all changed plugins in parallel.

**Checklist (must pass before Step 4):**
- [ ] Every changed plugin has a README section
- [ ] New commands/options reflected in README
- [ ] README.md and README.ko.md are in sync

### Step 4: COMMIT + PUSH

```bash
git add -A
git commit -m "release: {name}@{version}

{per-plugin changelog summary}
- {plugin1}: {change description}
- {plugin2}: {change description}"

git push origin {branch}
```

**Force push should not be necessary.** Squash targets local-only commits, so a regular `git push` is sufficient. If force push is required, the squash range was set incorrectly — stop and verify.

### Step 4.5: METRICS — Record release checkpoint to x-trace

Append a checkpoint entry to x-trace for velocity and quality tracking.

```bash
mkdir -p .xm/traces
TRACE_FILE=".xm/traces/x-ship-$(date +%Y%m%d-%H%M%S).jsonl"
```

Write checkpoint:
```json
{
  "id": "ship-{timestamp}",
  "timestamp": "{ISO 8601}",
  "type": "checkpoint",
  "source": "x-ship",
  "label": "release",
  "data": {
    "version_from": "{old}",
    "version_to": "{new}",
    "bump_level": "{patch|minor|major}",
    "commits_before_squash": "{N}",
    "commits_after_squash": "{M}",
    "test_passed": "{true|false|null}",
    "review_verdict": "{LGTM|Request Changes|null}",
    "files_changed": "{count}",
    "lines_added": "{count}",
    "lines_deleted": "{count}"
  }
}
```

`test_passed` and `review_verdict` are `null` when gates were skipped.

### Step 5: OUTPUT

```
🚀 Shipped!

  Squashed: {N} commits → {M} commits
  Version: {old} → {new}
  Branch: {branch}
  Commit: {hash}
  Push: origin/{branch} ✅

  Changed plugins:
    x-kit    1.19.16 → 1.19.17
    x-build  1.13.0  → 1.13.0 (no change)

  Quality gates:
    Tests:  ✅ passed / ❌ failed / ⏭️ skipped
    Review: LGTM / Request Changes / ⏭️ skipped
    Churn:  +{added} -{deleted} across {files} files

  Metrics recorded to: .xm/traces/x-ship-{timestamp}.jsonl

  Users can update:
    /x-kit update
    /reload-plugins
```

---

## Safety Rules

- **Squash local-only commits** — only commits not yet pushed (`git log origin/main..HEAD`) are squash candidates. Never squash commits already on remote. Squashing pushed commits requires force push and breaks others' history.
- **No force push (principle)** — applying squash only to local commits means force push is never needed. Needing force push is itself a signal that the squash range was set incorrectly.
- **No changes = no release** — prevent empty releases
- **Squash verification** — always `git diff $CURRENT HEAD` before/after to confirm no code lost
- **Not on main = warn** — "현재 브랜치가 main이 아닙니다. 계속?"
- **Rollback on failure** — save pre-squash HEAD (`CURRENT`), restore with `git reset --hard $CURRENT` on any error
- **README sync mandatory** — never skip Step 3 for x-kit marketplace releases
- **Quality gates are advisory** — test failures and review findings can be overridden by user, but are always recorded in metrics

---

## Standalone Usage (non x-kit projects)

x-ship works in any git project:

```
/x-ship              # auto: squash + bump + push
/x-ship status       # show commits since last release
/x-ship squash       # squash only, no release
/x-ship dry-run      # preview plan
/x-ship patch        # explicit patch bump
```

Version detection adapts to project type (package.json, Cargo.toml, pyproject.toml, git tags).
No `.xm/config.json` required — works with defaults.

For standalone projects, Step 2.2 (sub-plugin detection) and Step 3 (README sync) are skipped.

---

## Migration from x-release

x-ship supersedes x-release. During the transition period both coexist.

| Feature | x-release | x-ship |
|---------|-----------|--------|
| Commit squash | ❌ | ✅ Step 1 |
| Version bump | ✅ | ✅ Step 2 |
| Sub-plugin detection | ✅ | ✅ Step 2.2 |
| README sync | ✅ | ✅ Step 3 |
| Force push safety | ❌ | ✅ |
| Non x-kit projects | ❌ | ✅ |
| Dry-run preview | ❌ | ✅ |
| Diff-based analysis | ❌ | ✅ Step 1.2, 2.3 |
| Pre-release gates (test + review) | ❌ | ✅ Interactive mode |
| Release metrics (x-trace) | ❌ | ✅ Step 4.5 |

Once x-ship is validated in 2-3 releases, x-release can be retired.

---

## Trace Recording

x-ship MUST record trace entries to `.xm/traces/` during execution. See x-trace SKILL.md "Trace Directive Template" for the full schema.

### On start (MUST)
```bash
SESSION_ID="x-ship-$(date +%Y%m%d-%H%M%S)-$(openssl rand -hex 2)"
mkdir -p .xm/traces && echo "{\"type\":\"session_start\",\"session_id\":\"$SESSION_ID\",\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\",\"v\":1,\"skill\":\"x-ship\",\"args\":{}}" >> .xm/traces/$SESSION_ID.jsonl
```

### Per agent call (SHOULD — best-effort)
Record agent_step after each agent completes.

### On end (MUST)
Record session_end with total duration, agent count, and status.

### Rules
1. session_start and session_end are **MUST** — never skip
2. agent_step is **SHOULD** — best-effort
3. **Metadata only** — never include output content in trace entries
4. If trace write fails, continue — never block execution
