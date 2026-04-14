---
name: x-ship
description: Release automation — commit squash, version bump, changelog, push. Works with any project.
---

<Purpose>
Squash WIP commits into meaningful units, bump versions, and push releases.
Works with x-kit marketplace plugins AND standalone projects.
Optimized for minimum turns: parallel discovery + single decision gate.
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

## CLI Auto-Resolve

Define `XMB` once at session start. Try local repo, then plugin cache, then fall back to plain-git mode. Never hardcode a single path.

```bash
resolve_xmb() {
  if [ -f "x-build/lib/x-build-cli.mjs" ]; then
    echo "node x-build/lib/x-build-cli.mjs"; return
  fi
  local cached
  cached=$(ls -t ~/.claude/plugins/cache/x-kit/x-build/*/lib/x-build-cli.mjs 2>/dev/null | head -1)
  if [ -n "$cached" ]; then echo "node $cached"; return; fi
  echo ""  # signal plain-git mode
}
XMB=$(resolve_xmb)
MODE=${XMB:+xmb}; MODE=${MODE:-plain-git}
```

If `MODE=plain-git`, skip all `$XMB` calls and use the **Plain-Git Fallback** procedure (bottom of file).

## Project Mode Detection

Decide once, upfront. Cache the result for the rest of the run.

| Signal | Mode |
|--------|------|
| `marketplace.json` exists at repo root | marketplace (use `--plugins`) |
| `.x-kit/` or `x-build/lib/` present | marketplace |
| Otherwise | standalone (use `--standalone` or plain-git) |

## Routing

| Argument | Mode |
|----------|------|
| (empty) | interactive — quality gates (test + review) then auto |
| `auto` | auto — squash + bump + push, no gates |
| `status` | status — show commits since last release |
| `dry-run` | dry-run — preview plan |
| `squash` | squash only |
| `patch` / `minor` / `major` | manual bump (skip bump confirmation) |

## AskUserQuestion Dark-Theme Rule

Output ALL context as markdown BEFORE calling AskUserQuestion. The `question` field is invisible on dark terminals — put key info in `header` and option `label`/`description` instead.

---

## Step 0: Parallel Discover (single Bash call)

Always start here. Run all read-only probes in parallel. Reuse results downstream — never re-run `detect`/`diff-report`/`git log` for the same SHA.

```bash
# Single Bash invocation; all commands independent.
{
  echo "=== branch ==="; git rev-parse --abbrev-ref HEAD
  echo "=== status ==="; git status --short
  echo "=== ahead ==="; git log --oneline @{u}..HEAD 2>/dev/null || echo "(no upstream)"
  echo "=== last-tag ==="; git describe --tags --abbrev=0 2>/dev/null || echo "(none)"
  echo "=== mode-signal ==="; ls marketplace.json 2>/dev/null && echo "marketplace" || echo "standalone"
  if [ -n "$XMB" ]; then
    echo "=== detect ==="; $XMB release detect
    echo "=== diff-report ==="; $XMB release diff-report 2>/dev/null || true
  else
    echo "=== diff-stat ==="; git diff --stat HEAD~5..HEAD 2>/dev/null
  fi
} 2>&1
```

If no changes → "✅ 릴리스할 변경사항이 없습니다." Exit.

---

## Step 1: Single Decision Gate (interactive mode)

Combine squash plan + bump type + commit message draft + push target into **one** AskUserQuestion. Show the full plan as markdown first, then ask once.

Markdown preview must include:
- Squash strategy (grouped vs single vs keep) with file→group mapping
- Bump type (patch/minor/major) with rationale from detect
- Drafted commit message
- Push target (`origin/<branch>`)
- README update needed? (yes/no with reason)

AskUserQuestion options:
1. **진행** — squash + bump + commit + push as planned
2. **수정** — user edits one field (loop back to preview)
3. **중단**

Skip this gate entirely in `auto` mode.

### Optional pre-gate quality checks (interactive only, opt-in)

If user explicitly requested test/review gates in their prompt:

```bash
$XMB release test [--command "bun test"]   # only if requested
```

For review gate, invoke x-review with refs already collected in Step 0:
`/x-review diff $LAST_TAG..HEAD --preset quick`

LGTM → proceed. Request Changes / Block → ask user before continuing.

---

## Step 2: Squash (if planned)

For grouped squash:
```bash
$XMB release squash --since <ref>
# Then re-commit in groups (LLM stages files per group)
```

For single squash:
```bash
$XMB release squash
```

Plain-git: see fallback section.

**Verification**: `git diff $PRE_SQUASH HEAD` must be empty. If not, rollback.

---

## Step 3: Bump

