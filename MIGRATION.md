# 🚚 This repository has moved

The `x-mesh/x-kit` marketplace has been renamed to **`x-mesh/xm`**.

> **New home:** https://github.com/x-mesh/xm

## What changed

| Before | After |
|--------|-------|
| Marketplace name: `x-kit` | **`xm`** |
| Plugin names: `x-build`, `x-op`, `x-solver`, `x-eval`, ... | **`build`, `op`, `solver`, `eval`, ...** (x- prefix dropped) |
| Slash commands: `/x-kit:x-op`, `/x-kit:x-solver` | **`/xm:op`, `/xm:solver`** |
| Install URL | `https://raw.githubusercontent.com/x-mesh/xm/main/x-kit/scripts/install.sh` |

## Migration for existing users

1. Uninstall the old marketplace:
   ```bash
   claude plugin marketplace remove x-kit
   ```
2. Install the new marketplace:
   ```bash
   claude plugin marketplace add x-mesh/xm
   claude plugin install build@xm op@xm solver@xm  # etc.
   ```
3. Update slash commands in any scripts/docs: `/x-kit:x-<plugin>` → `/xm:<plugin>`.

## Status

- This repository is **frozen** — no further updates.
- It will be archived on GitHub shortly.
- All future development, issues, and releases happen at **https://github.com/x-mesh/xm**.
