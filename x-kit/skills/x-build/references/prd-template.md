# PRD Template

Full Project Requirements Document template with per-section quality criteria. Used by x-build plan phase when generating PRDs from research artifacts (CONTEXT.md, REQUIREMENTS.md, ROADMAP.md).

## Template Structure

```
# PRD: {project_name}

## 0. Assumptions & Open Questions

**REQUIRED section — gates task decomposition. Cannot be empty, cannot be "none".**

### Assumptions (confidence-tagged)
- [A1, high] {assumption that's safe to proceed on — e.g., "PostgreSQL is the canonical store"}
- [A2, medium] {assumption requiring validation — e.g., "users table has <10M rows"} → Validation: {how to verify}
- [A3, low] {assumption blocking progress if wrong — e.g., "auth provider supports refresh tokens"} → **MUST validate before Plan phase completes**

### Open Questions
- [Q1] {ambiguity the user has not resolved — e.g., "Is lastLogin updated on refresh or only initial login?"} → Status: blocking | answered
- [Q2] {multiple interpretations exist — list them: (a) ..., (b) ..., (c) ...} → Decision: {user's pick or "pending"}

**Gate rule**: If any `[A*, low]` or `Q* status: blocking` remains unresolved, Plan phase MUST halt and run `AskUserQuestion` before proceeding to task decomposition.

**Anti-pattern**: "No assumptions made" or empty Open Questions. If the agent truly has no ambiguity on a non-trivial task, it hasn't thought hard enough. Minimum: 2 assumptions, 1 open question.

## 1. Goal
{2-3 sentences: WHAT this project delivers + WHY it matters + WHO benefits.}
{Anti-pattern: 1-line goals like 'Add feature X' — always include the motivation.}
{If the goal needs 'and' joining two unrelated outcomes, split into two projects.}

## 2. Success Criteria
- [SC1] {verb + measurable outcome + threshold. e.g., 'Reduce API latency to <200ms p95'}
- [SC2] {each SC must be binary pass/fail — no 'should be fast' or 'works correctly'}
{Minimum 2 SCs. Each must answer: 'How would a stranger verify this in 5 minutes?'}

## 3. Constraints
- [C1] {hard constraint — non-negotiable. e.g., 'Must use existing PostgreSQL 15 instance'}
- [C2] {preferences disguised as constraints are NOT constraints — move them to NFR}

## 4. Non-Functional Requirements
- Performance: {response time, throughput}
- Security: {authentication, encryption}
- Scalability: {scaling requirements}
- Reliability: {availability, recovery}

## 5. Requirements Traceability
- [R1] {requirement} → SC1
- [R2] {requirement} → SC1, SC2
{Map EVERY item from REQUIREMENTS.md to at least one SC#. Unmapped items = scope creep or missing SC.}
{IDs must be sequential (R1, R2, R3...). Gaps (R1, R2, R6) indicate deleted requirements — renumber.}

## 6. Out of Scope
- {explicitly state what is NOT included — boundaries matter more than inclusions}
{Minimum 2 items. Ask: 'What will users expect this project to do, that it will NOT do?'}

## 7. Risks
{Minimum 2 risks. Format: risk description → likelihood (H/M/L) × impact (H/M/L) → mitigation.}
- {risk 1} — Likelihood: M, Impact: H → Mitigation: {specific action}
- {risk 2} — Likelihood: L, Impact: H → Mitigation: {specific action}
{Anti-pattern: 'Security risks' without specifics. Name the attack vector and the mitigation.}

## 8. Architecture

**Express the system structure with an ASCII diagram.** Select the appropriate type from the guide below.

### Diagram Selection Guide (23 types)

| Category | Situation | Recommended Type |
|------|------|----------|
| **System Architecture** | Overall service/API structure | System Architecture |
| | Logical layer design | Layers |
| | Plugin/module extension | Extension Structure |
| | Distributed system network | Topology |
| **Process/Flow** | API call sequence | Sequence |
| | Task dependencies | Tree, DAG |
| | Async event communication | Message, CQRS |
| | User action branching | User Journey |
| **Data/State** | Data processing flow | Pipeline, ETL |
| | State transitions | State Machine |
| | DB table relationships | ERD |
| **Infrastructure** | Environment switching | Before/After |
| | Network paths | Network Flow |
| | Access control | Security Boundary |
| | Auto-scaling | Resource Allocation |
| **AI/Automation** | Agent collaboration | Multi-Agent |
| | CI/CD | Deployment Pipeline |
| | Error handling | Fallback |
| **Other** | UI wireframe | Layout |
| | Project schedule | Gantt |

### Standard Format

```
■ Diagram: [name]
■ Purpose: [core message 1-2 lines]

[ ASCII Art — use code block ]

■ Legend:
  - [ ] : Component / Server
  - ( ) : Data / State
  - ──▶ : Synchronous call
  - ╌╌▶ : Async communication

■ Key Notes:
  1. [Design point]
  2. [Performance/security notes]
```

### Reference Examples

System Architecture:
```
[Client] ──▶ [WAF/LB] ──▶ [App Cluster] ──▶ [(DB)]
```

Sequence:
```
User        Server        DB
 │── Req ──▶│             │
 │          │── Query ───▶│
 │          │◀── Result ──│
 │◀── Res ──│             │
```

DAG:
```
     ┌── [Build A] ──┐
