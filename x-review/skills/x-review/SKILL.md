---
name: x-review
description: Multi-perspective code review orchestrator — PR diff analysis with severity-rated findings and LGTM verdict
allowed-tools:
  - AskUserQuestion
---

<Purpose>
x-review takes a PR diff, file, or directory as input and runs multiple review agents in parallel. Each agent reports findings from a dedicated perspective (security, logic, performance, test coverage) in severity + file:line format. The leader then produces a consolidated report with an LGTM / Request Changes / Block verdict.
</Purpose>

<Use_When>
- User wants to review a PR, file, or directory
- User says "review", "code review", "check PR", "analyze diff", "review"
- User says "check security vulnerabilities", "find performance issues", "check test coverage"
- Other x-kit skills need a code quality gate
</Use_When>

<Do_Not_Use_When>
- Simple single-line questions that don't need multi-agent review
- Structured problem solving (use x-solver instead)
- Full project lifecycle management (use x-build instead)
</Do_Not_Use_When>

# x-review — Multi-Perspective Code Review

Parallel review orchestrator built on Claude Code native Agent tool.
No external dependencies. Only requires `git` and `gh` CLI.

## Mode Detection

Read mode from `.xm/config.json` (`mode` field). Default: `developer`.

**Developer mode**: Use technical terms (verdict, LGTM, Critical/High/Medium/Low, findings). Concise.

**Normal mode**: Use plain Korean for all user-facing output.
- "verdict" → "결과", "LGTM" → "통과", "Request Changes" → "수정 필요", "Block" → "차단"
- "finding" → "발견", "Critical" → "심각", "High" → "높음", "Medium" → "보통", "Low" → "낮음"
- "severity" → "심각도", "lens" → "관점", "challenge stage" → "재확인", "consensus elevation" → "합의 승격"
- Use "~하세요" style, lead with key information

## Arguments

User provided: $ARGUMENTS

## AskUserQuestion Dark-Theme Rule

See `references/ask-user-question-rule.md` — the `question` field is invisible on dark terminals; put context in markdown, use `header`/`label`/`description` for user-facing text.

## Routing

First word of `$ARGUMENTS`:
- `diff` → [Phase 1: TARGET — diff mode]
- `pr` → [Phase 1: TARGET — pr mode]
- `file` → [Phase 1: TARGET — file mode]
- `full` → [Phase 1: TARGET — full mode]
- `list` → [Subcommand: list]
- Empty input → [Smart Router]
- Natural language → [Smart Router] (interpret intent, then route)
- Unrecognized input → [Subcommand: list] (safe fallback for typos/unsupported commands)

### Smart Router (empty input or natural language)

When called without arguments, **automatically determines the review scope**. Runs immediately without asking the user.

**Step 1: Context detection (order = routing priority)**

```bash
# Priority 1: PR detection (highest priority)
BRANCH=$(git branch --show-current 2>/dev/null)
PR_NUM=$(gh pr view --json number -q .number 2>/dev/null || echo "")
BASE=$(git merge-base main HEAD 2>/dev/null || git merge-base master HEAD 2>/dev/null || echo "")

# Priority 2: Last reviewed commit (for main branch)
LAST_REVIEW=$(jq -r '.reviewed_commit // empty' .xm/review/last-result.json 2>/dev/null || echo "")

# Priority 3: Last release commit
if [ -z "$LAST_REVIEW" ]; then
  LAST_REVIEW=$(git log --grep="^release:" --format=%H -1 2>/dev/null || echo "")
fi

# Priority 4: Last tag
if [ -z "$LAST_REVIEW" ]; then
  TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
  [ -n "$TAG" ] && LAST_REVIEW=$(git rev-parse -- "$TAG" 2>/dev/null || echo "")
fi

# Priority 5: Fallback
if [ -z "$LAST_REVIEW" ]; then
  LAST_REVIEW="HEAD~10"
fi

# Validate reference point — only hex SHA or HEAD~N allowed
if ! echo "$LAST_REVIEW" | grep -qE '^[0-9a-f]{7,40}$|^HEAD~[0-9]+$'; then
  LAST_REVIEW="HEAD~10"
fi
```