| Mode | Command |
|------|---------|
| marketplace | `$XMB release bump --<type> --plugins <list>` |
| standalone (with CLI) | `$XMB release bump --<type> --standalone` |
| plain-git | edit `package.json`/`VERSION` directly |

Bump type rules:

| Change type | Bump |
|-------------|------|
| Bug fix, internal refactor | patch |
| New command/feature/export | minor |
| Breaking change (removed export) | major |
| Explicit in `$ARGUMENTS` | use that |

---

## Step 4: Commit + Push (single call)

Inline the README check here — no separate step. If plan said README update needed, stage README changes alongside the version bump.

```bash
$XMB release commit --msg "release: ..." --push
```

Plain-git:
```bash
git add -A && git commit -m "release: ..." && git push
```

Commit format:
```
release: {name}@{version}

- {plugin}: {change summary}
```

---

## Step 5: Trace (background) + Output (immediate)

Trace is fire-and-forget. Don't block the success message.

```bash
# run_in_background: true
$XMB release trace --from {old} --to {new} --bump {type} \
  --test-passed {true|false} --review-verdict {LGTM|null}
```

Immediately print:
```
🚀 Shipped!

  Version: {old} → {new}
  Commit: {hash}
  Push: origin/{branch} ✅
```

---

## Mode: status

Run only the `=== detect ===` and `=== ahead ===` portions of Step 0. Display readable summary.

## Mode: dry-run

Run full Step 0, build the markdown plan from Step 1, **do not** call AskUserQuestion, **do not** execute Steps 2-5.

## Mode: squash

Step 0 + Step 2 only. No bump, no push.

---

## Plain-Git Fallback (no x-build CLI available)

When `MODE=plain-git`, replace CLI calls with:

| Step | Plain-git equivalent |
|------|---------------------|
| detect | `git log $(git describe --tags --abbrev=0)..HEAD --oneline` |
| diff-report | `git diff --stat $(git describe --tags --abbrev=0)..HEAD` |
| squash (single) | `git reset --soft $(git describe --tags --abbrev=0)` then `git commit` |
| squash (grouped) | `git reset --soft <ref>` then stage+commit per group |
| bump | edit `package.json` `"version"` field directly |
| commit + push | `git add -A && git commit -m "..." && git push` |
| trace | skip (no-op) |

Standalone projects without `package.json` skip bump entirely.

---

## Safety Rules

- **Squash local-only** — never squash pushed commits. Force push should not be needed.
- **No changes = no release**
- **Squash verification** — `git diff $PRE_SQUASH HEAD` must be empty
- **Not on main/develop = warn** (unless feature branch release intentional)
- **Rollback on failure** — save pre-squash HEAD, restore with `git reset --hard`
- **Push failure = keep commit** — instruct user to push manually
- **Reuse Step 0 results** — never re-run `detect`/`diff-report`/`git log` for the same SHA within one ship run

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "patch bump is safe, I'll use patch" | patch implies no behavior change. If behavior changed, bump minor. |
| "I'll squash later" | Squash before push or not at all. |
| "The user will confirm if they care" | Don't guess on irreversible operations. Ask before push. |
| "standalone 프로젝트라 CLI 없으면 ship 못 한다" | Plain-Git Fallback으로 동일 결과 가능. CLI 부재가 차단 사유 아님. |
| "detect 한 번 더 돌려봐야 안전하다" | 같은 SHA면 동일 결과. Step 0 결과 재사용. 재실행은 턴 낭비. |
| "단계별로 사용자 확인이 안전하다" | 5단계 확인 = 5턴 낭비. 전체 계획 1회 미리보기 후 단일 승인이 더 안전 (전체 영향 가시화). |
| "CLI 경로 추측해서 시도" | resolve_xmb()로 자동 감지. 추측 후 실패는 최악의 패턴. |
| "README 업데이트는 별도 단계" | commit과 같은 트랜잭션. Step 4에 인라인. |
| "trace 결과 봐야 ship 완료" | trace는 관측용. push 성공 = ship 완료. background 실행. |

## Red Flags

- Step 0 결과 없이 Step 1로 진입 → 정보 부족
- 같은 git 명령 2회 이상 실행 → 캐시 미사용
- AskUserQuestion 3회 이상 (interactive 모드) → 결정 게이트 분산
- CLI 경로 하드코딩 후 실패 → resolve_xmb() 미사용
- trace 동기 대기 → blocking on observability

## Verification

After ship:
- `git log -1 --format=%H` matches commit returned
- `git rev-parse @{u}` matches `git rev-parse HEAD` (push succeeded)
- Tag created (if applicable): `git tag --points-at HEAD`
