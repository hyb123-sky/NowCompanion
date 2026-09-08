# Threat Model v0

- Status: Draft — v0, reviewed at the end of each phase, must show zero open
  Critical/High items before v1.0 (Definition of Done).
- Method: STRIDE per trust boundary.

## Trust boundaries

1. **Client ↔ Gateway** — WPF app (untrusted endpoint, runs on end-user
   hardware) to the Gateway API/SignalR hub.
2. **Gateway ↔ Entra ID** — token issuance and validation for a
   multi-tenant app registration.
3. **Gateway ↔ ServiceNow** — Gateway calling each tenant's scoped-app
   Scripted REST API.
4. **Gateway ↔ AI Provider** — Gateway calling Azure OpenAI (Japan East) or,
   behind the same interface, Anthropic.

---

## Boundary 1: Client ↔ Gateway

| # | Threat (STRIDE) | Description | Mitigation | Severity |
|---|---|---|---|---|
| 1.1 | Spoofing | Malware on the user's machine impersonates the client to the Gateway | Client authenticates to Gateway with an Entra-issued token (MSAL, delegated user token); Gateway validates issuer/audience/signature per request | Medium |
| 1.2 | Tampering | Client-side modification of displayed data to mislead the user | Out of scope for v1 (local machine compromise is a broader OS-security problem); logged/audited server-side actions are unaffected | Low |
| 1.3 | Information Disclosure | Business data (record content) persisted to disk and later exfiltrated from the endpoint | Non-negotiable #2: client is in-memory only, zero business data on disk; verified by code review + no local DB/cache file in `/client` | High → mitigated |
| 1.4 | Information Disclosure | Record content leaked into client-side logs | Structured logging with allowlisted fields only (ids, correlation_id), never raw record payloads | Medium → mitigated |
| 1.5 | Denial of Service | Malicious or buggy client floods the Gateway/SignalR hub | Rate limiting per authenticated user at the Gateway; SignalR connection caps | Medium |

## Boundary 2: Gateway ↔ Entra ID

| # | Threat (STRIDE) | Description | Mitigation | Severity |
|---|---|---|---|---|
| 2.1 | **Spoofing / Elevation of Privilege** | **Cross-tenant token acceptance.** With a single multi-tenant App Registration, *any* Entra tenant on earth (not just onboarded customers) can obtain a validly-signed token for this app. If the Gateway trusts the token's `tid` claim as-is to select tenant data, an attacker from an uninvited Entra tenant gains access to another tenant's data path merely by being issued a token — a direct violation of non-negotiable #3. | Token validation must (a) verify standard signature/issuer/audience, **and** (b) check the token's `tid` against an allowlist of tenants that have completed admin consent and have a provisioned `tenant_id` row in the Gateway's tenant table. Reject any `tid` not in that allowlist before any data-access code runs. This check lives in the same middleware/data-access layer as tenant scoping (non-negotiable #3), not as a separate optional filter. | **Critical** — open until Phase 2 middleware implements the allowlist check; must close before any multi-tenant pilot. |
| 2.2 | Tampering | Token replay after tenant offboarding (revoked consent, deleted tenant) | Short token lifetimes + allowlist check (2.1) re-evaluated per request, not cached indefinitely | Medium |
| 2.3 | Repudiation | No audit trail of which tenant/user triggered an action | Every Gateway action logged with `tenant_id` + `correlation_id` (Serilog), append-only audit log per non-negotiable audit requirement | Low → mitigated by design |

## Boundary 3: Gateway ↔ ServiceNow

| # | Threat (STRIDE) | Description | Mitigation | Severity |
|---|---|---|---|---|
| 3.1 | Spoofing | Gateway's OAuth client credentials for a tenant's scoped app are stolen and used outside the Gateway | Client secret stored in Key Vault only (non-negotiable #6), never in code/config files; per-tenant secret, rotated on a defined schedule; scoped-app integration role is least-privilege (no write access beyond what BRs require) | High |
| 3.2 | Elevation of Privilege | Gateway (or a compromised dependency) bypasses the scoped Scripted REST API and calls base Table API directly with the integration credential | Integration role grants no direct table ACL beyond the scoped app's own tables/API; enforced at the ServiceNow ACL layer, not just by Gateway code discipline (non-negotiable #4) | High |
| 3.3 | Information Disclosure | Outbox/API payload includes fields the tenant's `companion_policy` disallows | Every payload passes the policy gate (allowed tables/fields/disclosure level) before leaving the Gateway (non-negotiable #5) — single chokepoint, not per-caller filtering | High → mitigated by design |
| 3.4 | Repudiation / Availability | Scoped-app prefix (`x_1821654_companion`) is on a personal Developer Program PDI subject to reclamation | See ADR-0002: scoped app must remain fully reproducible from source so a reclaimed PDI can be redeployed elsewhere; the scope-name migration itself is a planned, documented process | Medium (tracked debt, not accepted forever) |

## Boundary 4: Gateway ↔ AI Provider

| # | Threat (STRIDE) | Description | Mitigation | Severity |
|---|---|---|---|---|
| 4.1 | Information Disclosure | Record content sent to an AI provider outside the tenant's approved data-residency/processing terms | Azure OpenAI deployment pinned to Japan East for data residency; the `companion_policy` AI on/off + disclosure-level gate sits upstream of any AI call, so a tenant that disables AI or restricts disclosure never has data reach the provider (non-negotiable #5 applies here too) | High |
| 4.2 | Information Disclosure | Prompt/response content logged verbatim, including record fields | Prompts are versioned files (`/gateway/Prompts`), but request/response bodies follow the same "never log record content" rule as all other logging | Medium |
| 4.3 | Tampering | Provider abstraction (`IAiProvider`) misconfigured to route a tenant's data to the wrong provider/region | Provider + region is part of tenant configuration, validated at startup and covered by an integration test per Phase 5 | Low (Phase 5 concern, tracked here for completeness) |

## Open items tracked to closure

- **2.1 (Critical)** — cross-tenant allowlist check — must land in Phase 2 before any tenant pilot; this is the single highest-severity item in v0.
- **3.1 (High)** — per-tenant secret rotation schedule — to be defined in Phase 2 as part of Key Vault design.
- **3.4 (Medium)** — vendor-prefix debt — tracked and planned in ADR-0002, not an open security gap by itself, but the trigger condition (company prefix registered) should not slip past v1.0 GA.

This document is revisited at the end of every phase; new boundaries (e.g.
installer/update channel in Phase 6) are added rather than replacing this v0.
