---
name: x-dev
description: Plugin development & testing — local install, validate, update, test
---

# x-dev — Plugin Development & Testing

Local install, validate, update, and test x-kit plugins without pushing to remote.
This command is for x-kit repo maintainers only.

## Arguments

User provided: $ARGUMENTS

## Routing

- Empty → [Mode: status] (show installed xm plugins + marketplace state)
- `install [plugin]` → [Mode: install] (local install from current repo)
- `install-all` → [Mode: install-all] (install all plugins locally)
- `uninstall [plugin]` → [Mode: uninstall]
- `update [plugin]` → [Mode: update] (re-install from local source)
- `validate [plugin]` → [Mode: validate] (validate plugin manifest)
- `validate-all` → [Mode: validate-all]
- `marketplace add` → [Mode: marketplace-add] (register local marketplace)
- `marketplace remove` → [Mode: marketplace-remove]
- `test <plugin> [args]` → [Mode: test] (invoke a skill in a fresh session)
- `reset` → [Mode: reset] (uninstall all xm plugins + remove marketplace)

---

## Constants

```
REPO_ROOT = /Users/jinwoo/work/project/agentic/x-kit
MARKETPLACE_NAME = x-kit
PLUGINS = [x-agent, x-build, x-op, x-kit]
```

---

## Mode: status

Show current state of x-kit plugins.

### Step 1: Check marketplace registration

```bash
claude plugin marketplace list --json 2>&1
```

Look for marketplace with name containing "x-kit" or source path matching REPO_ROOT.

### Step 2: Check installed plugins

```bash
claude plugin list --json 2>&1
```

Filter entries where id contains "x-".

### Step 3: Validate all manifests

```bash
claude plugin validate REPO_ROOT/.claude-plugin/marketplace.json 2>&1
claude plugin validate REPO_ROOT/x-agent 2>&1
claude plugin validate REPO_ROOT/x-build 2>&1
claude plugin validate REPO_ROOT/x-op 2>&1
claude plugin validate REPO_ROOT/x-kit 2>&1
```

### Step 4: Output

```
🔧 x-dev Status

  Marketplace:
    x-kit  ✅ registered (local: /Users/jinwoo/work/project/agentic/x-kit)
    — or —
    x-kit  ❌ not registered (run: /x-dev marketplace add)

  Installed plugins:
    x-agent   ✅ v1.0.0 (scope: user)
    x-build   ✅ v1.0.0 (scope: user)
    x-op      ❌ not installed
    x-kit     ❌ not installed

  Validation:
    marketplace.json  ✅ valid
    x-agent          ✅ valid
    x-build          ✅ valid
    x-op             ✅ valid
    x-kit            ✅ valid

  Quick commands:
    /x-dev install x-op       Install single plugin locally
    /x-dev install-all         Install all plugins
    /x-dev validate-all        Validate all manifests
    /x-dev test x-op list     Test a skill command
```

---

## Mode: marketplace-add

Register the local repo as a marketplace source.

```bash
claude plugin marketplace add REPO_ROOT
```

Output:
```
✅ Marketplace "x-kit" registered from local path
   Source: REPO_ROOT

   Now you can install plugins:
     /x-dev install x-op
     /x-dev install-all
```

If already registered:
```
ℹ️ Marketplace "x-kit" is already registered.
```

---

## Mode: marketplace-remove

```bash
claude plugin marketplace remove x-kit
```

Output:
```
✅ Marketplace "x-kit" removed.
```

---

## Mode: install

Install a single plugin from local source.

### Step 1: Ensure marketplace is registered

Check `claude plugin marketplace list --json`. If x-kit marketplace is not found:
```
⚠️ Local marketplace not registered. Registering now...
```
Then run: `claude plugin marketplace add REPO_ROOT`

### Step 2: Parse plugin name

From `$ARGUMENTS`, extract the plugin name after "install". Accept both `x-op` and `x-kit@x-op` format.

If plugin name is not in PLUGINS list:
```
❌ Unknown plugin: {name}
   Available: x-agent, x-build, x-op, x-kit
```

### Step 3: Install

```bash
claude plugin install x-{name}@x-kit -s user
```

### Step 4: Validate after install

```bash
claude plugin list --json 2>&1
```

Confirm the plugin appears in the list.

### Step 5: Output

```
✅ Installed x-op@1.0.0 (scope: user)

   Test it:
     /x-dev test x-op list
     — or in a new session —
     /x-op list
```

---

## Mode: install-all

Install all plugins.

### Step 1: Ensure marketplace registered (same as install mode)

### Step 2: Install each

```bash
claude plugin install x-agent@x-kit -s user
claude plugin install x-build@x-kit -s user
claude plugin install x-op@x-kit -s user
claude plugin install x-kit@x-kit -s user
```

