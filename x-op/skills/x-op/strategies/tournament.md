# Strategy: tournament

Compete → anonymous vote → adopt winner. Default single-elimination; `--bracket double` enables losers' bracket with seed ranking.

## Phase 1: COMPETE
> 🏆 [tournament] Phase 1: Compete

fan-out:
```
"Submit your best result. This is a competition — the best result will be adopted. Structure by dimension (see Dimension Anchors). Judges score per-dimension. 400 words max."
```

**Call AskUserQuestion to confirm before Phase 2. Show phase results first.**

## Phase 2: ANONYMIZE
The leader anonymizes collected results:
- Remove agent names, shuffle order
- Label as "Solution A", "Solution B", "Solution C"

**Call AskUserQuestion to confirm before Phase 3. Show phase results first.**

## Phase 3: VOTE
fan-out:
```
"Rank the solutions below from 1st to last.
{anonymized solution list}
Format: 1st: [A|B|C], 2nd: [...], ... Reason: [one line]"
```

**Call AskUserQuestion to confirm before Phase 4. Show phase results first.**

## Phase 4: TALLY
Borda count (1st=N points, 2nd=N-1 points...). Leader breaks ties.

## Final Output
```
🏆 [tournament] Winner: Solution {X} ({agent})
| Rank | Solution | Score |
| 1st | {X} | {S} |
```

---

## Enhanced: seed ranking

Adds seed ranking to the existing tournament.

### Phase 0: SEED (new)
> 🏆 [tournament] Phase 0: Seed

Before COMPETE, a lightweight evaluation (leader directly or haiku agent):
- Quick-score each candidate solution 1-10
- Compose bracket based on scores (strong competitors meet later)

### Bracket options
- `--bracket single` — Single elimination (default)
- `--bracket double` — Double elimination (includes losers' bracket)
- With 8 agents: quarterfinals → semifinals → finals

Remaining phases (COMPETE, ANONYMIZE, VOTE, TALLY) proceed identically but within the bracket structure, round by round.
