# xm-dev — Plugin Development & Testing

Local install, validate, update, and test xm-kit plugins without pushing to remote.
This command is for xm-kit repo maintainers only.

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
REPO_ROOT = /Users/jinwoo/work/project/agentic/xm-kit
MARKETPLACE_NAME = xm-kit
PLUGINS = [xm-agent, xm-build, xm-op, xm-kit]
```

---

## Mode: status

Show current state of xm-kit plugins.

### Step 1: Check marketplace registration

```bash
claude plugin marketplace list --json 2>&1
```

Look for marketplace with name containing "xm-kit" or source path matching REPO_ROOT.

### Step 2: Check installed plugins

```bash
claude plugin list --json 2>&1
```

Filter entries where id contains "xm-".

### Step 3: Validate all manifests

```bash
claude plugin validate REPO_ROOT/.claude-plugin/marketplace.json 2>&1
claude plugin validate REPO_ROOT/xm-agent 2>&1
claude plugin validate REPO_ROOT/xm-build 2>&1
claude plugin validate REPO_ROOT/xm-op 2>&1
claude plugin validate REPO_ROOT/xm-kit 2>&1
```

### Step 4: Output

```
🔧 xm-dev Status

  Marketplace:
    xm-kit  ✅ registered (local: /Users/jinwoo/work/project/agentic/xm-kit)
    — or —
    xm-kit  ❌ not registered (run: /xm-dev marketplace add)

  Installed plugins:
    xm-agent   ✅ v1.0.0 (scope: user)
    xm-build   ✅ v1.0.0 (scope: user)
    xm-op      ❌ not installed
    xm-kit     ❌ not installed

  Validation:
    marketplace.json  ✅ valid
    xm-agent          ✅ valid
    xm-build          ✅ valid
    xm-op             ✅ valid
    xm-kit            ✅ valid

  Quick commands:
    /xm-dev install xm-op       Install single plugin locally
    /xm-dev install-all         Install all plugins
    /xm-dev validate-all        Validate all manifests
    /xm-dev test xm-op list     Test a skill command
```

---

## Mode: marketplace-add

Register the local repo as a marketplace source.

```bash
claude plugin marketplace add REPO_ROOT
```

Output:
```
✅ Marketplace "xm-kit" registered from local path
   Source: REPO_ROOT

   Now you can install plugins:
     /xm-dev install xm-op
     /xm-dev install-all
```

If already registered:
```
ℹ️ Marketplace "xm-kit" is already registered.
```

---

## Mode: marketplace-remove

```bash
claude plugin marketplace remove xm-kit
```

Output:
```
✅ Marketplace "xm-kit" removed.
```

---

## Mode: install

Install a single plugin from local source.

### Step 1: Ensure marketplace is registered

Check `claude plugin marketplace list --json`. If xm-kit marketplace is not found:
```
⚠️ Local marketplace not registered. Registering now...
```
Then run: `claude plugin marketplace add REPO_ROOT`

### Step 2: Parse plugin name

From `$ARGUMENTS`, extract the plugin name after "install". Accept both `xm-op` and `xm-kit@xm-op` format.

If plugin name is not in PLUGINS list:
```
❌ Unknown plugin: {name}
   Available: xm-agent, xm-build, xm-op, xm-kit
```

### Step 3: Install

```bash
claude plugin install xm-{name}@xm-kit -s user
```

### Step 4: Validate after install

```bash
claude plugin list --json 2>&1
```

Confirm the plugin appears in the list.

### Step 5: Output

```
✅ Installed xm-op@1.0.0 (scope: user)

   Test it:
     /xm-dev test xm-op list
     — or in a new session —
     /xm-op list
```

---

## Mode: install-all

Install all plugins.

### Step 1: Ensure marketplace registered (same as install mode)

### Step 2: Install each

```bash
claude plugin install xm-agent@xm-kit -s user
claude plugin install xm-build@xm-kit -s user
claude plugin install xm-op@xm-kit -s user
claude plugin install xm-kit@xm-kit -s user
```

Run sequentially. If a plugin is already installed, note it and continue.

### Step 3: Output

```
✅ All xm-kit plugins installed

   xm-agent  ✅ v1.0.0
   xm-build  ✅ v1.0.0
   xm-op     ✅ v1.0.0
   xm-kit    ✅ v1.0.0

   Run /reload-plugins to activate (or restart Claude Code).