Run sequentially. If a plugin is already installed, note it and continue.

### Step 3: Output

```
✅ All x-kit plugins installed

   x-agent  ✅ v1.0.0
   x-build  ✅ v1.0.0
   x-op     ✅ v1.0.0
   x-kit    ✅ v1.0.0

   Run /reload-plugins to activate (or restart Claude Code).
```

---

## Mode: uninstall

```bash
claude plugin uninstall x-{name}@x-kit -s user
```

Output:
```
✅ Uninstalled x-op

   To reinstall: /x-dev install x-op
```

---

## Mode: update

Re-install from local source to pick up changes. This is the key dev workflow.

### Step 1: Update marketplace cache

```bash
claude plugin marketplace update x-kit
```

### Step 2: Update the plugin

```bash
claude plugin update x-{name}@x-kit -s user
```

### Step 3: Output

```
🔄 Updated x-op

   Before: v1.0.0
   After:  v1.0.1

   Run /reload-plugins to apply changes (or restart Claude Code).
```

If `$ARGUMENTS` is just "update" (no plugin name), update all installed xm plugins:
```bash
claude plugin marketplace update x-kit
```
Then for each installed xm plugin:
```bash
claude plugin update x-{name}@x-kit -s user
```

---

## Mode: validate

Validate a single plugin manifest.

```bash
claude plugin validate REPO_ROOT/x-{name}
```

Output on success:
```
✅ x-op manifest is valid

   Name: x-op
   Version: 1.0.0
   Skills: ./skills/
```

Output on failure:
```
❌ x-op validation failed:

   {error details from validate command}
```

---

## Mode: validate-all

Validate all plugin manifests + marketplace manifest.

```bash
claude plugin validate REPO_ROOT/.claude-plugin/marketplace.json
claude plugin validate REPO_ROOT/x-agent
claude plugin validate REPO_ROOT/x-build
claude plugin validate REPO_ROOT/x-op
claude plugin validate REPO_ROOT/x-kit
```

Output:
```
🔍 Validation Results

   marketplace.json  ✅
   x-agent          ✅
   x-build          ✅
   x-op             ✅
   x-kit            ✅

   All manifests valid.
```

Or with errors:
```
🔍 Validation Results

   marketplace.json  ✅
   x-agent          ✅
   x-build          ❌ Missing "description" in plugin.json
   x-op             ✅
   x-kit            ✅

   1 error found. Fix before releasing.
```

---

## Mode: test

Test a plugin skill by reading and displaying its SKILL.md content.

### Step 1: Read the skill

```bash
# Find SKILL.md
cat REPO_ROOT/x-{plugin}/skills/x-{plugin}/SKILL.md
```

### Step 2: Show test instructions

```
🧪 Testing x-op

   Skill loaded from: REPO_ROOT/x-op/skills/x-op/SKILL.md

   To test in this session (no install needed):
     Just use the skill directly — the SKILL.md is already in context.

   To test with real install:
     1. /x-dev install x-op
     2. Restart Claude Code
     3. /x-op {args}

   Test args provided: {remaining args after plugin name}
```

### Step 3: If test args provided

If the user gave args beyond the plugin name (e.g., `/x-dev test x-op debate "AI safety"`), read the SKILL.md and execute the skill as if it were invoked directly, passing the remaining args.

---

## Mode: reset

Remove all xm plugins and marketplace. Clean slate.

### Step 1: Confirm with user (AskUserQuestion)

```
This will uninstall all x-kit plugins and remove the local marketplace. Continue? (y/n)
```

### Step 2: Uninstall all

```bash
claude plugin uninstall x-agent@x-kit -s user 2>&1 || true
claude plugin uninstall x-build@x-kit -s user 2>&1 || true
claude plugin uninstall x-op@x-kit -s user 2>&1 || true
claude plugin uninstall x-kit@x-kit -s user 2>&1 || true
claude plugin marketplace remove x-kit 2>&1 || true
```

### Step 3: Output

```
🧹 Reset complete

   Uninstalled: x-agent, x-build, x-op, x-kit
   Marketplace: x-kit removed

   To start fresh: /x-dev marketplace add
```

---

## Dev Workflow Summary

```
# 1. Register local repo as marketplace (one-time)
/x-dev marketplace add

# 2. Install plugins for testing
/x-dev install-all

# 3. Make code changes...
#    edit x-op/skills/x-op/SKILL.md

# 4. Update to pick up changes
/x-dev update x-op

# 5. Restart Claude Code and test
/x-op debate "topic"

# 6. Validate before release
/x-dev validate-all

# 7. Release
/x-release
```
