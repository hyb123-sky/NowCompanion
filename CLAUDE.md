# Project: NowCompanion — Enterprise Desktop Companion for ServiceNow

## Mission
A Windows desktop companion (Live2D character) that surfaces ServiceNow work items
assigned to the logged-in user — SLA breaches, approvals, assignments, change windows —
with optional external-context-provider summaries (see ADR-0007). The character is the
UI; the system is a notification/assistant agent with a full admin and compliance
surface. **Prototype phase**: production-grade engineering discipline is the standard
held throughout, but productization is a separate, later decision — not assumed here.

The developer is a ServiceNow-certified consultant (CSA, CAD, CIS-ITSM, CIS-RC,
CIS-DF) with limited software-product experience. Explain architectural decisions
briefly when you make them. Push back when I ask for something that would
compromise security, maintainability, or enterprise deployability.

## Non-negotiables (violating any of these is a bug)
1. The client NEVER holds ServiceNow credentials or calls ServiceNow directly.
   Client ↔ Gateway only. Gateway ↔ ServiceNow only.
2. Client persists ZERO business data to disk. In-memory only. Credentials via
   Windows Credential Manager (DPAPI). Logs must never contain record content.
3. Tenant isolation in Gateway is enforced at the data-access layer, not by
   convention. Every query is scoped by tenant_id from the validated OIDC token
   (Entra ID is the first tested identity provider — see the ADR-0003 amendment
   for the generalization discipline that keeps this from quietly weakening).
4. All ServiceNow access goes through the scoped app's Scripted REST API with a
   dedicated least-privilege role. No direct Table API on base tables.
5. Every notification passes through the tenant's `companion_policy` before it
   reaches a client (allowed tables, allowed fields, disclosure level, external
   context on/off — see ADR-0007).
6. Secrets from configuration via an `ISecretSource` abstraction only (ADR-0006)
   — never a cloud-native managed-identity feature assumed directly. Never in
   code, never in tests.
7. Domain-agnostic core: the engine consumes the `task` hierarchy and
   `sysapproval_approver`. ITSM is a **Domain Pack** (`packs/itsm`), not the core.
   Design so `packs/hr` and `packs/rc` can be added without touching core.
   **Acceptance criteria (PR-3)**: `event_type` is a string with a registry, not
   an enum; the outbox payload is a generic envelope plus a pack-specific body;
   emotion mapping is configuration keyed by pack event type, with a default
   fallback for unknown types; proof is a fake test pack on a fictitious
   task-derived table exercising the core end to end, and
   `grep -r "incident\|change_request" gateway/Core snow-app/src/core` returns
   nothing. Design as though a second domain pack ships next month — do not
   implement it.
