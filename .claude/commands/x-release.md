---
name: x-release
description: Release automation — detect changes, bump versions, update marketplace.json, commit, push
---

# x-release — Release Automation

Detect changed plugins, bump versions, update marketplace.json, commit, and push.
This command is for x-kit repo maintainers only.

## Arguments

User provided: $ARGUMENTS

## Routing

- Empty or `auto` → [Mode: auto] (detect changes, auto-process)
- `patch` / `minor` / `major` → [Mode: manual] (explicit version bump)
- `status` → [Mode: status] (check current state only)
- `dry-run` → [Mode: dry-run] (preview without committing)

---

## Mode: status

Check change status only.

```bash
git status --short
git diff --name-only HEAD
```

Group changed files by sub-plugin:

```
📊 x-kit Release Status

  x-agent/   ✅ no changes
  x-build/   🔄 2 files changed (lib/x-build-cli.mjs, skills/x-build/SKILL.md)
  x-op/      🔄 1 file changed (skills/x-op/SKILL.md)
  x-kit/     ✅ no changes

  Current versions:
    x-agent  1.0.0
    x-build  1.0.0
    x-op     1.0.0
    x-kit    1.0.0
```

---

## Mode: dry-run

Analyze like auto mode, but do NOT modify files, commit, or push.

```
🔍 [dry-run] Release Preview

  Would bump:
    x-build  1.0.0 → 1.0.1 (patch)
    x-op     1.0.0 → 1.0.1 (patch)
    x-kit    1.0.0 → 1.0.1 (meta bump)

  Would update:
    .claude-plugin/marketplace.json
    x-build/.claude-plugin/plugin.json
    x-op/.claude-plugin/plugin.json
    x-kit/.claude-plugin/plugin.json
    package.json

  Would commit: "release: x-build@1.0.1, x-op@1.0.1"
  Would push to: origin/main
```

---

## Mode: auto

### Step 1: Detect changes

```bash
git diff --name-only HEAD
```

Map changed files to sub-plugins:

| Path pattern | Sub-plugin |
|-------------|-----------|
| `x-agent/**` | x-agent |
| `x-build/**` | x-build |
| `x-op/**` | x-op |
| `x-kit/**` | x-kit |
| `.claude-plugin/**` | marketplace (root) |
| `README.md`, `package.json` | root |

If no changes:
> ✅ No changes detected. Nothing to release.

### Step 2: Determine version bump

Auto-detect by change type:

| Change type | Bump |
|------------|------|
| SKILL.md text edits, template changes | patch (0.0.x) |
| New commands, new features | minor (0.x.0) |
| Breaking changes (removed commands, restructure) | major (x.0.0) |
| Explicit `patch`/`minor`/`major` in `$ARGUMENTS` | Use that |

Confirm with user (AskUserQuestion):
```
Changes detected in x-build. How should the version be bumped?
  1) patch (1.0.0 → 1.0.1) — Bug fixes, doc changes
  2) minor (1.0.0 → 1.1.0) — New features
  3) major (1.0.0 → 2.0.0) — Breaking changes
```

### Step 3: Update versions

For each changed sub-plugin:

1. **plugin.json** — Read `x-{name}/.claude-plugin/plugin.json`, Edit version field.
2. **marketplace.json** — Read `.claude-plugin/marketplace.json`, Edit matching plugin version.
3. **package.json** — Sync root version with highest sub-plugin version.
4. **x-kit meta** — If any sub-plugin changed, bump x-kit too (patch).

### Step 3.5: Update README (MANDATORY)

**이 단계는 스킵할 수 없다.** 변경된 플러그인이 있으면 반드시 README.md를 검토하고 업데이트한다.

#### Procedure

For each changed plugin, delegate an agent (sonnet) with this prompt:

```
## README Sync Check

Plugin: {plugin_name}
SKILL.md path: {plugin}/skills/{plugin}/SKILL.md
README section: ### {plugin_name} — {section title}

### Instructions

1. Read the current SKILL.md for {plugin_name}
2. Read the README.md section for {plugin_name} (find by "### {plugin_name}")
3. Compare and produce a diff checklist:

| Item | SKILL.md | README | Action |
|------|----------|--------|--------|
| Description | "..." | "..." | UPDATE / OK |
| Commands list | cmd1, cmd2 | cmd1 | ADD cmd2 |
| Options/flags | --cascade, --deps | --deps | ADD --cascade |
| Feature table | 6 rows | 5 rows | ADD row |
| Code examples | 3 | 2 | ADD example |
| Pipeline diagram | includes plugin | missing | ADD |

4. For each "ADD" or "UPDATE" action, produce the specific Edit to apply.
5. If all items are "OK", output: "README is up to date for {plugin_name}."

### Rules
- README is a marketing doc — concise descriptions and examples, not full SKILL.md copy
- Preserve existing README style and formatting
- Only add/update what changed — do not rewrite unchanged sections
- New plugins MUST have a README section (check if section exists)
```

Run agents for all changed plugins in parallel. Collect results.

#### Checklist (must all pass before proceeding to Step 4)

- [ ] Every changed plugin has a corresponding `### {name}` section in README
- [ ] New commands/options added in SKILL.md are reflected in README
- [ ] Plugin description in README matches plugin.json description
- [ ] Pipeline diagram in README includes all plugins
- [ ] Code examples in README still work with current commands

If any check fails → apply the fix before moving to Step 4.
If README was already up to date → log "README: no changes needed" and continue.

#### What counts as "needs README update"

| Change type | README action |
|-------------|---------------|
| New plugin added | Add new `### name` section with description, commands, feature table |
| New command/subcommand | Add to commands list in plugin section |
| New option/flag (e.g. --cascade) | Add to feature table or options block |
| Changed behavior (e.g. error→warning) | Update description if user-visible |
| Internal refactor only (no API change) | No README change needed — but log the decision |
| Severity/calibration changes | No README change — internal to agents |
| Concurrency/safety fixes | No README change unless it affects CLI usage |

> The burden of proof is on "no update needed" — when in doubt, update.
> Log every skip decision: "README skip: x-build internal concurrency fix, no CLI API change"

### Step 4: Commit

```bash
git add .claude-plugin/ x-agent/.claude-plugin/ x-build/.claude-plugin/ x-op/.claude-plugin/ x-kit/.claude-plugin/ package.json
git add <changed source files>
```

Commit message format:
```
release: x-build@1.0.1, x-op@1.0.1

- x-build: fixed quality gate detection
- x-op: added --agents option to debate

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
```

### Step 4.5: Post-Merge Hunk Verification (if merging branches)

When the release involves merging branches (e.g., develop → main), verify no hunks were silently dropped.

**Skip if:** direct-push release (no merge involved).

1. Before merge, capture the branch diff:
```bash
git diff main...HEAD --unified=0 > /tmp/pre-merge-hunks.diff
```

2. After merge, verify each hunk survived:
```bash
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
else console.log('⚠ ' + dropped + ' hunks may have been dropped. Review before pushing.');
"
```

3. If dropped hunks found → AskUserQuestion: "1) Review and fix 2) Accept (intentional) 3) Abort"
4. Clean up: `rm -f /tmp/pre-merge-hunks.diff`

### Step 5: Push

```bash
git push origin main
```

### Step 6: Output

```
🚀 Released!

  x-build  1.0.0 → 1.0.1
  x-op     1.0.0 → 1.0.1
  x-kit    1.0.0 → 1.0.1 (meta)

  Commit: abc1234
  Push: origin/main ✅

  Users can update:
    /plugin marketplace update x-kit
    /plugin install x-kit@x-build
```

---

## Mode: manual

When `$ARGUMENTS` contains `patch`, `minor`, or `major`.

Same as auto, but:
- Skip Step 2 auto-detection and user confirmation
- Apply the same bump to all changed sub-plugins

```
/x-release patch    → Patch bump all changed plugins
/x-release minor    → Minor bump all changed plugins
```

---

## Safety Rules

- **No changes = no release** (prevent empty commits)
- **Uncommitted changes = confirm first** — "There are uncommitted changes. Include them?"
- **Not on main = warn** — "Current branch is not main. Continue?"
- **Push failure = keep commit** — Do not rollback, instruct user to push manually