**Step 2: Routing (top to bottom, first match wins)**

| Priority | Condition | Review scope | Rationale |
|---------|------|----------|------|
| 1 | PR exists | `gh pr diff {PR_NUM}` | PR = natural unit of review |
| 2 | Feature branch (no PR) | `diff {BASE}..HEAD` | Entire branch = unit of work |
| 3 | Main + reference point exists | `diff {LAST_REVIEW}..HEAD` | Since last review/release/tag |
| 4 | Fallback | `diff HEAD~10` | Reasonable default |
| — | Unrecognized input | [Subcommand: list] | Safe fallback for typos/unsupported commands |

**Step 3: Pre-run summary + large diff guard**
```
🔍 리뷰 범위: {ref:0:7}..HEAD ({N} 커밋, {M} 파일, +{add}/-{del} 줄)
   기준: {마지막 리뷰 / 릴리스 커밋 / 태그 / HEAD~10}
```

| Diff size | Behavior |
|----------|------|
| 0 lines | Output "변경 사항이 없습니다", exit |
| 1-500 lines | Run immediately |
| 500-2000 lines | AskUserQuestion: choose `--preset thorough` (4 lenses) or `--preset quick` (2 lenses) |
| 2000+ lines | Force `--preset quick` (override: `--force-full`) |

**Save reference point after review:**

After Phase 4 completes, write the `reviewed_commit` field to `last-result.json`:
```json
{
  "reviewed_commit": "{commit hash of HEAD}",
  ...existing fields
}
```
This value becomes priority 1 reference point for the next Smart Router run.

**Natural language mapping:**
| User says | Route to |
|-----------|----------|
| "review this PR", "PR 리뷰" | `pr` (auto-detect) |
| "review the code", "코드 리뷰" | Smart Router (auto scope) |
| "check security", "보안 검사" | `diff --lenses "security"` |
| "review this file", "이 파일 리뷰" | `file` (ask for path) |
| "full review", "전체 리뷰" | `full` |

---

## Subcommand: list

```
x-review — Multi-Perspective Code Review Orchestrator

Commands:
  (no args)                     Smart detect: PR, branch diff, or recent commit
  diff [ref]                    Review git diff (default: HEAD~1)
  pr [number]                   Review GitHub PR (auto-detect from branch)
  file <path>                   Review specific file(s)
  full                          Full codebase review (split by lens)

Options:
  --lenses "security,logic,perf,tests"
                                Review perspectives (default: all 4)
  --severity critical|high|medium|low
                                Minimum severity to show (default: low)
  --format markdown|github-comment
                                Output format (default: markdown)
  --agents N                    Number of review agents (default: from shared config)
  --thorough                    Enhanced recall: dedicated recall agent, 10 observations max

Lenses (default 4 + extended 3):
  security       Injection, auth, secrets, OWASP Top 10
  logic          Bugs, edge cases, off-by-one, null handling
  perf           N+1, memory leaks, complexity, blocking I/O
  tests          Missing tests, untested paths, test quality
  architecture   Module boundaries, coupling, SRP (--agents 5+)
  docs           Public API docs, outdated comments (--agents 6+)
  errors         Error handling, recovery paths (--agents 7+)
  migrations     Schema drift, missing migrations, ORM sync (--agents 8+)

Presets:
  --preset quick       security + logic (2 agents, ~2min)
  --preset standard    4 core lenses (~5min)
  --preset security    security × 3 agents (redundant verification)
  (default)            all 7 lenses, 7 agents

Examples:
  /x-review                                     Smart detect: PR or diff
  /x-review diff
  /x-review pr                                  Auto-detect PR from branch
  /x-review diff --preset quick
  /x-review diff --lenses "security,logic" --severity high
  /x-review pr 142 --format github-comment
```

---

## Review Workflow (Phase 1-4)

