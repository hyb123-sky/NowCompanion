# ADR-0006: Hosting Neutrality

- Status: Accepted
- Date: 2026-09-10
- Supersedes: the hosting-specific content of ADR-0001 (a single cloud
  target assumed for database and secrets). ADR-0001's other decisions
  (non-negotiables #1–#5, #7, the Gateway/Core/pack split) stand unchanged.

## Context

ADR-0001 assumed a single cloud target implicitly (a specific managed SQL
service, a specific managed secrets service). That assumption was never a
technical requirement of the architecture — nothing about tenant isolation,
the outbox, or the policy gate depends on which host runs the database or
where a secret is stored. This ADR makes the hosting target an explicit,
open decision, and replaces the assumption with constraints that hold
regardless of what's eventually chosen.

**Decision: the hosting target is undecided.** Constraints replace the
choice below.

## Data access

- All data access through EF Core. No raw SQL. No provider-specific column
  types, functions, or index hints — anything that only compiles against
  one database engine is out of bounds.
- Tenant isolation, first line: EF Core global query filters on
  `tenant_id`, applied at the DbContext level so no query can accidentally
  skip them. Database-level row-level security (RLS) is a second line,
  where the provider supports it. **Tests must pass with the first line
  alone** — if a test only passes because RLS is on, the EF-level filter is
  broken and RLS is silently doing its job for it. This inverts the usual
  instinct to treat the database-level control as the strong one; here it's
  the fallback, precisely because it isn't guaranteed to exist on every
  provider.
- Migrations: **provider-neutral EF Core migrations**, not maintained
  per-provider. Cost of this choice: provider-neutral migrations can't use
  provider-specific column types or index features (already excluded above),
  and a handful of EF Core provider quirks (e.g., default-value SQL
  generation, some datetime precision differences) need integration-test
  coverage across both providers in the CI matrix rather than assumed
  identical. The alternative (maintaining two migration histories) was
  rejected: it doubles the maintenance surface for a benefit (provider-
  specific optimization) this project doesn't need yet, and the CI matrix
  below already catches genuine divergence.

## CI provider matrix — scoped

- PostgreSQL is primary, SQL Server secondary, both run via Testcontainers
  in CI.
- **Only tests that touch the data layer run in the matrix.** Everything
  else (unit tests with no DbContext, client/live2d-web, snow-app) runs
  once, as today. This scoping rule is a durable constraint, recorded here
  so the matrix is never deleted later on the grounds that it's slow — the
  matrix, kept narrow, is the only thing standing between "provider-neutral"
  being an enforced property and it being a slogan nobody checks.

## Secrets

- An `ISecretSource` abstraction, implemented per environment (local dev:
  user-secrets/environment variables; any hosting target: whatever secret
  store that target offers, behind the same interface). Configuration
  files contain zero secrets under any implementation. This replaces
  non-negotiable #6's earlier reliance on a specific managed-identity
  cloud feature — the requirement was always "no secrets in code/config,"
  not "must use one particular vendor's vault."

## Tamper-evident audit log — application-level hash chain

- Each audit row stores `hash(prev_hash ‖ canonical(row))` — a hash chain
  maintained by the application, not a database-native feature, so it
  works identically regardless of hosting target.
- **Canonical serialization, defined explicitly** (this is the part that
  makes the chain actually verifiable, not just conceptually sound):
  - Field order: fixed, declared explicitly in code (e.g., an ordered list
    of property names), never reflection-derived default member order.
  - Timestamps: UTC, ISO-8601, fixed precision (milliseconds).
  - Numeric formatting: fixed (e.g., invariant culture, no thousands
    separators, explicit decimal precision for any non-integer field).
  - Encoding: UTF-8, no BOM.
  - **Test required**: the same logical row, constructed twice in two
    separate process runs, must produce an identical hash. Without this
    test, the chain is unverifiable the moment a library version changes
    (e.g., a JSON serializer changing default field order or float
    formatting between versions) — the test is what catches that, not
    code review.
- The chain's head is periodically anchored to an append-only external
  store (mechanism TBD — deliberately not chosen here, to avoid re-coupling
  this ADR to a specific hosting target).
- **Honest limit, stated plainly**: this detects modification of a row. It
  does **not** prevent an attacker with database write access from
  regenerating the entire chain from a tampered starting point — that's
  only prevented by the periodic external anchor, which puts the true root
  of trust outside the database. A database-native ledger feature, where a
  hosting target happens to offer one, is a second line, layered on top —
  never the only mechanism, for the same reason RLS is a second line above:
  it isn't guaranteed to exist everywhere this might run.
- Every threat-model entry that currently claims mitigation via a
  database-native ledger or other provider-specific feature is updated to
  describe the application-level hash chain instead (see
  `docs/threat-model.md`).

## Deployment

- Delete the IaC templates under `/infra`. (Nothing had actually been
  written there beyond a placeholder README describing a future Bicep
  setup — there was no working template to migrate, only a assumption to
  remove.)
- Create `/deploy/reference/`: a Dockerfile for the Gateway host, a
  `docker-compose.yml`, and a one-page runbook.
- Labeled in `/deploy/reference/README.md`, verbatim: *"Evidence that a
  deployment path works. Not an architectural commitment. Any container
  host can consume the same image."*

## Terminology

Generic OIDC terminology throughout code, config keys, and docs. Entra ID
is referred to only as "the first tested IdP," never as an assumption
baked into a type name, config key, or comment that would need to change
if a second IdP were tested.

## Consequences

- The EF-filter-first, RLS-second ordering means the strongest-looking
  control (a database engine feature) is deliberately not load-bearing on
  its own — this needs to be understood by anyone reviewing the tenant-
  isolation tests, or a passing RLS-backed test could be mistaken for the
  EF-level control having been verified when it wasn't.
- The CI matrix adds real time/cost to every data-layer-touching PR (two
  Testcontainers runs instead of one) — accepted, and scoped narrowly for
  exactly this reason.
- `/deploy/reference` needs to stay honest about its own limits — the
  moment it grows features beyond "prove the image runs," it stops being
  reference material and starts being an unreviewed architectural
  commitment by accretion.
