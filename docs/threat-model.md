# Threat Model v0

- Status: Draft — v0, reviewed at the end of each phase, must show zero open
  Critical/High items before v1.0 (Definition of Done).
- Method: STRIDE per trust boundary.

## Trust boundaries

1. **Client ↔ Gateway** — WPF app (untrusted endpoint, runs on end-user
   hardware) to the Gateway API/SignalR hub.
2. **Gateway ↔ OIDC Identity Provider** — token issuance and validation for
   a multi-tenant app registration (Entra ID is the first tested IdP — see
   the ADR-0003 amendment for the generalization discipline).
3. **Gateway ↔ ServiceNow** — Gateway calling each tenant's scoped-app
   Scripted REST API.
4. **Gateway ↔ External Context Provider** — Gateway calling
   `IContextProvider` (ADR-0007); a local stub today, an external system
   later.

---

## Boundary 1: Client ↔ Gateway

| # | Threat (STRIDE) | Description | Mitigation | Severity |
|---|---|---|---|---|
| 1.1 | Spoofing | Malware on the user's machine impersonates the client to the Gateway | Client authenticates to Gateway with an OIDC-issued token via `IIdentityProvider` (ADR-0001; MSAL.NET is the current implementation — see ADR-0001 "Implementation notes"); delegated user token; Gateway validates issuer/audience/signature per request | Medium |
| 1.2 | Tampering | Client-side modification of displayed data to mislead the user | Out of scope for v1 (local machine compromise is a broader OS-security problem); logged/audited server-side actions are unaffected | Low |
| 1.3 | Information Disclosure | Business data (record content) persisted to disk and later exfiltrated from the endpoint | Non-negotiable #2: client is in-memory only, zero business data on disk | High — mitigated by design, unverified until the Phase 3 client exists and is code-reviewed against this rule |
| 1.4 | Information Disclosure | Record content leaked into client-side logs | Structured logging with allowlisted fields only (ids, correlation_id), never raw record payloads | Medium — mitigated by design, unverified until Phase 3 logging is implemented |
| 1.5 | Denial of Service | Malicious or buggy client floods the Gateway/SignalR hub | Rate limiting per authenticated user at the Gateway; SignalR connection caps | Medium — open, lands with the Phase 2 SignalR hub |
| 1.6 | **Information Disclosure / Elevation of Privilege** | **Cross-user leakage within the same tenant.** The product's premise is "items assigned to the *logged-in user*" — a correct `tid` check (2.1) stops cross-tenant access but says nothing about user A on tenant T receiving user B's notifications. A SignalR hub that groups connections by tenant alone, or an outbox watermark keyed per-tenant instead of per-tenant-per-user, would leak across users within the same customer. **Promoted to `CLAUDE.md` non-negotiable #8** — no longer just a tracked risk, a required design constraint. Corrected in ADR-0003: ServiceNow cannot itself verify identity under OAuth Client Credentials (it only ever sees the integration service account), so this is **two separate, partially-independent mitigations**, not one. | **SN-side (Phase 1, scoped-app-only):** the Scripted REST API accepts an IdP subject identifier — the composite `(idp_issuer, idp_subject)`, per the ADR-0003 amendment — never a sys_id, resolves it via `companion_user_map`, and returns 403 — not an empty result — when there's no map entry. This is mechanical resolution, not identity verification, and is testable by ATF on its own. **Gateway-side (Phase 2, the load-bearing half):** the Gateway must derive that identifier exclusively from a cryptographically validated OIDC access token's claims, never from client-supplied input; every SignalR connection and outbox read is scoped by that verified identifier, not just the tenant claim. An integration test must prove user A cannot receive user B's events even under a tampered request — but that test can only exist once the Gateway does. | **High** — the SN-side half can close in Phase 1 (ATF-provable in isolation); the Gateway-side half — the one that actually makes the SN-side check meaningful — stays open until Phase 2. Do not mark this threat closed on Phase 1's work alone. Must close before any multi-tenant pilot, alongside 2.1. |

## Boundary 2: Gateway ↔ OIDC Identity Provider

| # | Threat (STRIDE) | Description | Mitigation | Severity |
|---|---|---|---|---|
| 2.1 | **Spoofing / Elevation of Privilege** | **Cross-tenant token acceptance.** With a single multi-tenant app registration, *any* tenant of the IdP (not just onboarded customers — Entra ID as the first tested IdP, where "tenant of the IdP" means any Entra directory on earth) can obtain a validly-signed token for this app. If the Gateway trusts the token's tenant claim as-is to select tenant data, an attacker from an uninvited IdP tenant gains access to another tenant's data path merely by being issued a token — a direct violation of non-negotiable #3. | Token validation must (a) verify standard signature/issuer/audience, **and** (b) check the token's tenant claim (Entra's `tid`) against an allowlist of tenants that have completed admin consent and have a provisioned `tenant_id` row in the Gateway's tenant table. Reject any unlisted tenant claim before any data-access code runs. This check lives in the same middleware/data-access layer as tenant scoping (non-negotiable #3), not as a separate optional filter. | **Critical** — open until Phase 2 middleware implements the allowlist check; must close before any multi-tenant pilot. |
| 2.2 | Tampering | Token replay after tenant offboarding (revoked consent, deleted tenant) | Short token lifetimes + allowlist check (2.1) re-evaluated per request, not cached indefinitely | Medium |
| 2.3 | Repudiation | No audit trail of which tenant/user triggered an action | Every Gateway action logged with `tenant_id` + `correlation_id` (Serilog), append-only audit log per non-negotiable audit requirement | Low — mitigated by design, unverified until Phase 2's audit log exists |

