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
- **Migrations: two migration assemblies, one per provider (Strategy A) —
  not one provider-neutral migration set.** EF Core generates migrations
  *per provider*: column types, index syntax, and defaults all land in the
  model snapshot. A single migration set targeting two providers breaks at
  the first index or column-type divergence between them — this isn't a
  style choice, it's how EF's migration generation actually works.
  - **Mechanism**: a separate `DbContext` design-time factory per provider
    (or a build-time provider switch feeding one factory), each with its
    own `Migrations/` folder and its own migration history. Both are
    generated from the same C# entity model — only the generated migration
    code differs.
  - **Cost, stated plainly**: every schema change is authored/generated
    twice (`dotnet ef migrations add` once per provider) and reviewed
    twice. This is real, recurring effort, not a one-time setup cost.
  - **Why accepted anyway**: the alternative (a hand-written SQL migration
    runner — DbUp, Grate, or similar — with EF used for runtime queries
    only) trades this duplication for a worse failure mode: EF's model
    snapshot and the hand-maintained SQL schema can silently drift apart,
    since nothing forces them to agree. That drift surfaces as a
    production-only bug (the model believes a column/index exists that the
    manually-run SQL never created, or vice versa), which is a harder class
    of failure to catch than "someone forgot to generate the second
    migration" — the latter is exactly what the CI check below catches
    automatically, every time, before merge.
  - **CI must catch the failure mode a passing test suite misses**: a
    model change with no corresponding migration passes every application
    test (nothing queries the missing column/table in a way that fails)
    and only breaks on deployment to a fresh database. The check: run
    `dotnet ef migrations add __CheckOnly_<timestamp>` (or the equivalent
    "detect pending model changes" command) for **both** provider
    factories in CI, and fail if either produces a non-empty diff — a
    non-empty result means a migration should have been committed and
    wasn't. This runs in the data-layer lane of the CI matrix below, for
    both providers, not as a separate optional step.

## CI provider matrix — scoped

- PostgreSQL is primary, SQL Server secondary, both run via Testcontainers
  in CI.
- **Only tests that touch the data layer run in the matrix.** Everything
  else (unit tests with no DbContext, client/live2d-web, snow-app) runs
  once, as today. This scoping rule is a durable constraint, recorded here
  so the matrix is never deleted later on the grounds that it's slow — the
  matrix, kept narrow, is the only thing standing between "provider support
  is real" being an enforced property and it being a slogan nobody checks.
- **The empty-migration-diff check (above) runs in both matrix legs.** A
  schema change is not considered complete until both providers' migration
  histories are up to date and both legs are green — this is what makes
  "two migration assemblies" an enforced property rather than a hope that
  whoever changes the model remembers to run the second command.
- Not implemented yet: there is no Gateway data layer, `DbContext`, or CI
  data-layer lane at all as of this ADR (Phase 2 builds them). This section
  specifies what that lane must do once it exists — it is not a claim that
  it exists today.
- **Guarded against being forgotten**: `.github/workflows/guard-ef-migration-lane.yml`
  fails CI if any `Microsoft.EntityFrameworkCore` package reference or
  `DbContext` subclass appears anywhere in the repo while no CI step
  carrying the marker `migrations-empty-diff-check` exists. This is
  deliberately the same style as `guard-vendor-prefix.yml` — a control this
  ADR requires is exactly the kind of thing that quietly never gets wired
  up once the pressure of shipping Phase 2 features arrives; the guard
  makes forgetting it a CI failure instead of a silent gap. Whoever builds
  the actual migration lane (Phase 2) must include a step whose content
  contains that marker string — a comment is enough — for the guard to
  recognize it.

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
