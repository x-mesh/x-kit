---
name: x-release
description: Release automation — detect changes, bump versions, update marketplace.json, commit, push
---

# x-release — Release Automation

Detect changed plugins, bump versions, update marketplace.json, commit, and push.
This command is for x-kit repo maintainers only.

## Arguments

User provided: $ARGUMENTS

## CLI

```bash
XMB="node x-build/lib/x-build-cli.mjs"
```

## Routing

- Empty or `auto` → [Mode: auto]
- `patch` / `minor` / `major` → [Mode: manual] (skip bump confirmation)
- `status` → Run `$XMB release detect` and display results
- `dry-run` → Run `$XMB release detect` and show what would happen without executing

---

## Mode: auto

### Step 1: Detect

```bash
$XMB release detect
```

Display the JSON output to the user in a readable format. If `changed_plugins` is empty:
> ✅ No changes detected. Nothing to release.

### Step 2: Decide (LLM judgment)

Based on detect output:

**Default: proceed.** Invoking `/x-release` is implicit consent. Confirm only when a blocker is detected.

1. **Squash?** — If `recommendation.squash` is true, run silently:
   ```bash
   $XMB release squash
   ```
   **Halt + AskUserQuestion only if** the squash range crosses `@{u}` (would rewrite pushed history).

2. **Bump type?** — Decide from changes:
   - SKILL.md edits, bug fixes → `patch`
   - New commands/features → `minor`
   - Breaking changes (removed export, deleted command) → `major`
   - If `$ARGUMENTS` specifies `patch`/`minor`/`major`, use that directly
   
   **Halt + AskUserQuestion only if**: signals are split (e.g., one plugin patch + another minor) OR a breaking change is detected. Otherwise proceed silently with the inferred bump.

### Blocker Conditions (these halt; everything else proceeds)

| Blocker | Question |
|---------|----------|
| Bump type ambiguous | "1) patch 2) minor 3) major" |
| Breaking change detected | "1) major 2) 변경 재검토" |
| Branch is `main`/`master` | "1) main에 push 2) feature 브랜치 3) 중단" |
| Squash crosses pushed commits | "1) 로컬만 squash 2) squash 생략 3) 중단" |
| Working tree has files outside change scope | "1) 모두 포함 2) 의도한 파일만 3) 중단" |

### Step 3: Bump

```bash
$XMB release bump --patch --plugins x-build,x-dashboard
```

This automatically: updates all JSON files, runs sync-bundle, runs tests.
If tests fail, stop and fix.

### Step 4: README Check (LLM judgment)

Decide if README needs updating based on change type:

| Change type | README action |
|-------------|---------------|
| New command/subcommand/flag | Update README |
| Changed user-visible behavior | Update README |
| Internal refactor, bug fix | Skip — log decision |

If update needed, edit README.md (and README.ko.md) before committing.
If skipped, log: "README skip: {reason}"

### Step 5: Commit Message (LLM writes)

Write a commit message based on the changes. Format:
```
release: x-build@1.16.2, x-dashboard@0.4.2

- x-build: {change summary}
- x-dashboard: {change summary}
```

**Rules**:
- Describe WHAT changed, never WHY. No rationale, no session narrative, no "adversarial judge caught X", no "self-demonstration", no "shipped after consensus".
- Each bullet must describe a code/file change a future reader can verify from the diff.
- Rationale belongs in PR descriptions or retrospectives, not `git log`.

### Step 6: Commit & Push

```bash
$XMB release commit --msg "release: ..." --push
```

### Step 7: Post-Merge Hunk Verification (if branch merge involved)

Skip if direct-push (no merge). Otherwise:

```bash
# Before merge
git diff main...HEAD --unified=0 > /tmp/pre-merge-hunks.diff
# After merge — verify hunks survived
node -e "
const fs = require('fs');
const diff = fs.readFileSync('/tmp/pre-merge-hunks.diff', 'utf8');
const files = [...new Set(diff.match(/^\+\+\+ b\/(.+)$/gm)?.map(l => l.slice(6)) || [])];
let dropped = 0;
for (const file of files) {
  if (!fs.existsSync(file)) { console.log('⚠ DELETED: ' + file); continue; }
  const fileSection = diff.split('diff --git').find(s => s.includes('+++ b/' + file)) || '';
  const addedLines = fileSection.match(/^\+(?!\+\+)(.+)$/gm)?.map(l => l.slice(1).trim()).filter(l => l.length > 3) || [];
  const content = fs.readFileSync(file, 'utf8');
  for (const line of addedLines) {
    if (!content.includes(line.trim())) { console.log('❌ DROPPED: ' + file + ' — ' + line.slice(0, 80)); dropped++; }
  }
}
if (dropped === 0) console.log('✅ All hunks preserved.');
else console.log('⚠ ' + dropped + ' hunks may have been dropped.');
"
rm -f /tmp/pre-merge-hunks.diff
```

---

## Mode: manual

When `$ARGUMENTS` contains `patch`, `minor`, or `major`:
- Skip Step 2 bump confirmation
- Apply specified bump to all changed plugins
- Otherwise same as auto

---

## Safety Rules

- **No changes = no release** (prevent empty commits)
- **Uncommitted changes = confirm first**
- **Not on main/develop = warn**
- **Push failure = keep commit** — instruct user to push manually
