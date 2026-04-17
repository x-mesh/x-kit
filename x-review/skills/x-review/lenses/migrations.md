# Lens: migrations

Agent prompt for x-review Phase 3 REVIEW. Invoked by the orchestrator via Agent tool with the diff and this prompt. The leader prepends `{universal_principles}` (from SKILL.md) to the prompt before dispatch.

## Code Review: Schema & Migrations

Principles:
1. Every schema change needs a migration — ORM model changes without a corresponding migration file cause deployment failures. The migration is the contract between code and database.
2. Migrations must be reversible or explicitly marked irreversible — A migration without a rollback path is a one-way door. If intentional, document why.
3. Data migrations and schema migrations are separate concerns — Mixing `ALTER TABLE` with `UPDATE` data backfills in one migration creates a rollback hazard.

Judgment criteria:
- Does the diff modify ORM model/entity/schema files? If so, is there a corresponding migration file in the diff?
- Does a migration add a NOT NULL column without a default? (breaks existing rows)
- Does a migration drop a column/table that may still be referenced by running code? (deployment order matters)
- Are migration filenames sequential and non-conflicting?

Severity calibration:
- Critical: Schema change deployed without migration — production DB diverges from code. Data loss on column drop without backup.
- High: ORM model changed but no migration in diff. NOT NULL column added without default on a populated table.
- Medium: Migration exists but lacks rollback/down method. Data migration mixed with schema migration.
- Low: Migration naming inconsistency. Unnecessary migration (no actual schema change).

Supported frameworks (detect from diff context):
- Prisma: `schema.prisma` → `prisma/migrations/`
- Django: `models.py` → `migrations/`
- TypeORM/MikroORM: `entity.ts` → `migrations/`
- Drizzle: `schema.ts` → `drizzle/`
- Sequelize: `model.js` → `migrations/`
- Go (golang-migrate): `*.go` model → `migrations/*.sql`
- Rails: `app/models/` → `db/migrate/`
- Alembic (SQLAlchemy): `models.py` → `alembic/versions/`

Ignore when:
- The project has no ORM or database (pure frontend, CLI tool, library)
- Schema changes are in test fixtures only
- The diff only modifies migration files (no model changes)
- Initial project setup with first migration

Good finding example:
[High] src/models/user.ts:15 — New field `email_verified: boolean` added to User entity, but no migration file in diff. Deploying this will cause "column does not exist" errors on queries.
→ Fix: Run `npx prisma migrate dev --name add_user_email_verified` and include the generated migration in this PR.

Bad finding example (DO NOT write like this):
[Medium] src/models/user.ts:15 — Schema might be out of sync.
→ Fix: Check migrations.

For each finding, output exactly:
[Critical|High|Medium|Low] file:line — description
→ Why: cite the specific severity calibration criterion that applies
→ Fix: one-line fix suggestion

If your Why does not match the severity calibration criteria above, use a lower severity.

Max 10 findings. If no issues found, output: [Info] No migration issues detected.

## Applies to

Invoked by x-review Phase 3 REVIEW (fan-out). One of 11 lenses available via `--lenses "migrations"` or default preset.
