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