8. Cross-user isolation within a tenant does not rely on ServiceNow
   verifying identity — under OAuth Client Credentials (#4) ServiceNow only
   ever sees the integration service account, never a per-user session,
   so it cannot. Every `companion_outbox` row carries the target user's
   sys_id. The Scripted REST API accepts an IdP subject identifier — the
   composite `(idp_issuer, idp_subject)`, never a subject alone, never a
   sys_id — and resolves it to a `sys_user` via `companion_user_map` (unique
   on the pair) before filtering the outbox — returning 403, never an empty
   result, when there's no map entry. The Gateway is the only source of
   that identifier: it must come from a cryptographically validated OIDC
   access token's claims (Entra ID is the first tested IdP; its `oid` claim
   is stable across applications — a prerequisite the ADR-0003 amendment
   states as a deployment precondition, not guaranteed for every OIDC
   provider), never from a client request body, query string, or any other
   caller-supplied input. A correct tenant check (#3) does not by itself
   satisfy this — the whole scheme rests on the Gateway getting the
   identifier right, not on ServiceNow verifying it. The abstraction changes
   the name of the claim, not the trust boundary. See
   `docs/adr/0003-identity-resolution-oauth-client-credentials.md` and
   `docs/threat-model.md` §1.6.
9. The repository contains technical decisions and technical rationale
   only. Commercial context — organisation names, vendor alignment, customer
   names, budgets, sales considerations, market perception — is either
   rewritten as a neutral technical constraint or removed. A technical
   rationale must survive being read by someone with no knowledge of who is
   building this.

## Repository layout (monorepo)
```
/client        .NET 8, WPF, WebView2 host, authentication behind an
               `IIdentityProvider` abstraction (ADR-0001; MSAL.NET is the
               current implementation, see ADR-0001 "Implementation
               notes"). Transparent borderless always-on-top window, tray
               icon, drag/edge-snap, Live2D Web SDK rendered inside
               WebView2 (TypeScript, Vite). No business logic here.
/gateway       ASP.NET Core 8 minimal API + SignalR. OIDC multi-tenant auth
               (Entra ID is the first tested IdP). EF Core only — no raw SQL,
               no provider-specific types (ADR-0006); PostgreSQL primary, SQL
               Server secondary in the CI provider matrix; hosting target
               otherwise undecided. Outbox poller (BackgroundService).
               Domain packs as separate class-library projects.
               `IContextProvider` abstraction (ADR-0007) with a local stub
               implementation; the real provider is an external system,
               integrated later.
/snow-app      ServiceNow scoped app `x_<prefix>_buddy` (ADR-0002), built with
               the ServiceNow SDK (Fluent) so it is source-controlled and
               CI-deployable: tables companion_policy, companion_outbox,
               companion_user_map; Business Rules on concrete task-derived
               tables (never on `task` itself — non-negotiable #7) calling a
               shared, domain-agnostic Script Include; Scripted REST API
               /events (subject-based, watermark-paged), /ack, /context (the
               data-egress contract — ADR-0007 §"/context stays"); integration
               role.
/deploy/reference  Evidence that a deployment path works: Dockerfile(s), a
               compose file, a one-page runbook. Not an architectural
               commitment — any container host can consume the same image.
               See ADR-0006. Replaces /infra (deleted; it held only
               speculative IaC framing, nothing built).
/installer     MSIX/MSI via WiX, code-signed, silent install, ADMX policy
               template for enforced settings, deployable through a
               centrally managed deployment vehicle (Intune is one example
               — see Definition of Done Table B, "Managed enterprise
               deployment").
/docs          ADRs (docs/adr/NNNN-*.md), threat model, Definition of Done
               (docs/definition-of-done.md — audit evidence must be
               exportable in tabular form), ServiceNow version compatibility
               matrix.
```

## Phase plan — complete phases in order, do not skip ahead
- **Phase 0 — Skeleton**: repo, CI (GitHub Actions: build, test, lint for all
  three stacks), ADR-0001 (this architecture), threat model v0.
- **Phase 1 — Scoped App**: tables, BRs, Scripted REST, role, ATF tests.
  Deploy to a PDI. Deliver a Postman/HTTP-file collection proving the API.
- **Phase 2 — Gateway core**: OIDC auth (Entra ID first tested), tenant model,
  outbox poller, policy engine, SignalR push, audit log. Integration tests
  with a fake SN server.
- **Phase 3 — Client MVP**: window, tray, drag/snap, Live2D idle + 3 emotional
  states (idle / attention / urgent), notification bubble, click-through to SN.
  **Policy delivery channel is a Phase 3 design decision, not a later one**:
  local policy registry path + server-side policy, enforced local values win
  on conflict (Definition of Done A12).
- **Phase 4 — ITSM pack**: incident assignment, SLA notification, approval
  pending, change window start. Emotion mapping rules in config, not code.
  SLA trigger design: see `docs/adr/0005-sla-threshold-detection-strategy.md`
  (Proposed, not yet Accepted as of this writing).
- **Phase 5 — External context integration**: summarize-my-queue,
  summarize-this-record via `IContextProvider` (ADR-0007), on-demand only,
  tenant-gated, a degraded/slow provider must never block event delivery, no
  record content in logs.
- **Phase 6 — Definition of Done**: see `docs/definition-of-done.md` for the
  full acceptance criteria (technical acceptance, the self-use record,
  deferred-verification items, known unknowns). Supersedes the previous
  "Enterprise hardening" checklist — MSIX signing, ADMX, and telemetry are
  Table A/B items there (A9, Table B) now, not a standalone phase checklist.

## Engineering standards
- Tests are required: xUnit (gateway/client logic), Vitest (Live2D layer),
  ATF (scoped app). No PR without tests for behavior it adds.
- Structured logging (Serilog) with tenant_id and correlation_id; never log
  record fields.
- Every architectural decision → ADR. Every external dependency → note the
  license in docs/licenses.md (Live2D Cubism SDK license terms must be reviewed
  before Phase 3).
- Config over code for anything a tenant admin might want to change.
- Before starting a phase, produce a short plan and list open questions for me.
  Ask before: choosing a database, adding a paid dependency, changing the
  security model, or anything touching authentication.

## Definition of Done
See `docs/definition-of-done.md` for the full, verifiable acceptance criteria
(Table A: technical acceptance; the A11 self-use record; Table B: deferred
verification; known unknowns that must never be written as met). This
replaces the earlier "v1.0 (sellable)" checklist — hosting, IdP, and
AI-provider specifics in the old list are superseded by ADR-0006, the
ADR-0003 amendment, and ADR-0007 respectively; commercial framing removed
per non-negotiable #9.