## Boundary 3: Gateway ↔ ServiceNow

| # | Threat (STRIDE) | Description | Mitigation | Severity |
|---|---|---|---|---|
| 3.1 | Spoofing | Gateway's OAuth client credentials for a tenant's scoped app are stolen and used outside the Gateway | Client secret stored via `ISecretSource` only (non-negotiable #6, ADR-0006), never in code/config files; per-tenant secret, rotated on a defined schedule; scoped-app integration role is least-privilege (no write access beyond what BRs require) | High |
| 3.2 | Elevation of Privilege | Gateway (or a compromised dependency) bypasses the scoped Scripted REST API and calls base Table API directly with the integration credential | Integration role grants no direct table ACL beyond the scoped app's own tables/API; enforced at the ServiceNow ACL layer, not just by Gateway code discipline (non-negotiable #4) | High |
| 3.3 | Information Disclosure | Outbox/API payload includes fields the tenant's `companion_policy` disallows | Every payload passes the policy gate (allowed tables/fields/disclosure level) before leaving the Gateway (non-negotiable #5) — single chokepoint, not per-caller filtering | High — mitigated by design, unverified until the Phase 2 policy engine is implemented |
| 3.4 | Repudiation / Availability | Scoped-app prefix (`x_1821654_buddy`) is on a personal Developer Program PDI subject to reclamation | See ADR-0002: scoped app must remain fully reproducible from source so a reclaimed PDI can be redeployed elsewhere; the scope-name migration itself is a planned, documented process, gated on the technical trigger ADR-0002 now states (install on any instance not controlled by the prefix holder) | Medium (tracked debt, not accepted forever) |
| 3.5 | Spoofing | The dev-tooling auth pattern used against the personal PDI (`now-sdk auth --type basic`, the PDI's default admin account) gets carried over as a template for a real customer instance | Basic+admin is accepted **only** for this throwaway personal PDI, which has no OAuth application registry to configure against and holds no customer data. Every real customer instance uses OAuth 2.0 Client Credentials against a dedicated least-privilege integration role (non-negotiable #4, ADR-0001 decision #4) — never basic auth, never the admin role. `snow-app/README.md` states this distinction next to the PDI auth instructions so it isn't silently copied forward. | Low while only the personal PDI exists; would be High if ever copied into a customer-facing config — tracked here so it's named, not just assumed obvious. |

## Boundary 4: Gateway ↔ External Context Provider

| # | Threat (STRIDE) | Description | Mitigation | Severity |
|---|---|---|---|---|
| 4.1 | Information Disclosure | Record content sent to an external context provider beyond what the tenant's disclosure level permits | `companion_policy`'s `external_context_enabled` flag + disclosure-level gate sits upstream of every `IContextProvider` call (ADR-0007); the provider only ever receives the same disclosure-filtered payload `/context` already produces, never unfiltered record content | High |
| 4.2 | Information Disclosure | Context request/response content logged verbatim, including record fields | `IContextProvider` calls follow the same "never log record content" rule as all other logging — correlation id, provider id, and failure reason are logged, not payload content | Medium |
| 4.3 | Tampering / Denial of Service | A slow or unavailable external context provider blocks or delays event delivery | ADR-0007's integration contract requires a degraded/timed-out provider to never block event delivery — summarization is a separate, on-demand call, not on the notification path | Medium (was framed as a misconfiguration risk under the earlier AI-provider design; reframed under ADR-0007 as an availability/coupling risk instead) |

## Open items tracked to closure

- **2.1 (Critical)** — cross-tenant allowlist check — must land in Phase 2 before any tenant pilot; this is the single highest-severity item in v0.
- **1.6 (High)** — per-user hub/outbox scoping within a tenant. SN-side mapping/403 lands in Phase 1; the Gateway-side token-derived-OID discipline that makes it meaningful lands in Phase 2, alongside 2.1 — see ADR-0003. A correct tenant check alone does not close this, and neither does Phase 1's half on its own.
- **3.1 (High)** — per-tenant secret rotation schedule — to be defined in Phase 2 as part of the `ISecretSource` design (ADR-0006).
- **1.5 (Medium)** — Gateway/SignalR rate limiting — lands with the Phase 2 SignalR hub.
- **3.4 (Medium)** — vendor-prefix debt — tracked and planned in ADR-0002, not an open security gap by itself. Its migration trigger is closed and technical (ADR-0002: install on any instance not controlled by the prefix holder), not a "before v1.0" deadline.
- **1.3 / 1.4 / 3.3 / 2.3 ("mitigated by design")** — these describe controls that are architecturally decided but not yet built (no client, no policy engine, no audit log exist yet). Re-verify each against actual code at the end of the phase that implements it, and only then drop the "unverified" qualifier — a control marked closed against code that doesn't exist would undermine the audit evidence this document is meant to produce.

This document is revisited at the end of every phase; new boundaries (e.g.
the installer/update channel, once built) are added rather than replacing
this v0.
