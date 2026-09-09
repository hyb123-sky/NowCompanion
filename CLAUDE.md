# Project: NowCompanion — Enterprise Desktop Companion for ServiceNow

## Mission
Build a **production-grade, sellable** B2B product, not a prototype. A Windows desktop
companion (Live2D character) that surfaces ServiceNow work items assigned to the
logged-in user — SLA breaches, approvals, assignments, change windows — with
optional AI summaries. The character is the UI; the product is an enterprise
notification/assistant agent with a full admin and compliance surface.

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
   convention. Every query is scoped by tenant_id from the validated Entra token.
4. All ServiceNow access goes through the scoped app's Scripted REST API with a
   dedicated least-privilege role. No direct Table API on base tables.
5. Every notification passes through the tenant's `companion_policy` before it
   reaches a client (allowed tables, allowed fields, disclosure level, AI on/off).
6. Secrets from configuration/Key Vault only. Never in code, never in tests.
7. Domain-agnostic core: the engine consumes the `task` hierarchy and
   `sysapproval_approver`. ITSM is a **Domain Pack** (`packs/itsm`), not the core.
   Design so `packs/hr` and `packs/rc` can be added without touching core.
8. Cross-user isolation within a tenant is enforced server-side, not by a
   client- or gateway-supplied identity parameter. Every `companion_outbox`
   row carries the target user's sys_id; the Scripted REST API resolves the
   requesting identity from the authenticated session/token, never from a
   caller-supplied filter; the Gateway independently verifies the Entra
   identity → ServiceNow user mapping before pushing any event to a client
   connection. A correct tenant check (#3) does not by itself satisfy this —
   see `docs/threat-model.md` §1.6.

## Repository layout (monorepo)
```
/client        .NET 8, WPF, WebView2 host, MSAL.NET. Transparent borderless
               always-on-top window, tray icon, drag/edge-snap, Live2D Web SDK
               rendered inside WebView2 (TypeScript, Vite). No business logic here.
/gateway       ASP.NET Core 8 minimal API + SignalR. Entra ID multi-tenant auth.
               EF Core + Azure SQL (or PostgreSQL). Outbox poller (BackgroundService).
               Domain packs as separate class-library projects.
               AI provider abstraction (Azure OpenAI / Anthropic) behind an interface;
               prompts live in /gateway/Prompts as versioned files.
/snow-app      ServiceNow scoped app `x_<prefix>_companion`, built with the
               ServiceNow SDK (Fluent) so it is source-controlled and CI-deployable:
               tables companion_policy, companion_outbox; Business Rules on task
               and sysapproval_approver writing to outbox; Scripted REST API
               /events (watermark-paged), /ack, /context; integration role.
/infra         Bicep for Azure Container Apps, Key Vault, SQL, App Insights.
/installer     MSIX/MSI via WiX, code-signed, Intune-ready, silent install,
               ADMX policy template for enforced settings.
/docs          ADRs (docs/adr/NNNN-*.md), threat model, security questionnaire
               answers (JP セキュリティチェックシート format), ServiceNow version
               compatibility matrix.
```

## Phase plan — complete phases in order, do not skip ahead
- **Phase 0 — Skeleton**: repo, CI (GitHub Actions: build, test, lint for all
  three stacks), ADR-0001 (this architecture), threat model v0.
- **Phase 1 — Scoped App**: tables, BRs, Scripted REST, role, ATF tests.
  Deploy to a PDI. Deliver a Postman/HTTP-file collection proving the API.
- **Phase 2 — Gateway core**: Entra auth, tenant model, outbox poller,
  policy engine, SignalR push, audit log. Integration tests with a fake SN server.
- **Phase 3 — Client MVP**: window, tray, drag/snap, Live2D idle + 3 emotional
  states (idle / attention / urgent), notification bubble, click-through to SN.
- **Phase 4 — ITSM pack**: incident assignment, SLA at 80% / breach, approval
  pending, change window start. Emotion mapping rules in config, not code.
- **Phase 5 — AI**: summarize-my-queue, summarize-this-record, on-demand only,
  tenant-gated, prompts versioned, no record content in logs.
- **Phase 6 — Enterprise hardening**: MSIX signing, Intune deployment doc,
  ADMX policies, privacy-mode hotkey + auto-hide heuristics, App Insights
  telemetry with opt-out, upgrade compatibility check against two SN releases.

## Engineering standards
- Tests are required: xUnit (gateway/client logic), Vitest (Live2D layer),
  ATF (scoped app). No PR without tests for behavior it adds.
- Structured logging (Serilog) with tenant_id and correlation_id; never log
  record fields.
- Every architectural decision → ADR. Every external dependency → note the
  license in docs/licenses.md (Live2D Cubism SDK license terms must be reviewed
  before Phase 3).
- Config over code for anything a customer admin might want to change.
- Before starting a phase, produce a short plan and list open questions for me.
  Ask before: choosing a database, adding a paid dependency, changing the
  security model, or anything touching authentication.

## Definition of done for v1.0 (sellable)
- Deploys to a fresh Azure subscription via /infra in one command.
- Scoped app installs on a clean instance via update set or SDK deploy.
- Client installs silently through Intune on a domain-joined machine and
  signs in with Entra SSO without user configuration.
- Admin can restrict disclosure level and disable AI per tenant.
- Security questionnaire in /docs is fully answered with references to code.
- Passes a self-run threat-model review with no open Critical/High items.
