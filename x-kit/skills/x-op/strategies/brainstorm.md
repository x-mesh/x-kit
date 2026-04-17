# Strategy: brainstorm

Free ideation → cluster → vote.

## Phase 1: GENERATE
fan-out:
"Generate as many ideas as possible on this topic. No criticism allowed. Each idea: [dimension] title + 1-2 lines. Tag each with a dimension from the Ideation Anchors (novelty/feasibility/impact/effort/risk). Minimum 5."

## Brainstorm Modes

Default mode generates ideas freely. Two additional modes are available:

**`--analogical` mode:** Each agent must source ideas from a DIFFERENT domain and map them structurally:
- Agent prompt addition: "Find a solved problem in {assigned domain} that is structurally similar. Map: what plays the role of X in that domain? What plays the role of Y? Where does the analogy break?"
- Leader assigns domains: e.g., biology, urban planning, game design, supply chain, social networks
- Synthesis: leader extracts the structural mapping, not just the surface idea

**`--lateral` mode:** Each agent applies a different de Bono lateral thinking operator:
- Agent 1: **Reversal** — "What if the opposite were true? What if we did the exact reverse?"
- Agent 2: **Provocation (PO)** — "State something deliberately absurd about this problem. Then extract the useful kernel."
- Agent 3: **Random Entry** — "Pick a random word/concept. Force a connection to this problem."
- Agent 4: **Fractionation** — "Break the problem into non-obvious pieces. Recombine differently."
- Synthesis: leader runs vertical validation — which lateral ideas actually work when scrutinized?

**Call AskUserQuestion to confirm before Phase 2. Show phase results first.**

## Phase 2: CLUSTER
Leader deduplicates, groups by theme, assigns numbers.

**Call AskUserQuestion to confirm before Phase 3. Show phase results first.**

## Phase 3: VOTE (when --vote is set)
fan-out:
"Select the 3 most valuable. Format: 1. [number], 2. [number], 3. [number]"

## Final Output
```
💡 [brainstorm] {N} ideas, {T} themes
## Top 5 (when --vote is set)
| Rank | Idea | Votes |
```
