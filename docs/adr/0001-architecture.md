# ADR-0001: Baseline Architecture

- Status: Accepted
- Date: 2026-09-08

## Context

NowCompanion is a sellable, multi-tenant B2B product: a Windows desktop companion
that surfaces ServiceNow work items via a Gateway, with an optional AI summary
layer. It must satisfy enterprise deployability, tenant isolation, and least-
privilege access to customer ServiceNow instances from day one, not as a
retrofit. This ADR records the architecture decisions that follow directly from
the project's non-negotiables and fixes the numbering convention for future
ADRs (`docs/adr/NNNN-title.md`, sequential, never renumbered or reused).

## Decision

1. **Strict client/gateway/ServiceNow separation.** The client never holds
   ServiceNow credentials and never calls ServiceNow directly. All access is
   Client ↔ Gateway ↔ ServiceNow. This is enforced by the client having no
   ServiceNow SDK/HTTP dependency at all, not by code review discipline.

2. **Client is stateless on disk.** No business data (record content,
   notifications, tokens) is written to disk. ServiceNow/Gateway credentials
   are never handled by the client directly (Entra tokens live in memory /
   MSAL's in-memory cache); any locally-cached secret material uses Windows
   Credential Manager (DPAPI), never a file. Logs are structured (Serilog) and
   scoped to exclude record fields by construction (log templates take
   identifiers, not payload objects).

3. **Tenant isolation is a data-access-layer property.** Every EF Core query
   in the Gateway is scoped by `tenant_id` sourced from the validated Entra
   token's `tid` claim, not from a client-supplied value. See ADR risk in
   `docs/threat-model.md` (cross-tenant token acceptance) for why `tid` alone
   is insufficient and must be checked against a provisioned-tenant allowlist.

4. **ServiceNow access is scoped-app-only.** All Gateway → ServiceNow traffic
   goes through the `x_1821654_companion` scoped app's Scripted REST API,
   authenticated as a dedicated least-privilege integration role via OAuth 2.0
   Client Credentials (Gateway holds the client secret; no per-user OAuth in
   v1). No direct Table API calls against base tables. The scope prefix is
   temporary personal-developer-account debt — see ADR-0002.

5. **Policy gate on every notification.** Every outbound notification is
   filtered through the tenant's `companion_policy` (allowed tables, allowed
   fields, disclosure level, AI on/off) before it reaches SignalR. This is a
   single chokepoint in the Gateway, not per-feature logic.

6. **Secrets from configuration/Key Vault only.** No secret literals in code,
   tests, or committed config. Local dev uses .NET user-secrets / environment
   variables; CI/CD uses GitHub Environments + (later) Key Vault references.
   CI-to-Azure auth uses GitHub OIDC federated credentials, not a stored
   service-principal secret, from the first workflow that needs Azure access.

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
  live Azure subscription (SQL Server in a container, an emulated/dev Entra
  tenant, a fake SN server double). `/infra` Bicep is written against this
  constraint when Phase 2 starts; a live subscription is only required at the
  end of Phase 2.
- **Character rendering abstraction** — Phase 3 introduces an
  `ICharacterRenderer` interface with a Live2D implementation (Free/Evaluation
  license — see `docs/licenses.md`) and a stub sprite-sheet implementation, so
  the renderer is replaceable and the licensed SDK is not load-bearing for the
  whole client.
- **AI provider abstraction** — Phase 5 introduces `IAiProvider` defaulting to
  Azure OpenAI in Japan East (data residency) with an Anthropic stub behind
  the same interface. Prompts are versioned files under `/gateway/Prompts`.

## Consequences

- Gateway solution has three projects from Phase 0 (`Gateway.Core`,
  `packs/itsm/Gateway.Packs.Itsm`, `Gateway.Host`) instead of one, adding
  minor ceremony now to avoid a breaking restructure at Phase 4.
- The scope-prefix and secrets rules are enforced by a CI guard (grep-based
  check for `x_1821654_` outside `snow-app/now.config.json`), not left to
  reviewer discipline.
- CI has two OS lanes for .NET (`windows-latest` for `/client`'s WPF build,
  `ubuntu-latest` for `/gateway`, matching its Container Apps deploy target)
  rather than a single matrix, because WPF does not build on Linux.
