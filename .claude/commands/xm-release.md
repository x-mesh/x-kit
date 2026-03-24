# xm-release — Release Automation

Detect changed plugins, bump versions, update marketplace.json, commit, and push.
This command is for xm-kit repo maintainers only.

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
📊 xm-kit Release Status

  xm-agent/   ✅ no changes
  xm-build/   🔄 2 files changed (lib/xm-build-cli.mjs, skills/xm-build/SKILL.md)
  xm-op/      🔄 1 file changed (skills/xm-op/SKILL.md)
  xm-kit/     ✅ no changes

  Current versions:
    xm-agent  1.0.0
    xm-build  1.0.0
    xm-op     1.0.0
    xm-kit    1.0.0
```

---

## Mode: dry-run

Analyze like auto mode, but do NOT modify files, commit, or push.

```
🔍 [dry-run] Release Preview

  Would bump:
    xm-build  1.0.0 → 1.0.1 (patch)
    xm-op     1.0.0 → 1.0.1 (patch)
    xm-kit    1.0.0 → 1.0.1 (meta bump)

  Would update:
    .claude-plugin/marketplace.json
    xm-build/.claude-plugin/plugin.json
    xm-op/.claude-plugin/plugin.json
    xm-kit/.claude-plugin/plugin.json
    package.json

  Would commit: "release: xm-build@1.0.1, xm-op@1.0.1"
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
| `xm-agent/**` | xm-agent |
| `xm-build/**` | xm-build |
| `xm-op/**` | xm-op |
| `xm-kit/**` | xm-kit |
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
Changes detected in xm-build. How should the version be bumped?
  1) patch (1.0.0 → 1.0.1) — Bug fixes, doc changes
  2) minor (1.0.0 → 1.1.0) — New features
  3) major (1.0.0 → 2.0.0) — Breaking changes
```

### Step 3: Update versions

For each changed sub-plugin:

1. **plugin.json** — Read `xm-{name}/.claude-plugin/plugin.json`, Edit version field.
2. **marketplace.json** — Read `.claude-plugin/marketplace.json`, Edit matching plugin version.
3. **package.json** — Sync root version with highest sub-plugin version.
4. **xm-kit meta** — If any sub-plugin changed, bump xm-kit too (patch).

### Step 4: Commit

```bash
git add .claude-plugin/ xm-agent/.claude-plugin/ xm-build/.claude-plugin/ xm-op/.claude-plugin/ xm-kit/.claude-plugin/ package.json
git add <changed source files>
```

Commit message format:
```
release: xm-build@1.0.1, xm-op@1.0.1

- xm-build: fixed quality gate detection
- xm-op: added --agents option to debate

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
```

### Step 5: Push

```bash
git push origin main
```

### Step 6: Output

```
🚀 Released!

  xm-build  1.0.0 → 1.0.1
  xm-op     1.0.0 → 1.0.1
  xm-kit    1.0.0 → 1.0.1 (meta)

  Commit: abc1234
  Push: origin/main ✅

  Users can update:
    /plugin marketplace update xm-kit
    /plugin install xm-kit@xm-build
```

---

## Mode: manual

When `$ARGUMENTS` contains `patch`, `minor`, or `major`.

Same as auto, but:
- Skip Step 2 auto-detection and user confirmation
- Apply the same bump to all changed sub-plugins

```
/xm-release patch    → Patch bump all changed plugins
/xm-release minor    → Minor bump all changed plugins
```

---

## Safety Rules

- **No changes = no release** (prevent empty commits)
- **Uncommitted changes = confirm first** — "There are uncommitted changes. Include them?"
- **Not on main = warn** — "Current branch is not main. Continue?"
- **Push failure = keep commit** — Do not rollback, instruct user to push manually
