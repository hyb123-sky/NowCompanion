# ADR-0001: Baseline Architecture

- Status: Accepted. **Amended 2026-09-10**: decision #6 (secrets) and the
  hosting assumptions embedded in it are superseded by ADR-0006; the
  identity-provider specifics in decision #3 are generalized by the
  ADR-0003 amendment; the AI-provider forward-looking decision below is
  superseded by ADR-0007. **Amended 2026-09-11**: decision #2's client-side
  authentication is placed behind an `IIdentityProvider` abstraction —
  MSAL.NET is a concrete implementation choice, not an architectural
  decision, and is named only in "Implementation notes" below, never in
  this ADR's Decision text. Decisions #1, #4, #5, #7 and the repository/
  phase-gating section otherwise stand, written as originally recorded.
- Date: 2026-09-08

## Context

NowCompanion is a multi-tenant system: a Windows desktop companion that
surfaces ServiceNow work items via a Gateway, with an optional
external-context summary layer (ADR-0007). It must satisfy enterprise
deployability, tenant isolation, and least-privilege access to ServiceNow
instances from day one, not as a retrofit. This ADR records the
architecture decisions that follow directly from the project's
non-negotiables and fixes the numbering convention for future ADRs
(`docs/adr/NNNN-title.md`, sequential, never renumbered or reused).

## Decision

1. **Strict client/gateway/ServiceNow separation.** The client never holds
   ServiceNow credentials and never calls ServiceNow directly. All access is
   Client ↔ Gateway ↔ ServiceNow. This is enforced by the client having no
   ServiceNow SDK/HTTP dependency at all, not by code review discipline.

2. **Client is stateless on disk.** No business data (record content,
   notifications, tokens) is written to disk. ServiceNow/Gateway credentials
   are never handled by the client directly — authentication sits behind an
   `IIdentityProvider` abstraction (see "Implementation notes" for the
   current concrete implementation); OIDC tokens live in memory only,
   never on disk; any locally-cached secret material uses Windows
   Credential Manager (DPAPI), never a file. Logs are structured (Serilog) and
   scoped to exclude record fields by construction (log templates take
   identifiers, not payload objects).

3. **Tenant isolation is a data-access-layer property.** Every EF Core query
   in the Gateway is scoped by `tenant_id` sourced from the validated OIDC
   token's tenant-equivalent claim (Entra ID's `tid`, as the first tested
   IdP), not from a client-supplied value. See ADR risk in
   `docs/threat-model.md` (cross-tenant token acceptance) for why that claim
   alone is insufficient and must be checked against a provisioned-tenant
   allowlist.

4. **ServiceNow access is scoped-app-only.** All Gateway → ServiceNow traffic
   goes through the `x_1821654_buddy` scoped app's Scripted REST API,
   authenticated as a dedicated least-privilege integration role via OAuth 2.0
   Client Credentials (Gateway holds the client secret; no per-user OAuth in
   v1). No direct Table API calls against base tables. The scope prefix is
   temporary personal-developer-account debt — see ADR-0002.

5. **Policy gate on every notification.** Every outbound notification is
   filtered through the tenant's `companion_policy` (allowed tables, allowed
   fields, disclosure level, external context on/off — ADR-0007) before it
   reaches SignalR. This is a single chokepoint in the Gateway, not
   per-feature logic.

6. **Secrets from configuration via an abstraction only.** No secret
   literals in code, tests, or committed config. Local dev uses .NET
   user-secrets / environment variables; any hosting target's secret store
   sits behind an `ISecretSource` interface (ADR-0006) — no cloud-native
   managed-identity feature is assumed directly. CI-to-hosting-target auth
   uses OIDC federated credentials, not a stored long-lived secret, from
   the first workflow that needs deployment access.

7. **Domain-agnostic core, ITSM as a pack.** `Gateway.Core` models the
   `task` hierarchy and `sysapproval_approver` generically and knows nothing
   about incident/change/problem-specific fields or rules. `packs/itsm` is a
   separate class library that depends on `Gateway.Core`; the dependency is
   one-way (Core never references a pack). This is fixed in the solution
   layout starting Phase 0, not deferred to Phase 4, so adding `packs/hr` or
   `packs/rc` later never requires surgery on Core.

## Repository and phase gating

The repository layout and phase order in `CLAUDE.md` are binding. Each phase
must land before the next starts; this ADR does not authorize skipping ahead.
Forward-looking decisions captured during Phase 0 planning but scoped to a
later phase are recorded here for traceability and executed when that phase
starts:

- **Vendor prefix debt and re-scope plan** — ADR-0002.
- **ServiceNow version support** — rolling N/N-1 (Australia/Zurich), see
  `docs/servicenow-compatibility.md`. Not pinned to a single release.
- **Local-first Phase 2 environment** — Gateway must be testable without a
  live hosting-target account (a database in a local container, an
  emulated/dev IdP tenant, a fake SN server double). `/deploy/reference`
  (ADR-0006) captures a working deploy path; it is evidence a container
  image runs, not an architectural commitment to any particular host.
- **Character rendering abstraction** — Phase 3 introduces an
  `ICharacterRenderer` interface with a Live2D implementation (Free/Evaluation
  license — see `docs/licenses.md`) and a stub sprite-sheet implementation, so
  the renderer is replaceable and the licensed SDK is not load-bearing for the
  whole client.
- **External context provider** — Phase 5 introduces `IContextProvider` with
  a local stub implementation; the real provider is an external system,
  integrated later. See ADR-0007 — this supersedes an earlier, broader
  AI-provider-abstraction plan that was scoped larger than this project can
  validate.

## Implementation notes (not architectural decisions — subject to change without an ADR)

- `IIdentityProvider`'s current sole implementation is **MSAL.NET**, since
  Entra ID is the first tested IdP. This is an implementation detail: a
  future second IdP or client library swap does not require revisiting
  decision #2, only this note.

## Consequences

- Gateway solution has three projects from Phase 0 (`Gateway.Core`,
  `packs/itsm/Gateway.Packs.Itsm`, `Gateway.Host`) instead of one, adding
  minor ceremony now to avoid a breaking restructure at Phase 4.
- The scope-prefix and secrets rules are enforced by a CI guard (grep-based
  check for `x_1821654_` outside `snow-app/now.config.json`), not left to
  reviewer discipline.
- CI has two OS lanes for .NET (`windows-latest` for `/client`'s WPF build,
  `ubuntu-latest` for `/gateway`, since its container image targets Linux —
  ADR-0006) rather than a single matrix, because WPF does not build on Linux.
