# Rubrics Reference

Built-in rubrics and domain-specific presets available in x-eval. Use with `--rubric <name>` or `rubric list`.

Each rubric declares a `pass_threshold` — the weighted overall score (1–10 scale) at which a single trial is counted as "pass" for `pass@k` / `pass^k` metrics in `bench`. Custom rubrics may override this in their JSON (`storage-layout.md`). Default: **7.0**.

## Built-in Rubrics

### code-quality

| Criterion | Description | Weight |
|-----------|-------------|--------|
| correctness | Logic is correct, handles edge cases, no bugs | 0.30 |
| readability | Clear naming, structure, minimal cognitive load | 0.20 |
| maintainability | Extensible, follows patterns, low coupling | 0.20 |
| security | No injection, input validated, secrets safe | 0.20 |
| test-coverage | Critical paths have tests or are testable | 0.10 |

**Pass threshold**: 7.0

### review-quality

| Criterion | Description | Weight |
|-----------|-------------|--------|
| coverage | All important issues found, nothing critical missed | 0.30 |
| actionability | Each finding has a clear fix suggestion | 0.30 |
| severity-accuracy | Critical bugs labeled critical, nits labeled nits | 0.25 |
| false-positive-rate | No valid code flagged as problematic | 0.15 |

**Pass threshold**: 7.0

### plan-quality

| Criterion | Description | Weight |
|-----------|-------------|--------|
| completeness | All requirements addressed by tasks | 0.30 |
| actionability | Each task is concrete and executor can start immediately | 0.30 |
| scope-fit | Plan fits the stated goal — not over or under | 0.20 |
| risk-coverage | Key risks and dependencies identified | 0.20 |

**Pass threshold**: 7.0

### general

| Criterion | Description | Weight |
|-----------|-------------|--------|
| accuracy | Factually correct, no errors | 0.25 |
| completeness | All aspects of the question addressed | 0.25 |
| consistency | No internal contradictions | 0.20 |
| clarity | Easy to follow, well structured | 0.20 |
| hallucination-risk | No unsupported claims or fabricated facts | 0.10 |

**Pass threshold**: 7.0

---

## Domain Rubric Presets

Domain-specific presets beyond the built-in rubrics. Viewable via `rubric list`.

### api-design

| Criterion | Description | Weight |
|-----------|-------------|--------|
| consistency | Naming, patterns, error format uniform across endpoints | 0.25 |
| completeness | All CRUD + edge cases covered, pagination, filtering | 0.25 |
| security | Auth, rate limiting, input validation, OWASP compliance | 0.25 |
| developer-experience | Clear errors, self-documenting, discoverable | 0.15 |
| extensibility | Versioning strategy, backward compatibility | 0.10 |

**Pass threshold**: 7.0

### frontend-design

| Criterion | Description | Weight |
|-----------|-------------|--------|
| visual-coherence | Color, typography, spacing create unified identity | 0.25 |
| originality | Custom decisions vs template defaults, avoids generic patterns | 0.25 |
| craft | Typography hierarchy, spacing rhythm, color harmony, contrast | 0.20 |
| usability | Intuitive navigation, accessible, responsive | 0.20 |
| performance | Minimal layout shift, fast paint, optimized assets | 0.10 |

**Pass threshold**: 7.0

### data-pipeline

| Criterion | Description | Weight |
|-----------|-------------|--------|
| correctness | Data transformations produce expected output, no data loss | 0.30 |
| reliability | Error handling, retry logic, idempotency, dead-letter queues | 0.25 |
| observability | Logging, metrics, alerting, data lineage tracking | 0.20 |
| efficiency | Batch sizing, parallelism, resource utilization | 0.15 |
| schema-safety | Schema evolution handled, backward/forward compatibility | 0.10 |

**Pass threshold**: 7.0

### security-audit

| Criterion | Description | Weight |
|-----------|-------------|--------|
| vulnerability-coverage | OWASP Top 10 addressed, injection/XSS/CSRF checked | 0.30 |
| auth-correctness | Authentication + authorization logic sound, no bypasses | 0.25 |
| data-protection | Secrets management, encryption at rest/transit, PII handling | 0.20 |
| attack-surface | Unnecessary endpoints/ports closed, minimal exposure | 0.15 |
| compliance | Relevant standards (GDPR, SOC2, HIPAA) addressed if applicable | 0.10 |

**Pass threshold**: 8.0  (security-critical — higher bar)

### architecture-review

| Criterion | Description | Weight |
|-----------|-------------|--------|
| modularity | Clear boundaries, low coupling, high cohesion | 0.25 |
| scalability | Handles growth in data, users, features without redesign | 0.25 |
| simplicity | No unnecessary abstractions, appropriate complexity for requirements | 0.20 |
| resilience | Failure handling, degradation strategy, recovery mechanisms | 0.15 |
| operability | Deployable, observable, configurable without code changes | 0.15 |

**Pass threshold**: 7.0

## Applies to

`score`, `compare`, `bench` subcommands — any command accepting `--rubric <name>`.
Custom rubrics created via `rubric create` are stored in `.xm/eval/rubrics/` and appear alongside built-ins in `rubric list`.