```

---

## Mode: uninstall

```bash
claude plugin uninstall xm-{name}@xm-kit -s user
```

Output:
```
✅ Uninstalled xm-op

   To reinstall: /xm-dev install xm-op
```

---

## Mode: update

Re-install from local source to pick up changes. This is the key dev workflow.

### Step 1: Update marketplace cache

```bash
claude plugin marketplace update xm-kit
```

### Step 2: Update the plugin

```bash
claude plugin update xm-{name}@xm-kit -s user
```

### Step 3: Output

```
🔄 Updated xm-op

   Before: v1.0.0
   After:  v1.0.1

   Run /reload-plugins to apply changes (or restart Claude Code).
```

If `$ARGUMENTS` is just "update" (no plugin name), update all installed xm plugins:
```bash
claude plugin marketplace update xm-kit
```
Then for each installed xm plugin:
```bash
claude plugin update xm-{name}@xm-kit -s user
```

---

## Mode: validate

Validate a single plugin manifest.

```bash
claude plugin validate REPO_ROOT/xm-{name}
```

Output on success:
```
✅ xm-op manifest is valid

   Name: xm-op
   Version: 1.0.0
   Skills: ./skills/
```

Output on failure:
```
❌ xm-op validation failed:

   {error details from validate command}
```

---

## Mode: validate-all

Validate all plugin manifests + marketplace manifest.

```bash
claude plugin validate REPO_ROOT/.claude-plugin/marketplace.json
claude plugin validate REPO_ROOT/xm-agent
claude plugin validate REPO_ROOT/xm-build
claude plugin validate REPO_ROOT/xm-op
claude plugin validate REPO_ROOT/xm-kit
```

Output:
```
🔍 Validation Results

   marketplace.json  ✅
   xm-agent          ✅
   xm-build          ✅
   xm-op             ✅
   xm-kit            ✅

   All manifests valid.
```

Or with errors:
```
🔍 Validation Results

   marketplace.json  ✅
   xm-agent          ✅
   xm-build          ❌ Missing "description" in plugin.json
   xm-op             ✅
   xm-kit            ✅

   1 error found. Fix before releasing.
```

---

## Mode: test

Test a plugin skill by reading and displaying its SKILL.md content.

### Step 1: Read the skill

```bash
# Find SKILL.md
cat REPO_ROOT/xm-{plugin}/skills/xm-{plugin}/SKILL.md
```

### Step 2: Show test instructions

```
🧪 Testing xm-op

   Skill loaded from: REPO_ROOT/xm-op/skills/xm-op/SKILL.md

   To test in this session (no install needed):
     Just use the skill directly — the SKILL.md is already in context.

   To test with real install:
     1. /xm-dev install xm-op
     2. Restart Claude Code
     3. /xm-op {args}

   Test args provided: {remaining args after plugin name}
```

### Step 3: If test args provided

If the user gave args beyond the plugin name (e.g., `/xm-dev test xm-op debate "AI safety"`), read the SKILL.md and execute the skill as if it were invoked directly, passing the remaining args.

---

## Mode: reset

Remove all xm plugins and marketplace. Clean slate.

### Step 1: Confirm with user (AskUserQuestion)

```
This will uninstall all xm-kit plugins and remove the local marketplace. Continue? (y/n)
```

### Step 2: Uninstall all

```bash
claude plugin uninstall xm-agent@xm-kit -s user 2>&1 || true
claude plugin uninstall xm-build@xm-kit -s user 2>&1 || true
claude plugin uninstall xm-op@xm-kit -s user 2>&1 || true
claude plugin uninstall xm-kit@xm-kit -s user 2>&1 || true
claude plugin marketplace remove xm-kit 2>&1 || true
```

### Step 3: Output

```
🧹 Reset complete

   Uninstalled: xm-agent, xm-build, xm-op, xm-kit
   Marketplace: xm-kit removed

   To start fresh: /xm-dev marketplace add
```

---

## Dev Workflow Summary

```
# 1. Register local repo as marketplace (one-time)
/xm-dev marketplace add

# 2. Install plugins for testing
/xm-dev install-all

# 3. Make code changes...
#    edit xm-op/skills/xm-op/SKILL.md

# 4. Update to pick up changes
/xm-dev update xm-op

# 5. Restart Claude Code and test
/xm-op debate "topic"

# 6. Validate before release
/xm-dev validate-all

# 7. Release
/xm-release
```
