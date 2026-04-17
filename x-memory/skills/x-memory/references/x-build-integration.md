# x-memory — x-build Integration

How x-memory auto-surfaces decisions, requirements, and failure patterns during x-build phases.

## Integration with x-build

x-build decisions can be promoted to x-memory for cross-session persistence:

```bash
# In x-build, after listing decisions:
node .../x-build-cli.mjs decisions list

# Promote a key decision to x-memory:
$XMM save "Choose JWT auth" --type decision --why "..." --tags "auth" --source "x-build:my-project"
```

### x-build decisions → x-memory auto-promotion rules

When an important decision is made in x-build, suggest auto-saving to x-memory:

| Condition | Action |
|-----------|--------|
| `decisions add --type architecture` | Suggest auto-save (type: decision) |
| `decisions add --type tradeoff` | Suggest auto-save (type: decision) |
| 3+ decisions accumulated in same project | Suggest bulk promote |
| 5+ decisions at `close` | `"Tip: Save {N} decisions to x-memory?"` |

Save format:
```bash
x-memory save "{decision.title}" --type decision \
  --why "{decision.rationale}" \
  --tags "{decision.type},{project_name}" \
  --source "x-build:{project_name}"
```

### x-review findings → x-memory failure auto-save

Save recurring Critical/High issues from x-review as failures in x-memory:

| Condition | Action |
|-----------|--------|
| Critical finding (all cases) | Suggest auto-save (type: failure) |
| Same file/pattern High found 2+ times | Suggest auto-save (type: pattern) |
| Block verdict | Suggest saving full findings summary as failure |

Save format:
```bash
x-memory save "{finding.description}" --type failure \
  --why "x-review {verdict}: {severity} in {file}:{line}" \
  --tags "review,{lens},{severity}" \
  --related-files "{file}"
```

### x-op strategy results → x-memory learning save

After x-op strategy completion, preserve high Self-Score results as learnings:

| Condition | Action |
|-----------|--------|
| Self-Score >= 8.0 | Suggest `"Tip: Remember this result?"` (type: learning) |
| `--verify` passed (score >= threshold) | Suggest saving strategy + rubric + score as learning |
| compose pipeline succeeded | Suggest saving pipeline combination as pattern |

## Applies to

Invoked on x-build session start + phase transitions.