[Push]               ├──▶ [Test] ──▶ [Deploy]
     └── [Build B] ──┘
```

State Machine:
```
[Pending] ──(Start)──▶ [Running] ──(Done)──▶ [Complete]
                          │
                       (Fail)──▶ [Failed]
```

Multi-Agent:
```
                 ┌──▶ [Planning Agent] ──┐
[Router Agent] ──┤                      ├──▶ [Executor]
                 └──▶ [Memory Mesh] ◀───┘
```

Key decisions: Describe why this structure was chosen and what alternatives were rejected.

## 9. Key Scenarios

Write 2-3 concrete scenarios as step-by-step flows:

### Happy Path
1. User runs `{command}`
2. System does {specific action}
3. User sees {specific output}
4. Result: {measurable outcome}

### Failure Path
1. User runs `{command}` with {invalid input}
2. System detects {specific condition}
3. User sees {error message text}
4. System state: {unchanged / rolled back}

### Edge Case
1. {Unusual but realistic scenario}
2. Expected behavior: {specific}

Include a **Day-0 Demo Script**: the exact commands a PM would run to demo this feature in 3 minutes.

## 10. Data Model & API Contracts

### Entity Model
List core entities with key fields and relationships (Mermaid ER or table):

| Entity | Key Fields | Relationships |
|--------|-----------|---------------|
| {Entity A} | id, name, status, created_at | has_many: {Entity B} |

### Critical API Contracts
For each interface crossing a module boundary, specify:
```
GET /api/{endpoint}
Response: { field1: string, field2: number, nested: { ... } }
Errors: 400 (invalid input), 404 (not found)
```

### Data Flow Trace
Trace one request end-to-end: `User input → Component A (does X) → Component B (does Y) → Output`
Name actual files, functions, or variables at each step.

## 11. Decisions & Assumptions

### Decision Log
For each non-obvious decision, record what was chosen AND what was rejected:
| Decision | Chosen | Rejected | Rationale |
|----------|--------|----------|-----------|
| {topic} | {option A} | {option B, C} | {why A wins} |

### Assumption Register
Separate facts from assumptions. If an assumption breaks, what collapses?
| Assumption | Confidence | If Wrong |
|-----------|-----------|----------|
| {assumption} | high/medium/low | {consequence} |

### Tension Map
Where do requirements conflict? How was each resolved?
| Requirement A | Requirement B | Tension | Resolution |
|--------------|--------------|---------|------------|

### Invariants
Things that must ALWAYS be true regardless of implementation:
- {invariant 1 — e.g., "No writes to .xm/ ever"}
- {invariant 2 — e.g., "safeJoin called on every file path"}

## 12. Acceptance Criteria
- [ ] {verifiable checklist item — must be a command or observable state check}
- [ ] {e.g., `bun test` passes, `curl /api/health` returns 200, file X exists with Y content}
{Minimum: 1 item per SC. Each AC must map back to a Success Criterion.}
{Anti-pattern: 'Code is well-tested' — not verifiable. Use: 'bun test passes with 0 failures'.}

## 13. Boundaries

Explicitly define agent autonomy scope for this project. Three tiers:

### Always do (autonomous)
- {actions the agent should take without asking — e.g., "Run tests before commit", "Apply lint fixes", "Update marketplace copies via sync-bundle.sh"}

### Ask first (user confirmation required)
- {actions that need user sign-off — e.g., "Database schema changes", "Adding new dependencies", "Modifying CI config", "Force-push to main"}

### Never do (forbidden)
- {hard prohibitions — e.g., "Commit secrets", "Edit vendor directories", "Remove failing tests without approval", "Direct marketplace copy edits"}

{Minimum 2 items per tier. Boundaries shape how the agent behaves when the plan encounters edge cases — "what would you have me do?" moments.}
```

## Section Quality Criteria

Core rules (always apply):
- **Section 0 (Assumptions & Open Questions): REQUIRED. Cannot be empty. Minimum 2 assumptions (confidence-tagged) + 1 open question. Any `[*, low]` assumption or `blocking` question HALTS task decomposition until user validates via AskUserQuestion. "No assumptions" is rejected — the agent hasn't thought hard enough.**
- Goal: 2-3 sentences with WHAT + WHY + WHO. If it needs 'and' joining unrelated outcomes, split into two projects.
- Success Criteria: Each must be measurable and binary (pass/fail). Minimum 2. 'Works correctly' is NEVER a valid SC.
- Constraints: Only hard constraints — non-negotiable. Preferences go to NFR.
- Requirements Traceability: Every R# maps to at least one SC#. IDs must be sequential — no gaps.
- Risks: Minimum 2. Each with likelihood × impact + specific mitigation. 'Security risks' without specifics = rejected.
- Architecture: ALWAYS include a diagram (even for small projects). A box-and-arrow showing data flow is sufficient.
- Acceptance Criteria: Each item must be testable by command or state check. Minimum 1 per SC.
- Boundaries: 3-tier (Always / Ask first / Never) with minimum 2 items per tier. Empty or "TBD" tiers = rejected. Each item must be imperative and observable.

## Applies to

Used by x-build plan phase (PRD generation delegate prompt), PRD review loop, PRD Quality Gate, and consensus review. The x-build delegate prompt reads this file before generating the PRD; the agent returns a completed PRD that goes through review → plan-check → task decomposition.