See `references/review-workflow.md` — full pipeline:
- **Phase 1: TARGET** — collect diff/PR/file content, auto-detect language. `### full` mode uses Lens-first split: each agent scans all files with one lens (file-group split prohibited).
- **Phase 2: ASSIGN** — select lenses (default 7 or preset), distribute to agents
- **Phase 3: REVIEW** — fan-out N agents with Universal Principles + lens prompts (`lenses/{name}.md`)
- **Phase 4: SYNTHESIZE** — parse → dedupe+consensus → Self-Verify (Chain-of-Verification: agents include code snippet 3-5 lines; leader verifies claim against snippet — do not re-read the file; contradicted findings tagged `[CoVe-removed]`, inconclusive tagged `[CoVe-downgraded]`) → challenge → recall boost → verdict (include verdict rationale in output) → output (markdown / github-comment)

---

## Severity Definitions

See `references/finding-severity.md` — Critical/High/Medium/Low criteria shared with CLAUDE.md. x-review applies these across all 7 lenses.

> **Note (x-review specific):** Medium applies only to issues **introduced by this diff**. Low includes findings that **follow an existing repo-wide pattern**.

---

## Data Directory

See `references/data-directory.md` — writes `last-result.md` and `last-result.json` under `.xm/review/`, appends to `history/`, saves `reviewed_commit` to JSON after every review.

---

## Shared Config Integration

x-review references shared settings in `.xm/config.json`:

| Setting | Key | Default | Effect |
|---------|-----|---------|--------|
| Agent count | `agent_max_count` | `4` | Default agent count when `--agents` is not specified |

`--agents` takes precedence over shared config when explicitly provided.

---

## Usage From x-build

See `references/x-build-integration.md` — verdict→gate mapping (LGTM/Request Changes/Block), x-eval review-quality rubric scoring, x-memory auto-save for recurring Critical/High findings.

---

## Trace Recording

See `references/trace-recording.md` — session_start/session_end are automatic via `.claude/hooks/trace-session.mjs`; emit best-effort `agent_step` entries for long sub-operations.

---

## Natural Language Mapping

| User says | Command |
|-----------|---------|
| "Review this PR" | `pr` (prompt for PR number) |
| "Review the code" | `diff` (default HEAD~1) |
| "Review this file" | `file <path>` |
| "Check security only" | `diff --lenses "security"` |
| "Show critical ones only" | `diff --severity high` |
| "GitHub comment format" | `diff --format github-comment` |

## Interaction Protocol

**CRITICAL: x-review MUST use AskUserQuestion at key decision points.**

Rules:
1. Before starting review → AskUserQuestion to confirm target (file/PR/diff) and lens selection
2. After showing review results → AskUserQuestion for verdict confirmation (LGTM or request changes)
3. For multi-lens review → show each lens result, then AskUserQuestion before final synthesis

Anti-patterns:
- ❌ Auto-detect diff and immediately start reviewing
- ❌ Show findings and declare LGTM without user confirmation
- ✅ Show target + selected lenses, AskUserQuestion("이 설정으로 리뷰를 시작할까요?")
| "Usage" | `list` |

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "The change is small, no need for full review" | Small changes cause big regressions. The lens checks apply to one-line changes too — they just take thirty seconds. |
| "Tests pass, so it's good" | Tests catch correctness. They don't catch architecture, security, performance, or readability issues. Reviewing only test results is half a review. |
| "AI-generated code is probably fine" | AI code needs more scrutiny, not less. It's confident and plausible even when wrong. Severity-label every finding; don't rubber-stamp. |
| "I don't want to be pedantic" | That's what severity labels exist for (Critical/High/Medium/Low). Silencing real findings to be polite is dishonest review. |
| "The author knows what they're doing" | Author expertise doesn't catch author blind spots — that's literally what review is for. Every "they know better" approval you give is a bug that will reach production with no outside check. |
| "I'll mark it LGTM and move on" | LGTM without cited evidence is not a review. State what you checked and what you found (including "nothing") — or don't approve. |
| "This issue is outside the diff, not my problem" | True most of the time — but when a change *worsens* an existing problem, it becomes the reviewer's problem. Don't hide behind "pre-existing". |
