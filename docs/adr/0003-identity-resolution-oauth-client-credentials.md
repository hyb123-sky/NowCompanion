# ADR-0003: Identity Resolution Under OAuth Client Credentials

- Status: Accepted — corrects a mistaken assumption in `CLAUDE.md`
  non-negotiable #8 as originally written.
- Date: 2026-09-09

## Context

Non-negotiable #8 (added alongside threat-model §1.6, cross-user leakage
within a tenant) originally said: "the Scripted REST API resolves the
requesting identity from the authenticated session/token." That is
impossible given ADR-0001's decision (#4) to authenticate Gateway →
ServiceNow with **OAuth 2.0 Client Credentials**: under that grant type,
every request the Gateway makes arrives at ServiceNow as the single
integration service account. There is no per-end-user session or token at
the ServiceNow layer to resolve an identity from — ServiceNow cannot
distinguish "the Gateway acting on behalf of user A" from "the Gateway
acting on behalf of user B" by session alone, because there is one shared
session (the service account's) for all of it.

The original wording assumed a per-user delegated credential (e.g. OAuth
JWT bearer with subject claims, or per-user session), which was explicitly
rejected in favor of client credentials during Phase 0 planning. This ADR
reconciles non-negotiable #8 with the auth model actually chosen.

## Decision

1. **New table `companion_user_map`**: `sys_user` reference ↔ Entra object
   ID (OID) string, unique on both columns (one SN user maps to at most one
   OID and vice versa).
2. **The Scripted REST API accepts an Entra OID as a request parameter, never
   a ServiceNow sys_id.** It resolves OID → `sys_user` via
   `companion_user_map`, server-side, and filters `companion_outbox` strictly
   on the resolved user. If the OID has no map entry, the endpoint returns
   **403**, not an empty result set — an empty result for an unmapped OID
   would look identical to "no events right now" and hide a real
   misconfiguration (a user who should be mapped and isn't).
3. **The Gateway is the sole source of the OID value**, and it is only ever
   allowed to come from one place: the claims of a cryptographically
   validated Entra access token (the same token validation already required
   by non-negotiable #3 / threat 2.1's tenant allowlist check). The OID must
   never be accepted from a client request body, query string, or any other
   caller-supplied input at the Gateway's own API surface either — if a
   compromised or buggy client could inject an arbitrary OID into what the
   Gateway forwards to ServiceNow, this whole scheme collapses.
4. **Consequence for the trust boundary**: because ServiceNow has no way to
   independently verify that the OID it receives actually corresponds to the
   caller (it only ever sees the trusted integration account), ServiceNow's
   role in this design is *mechanical resolution and 403-on-unmapped*, not
   *identity verification*. The actual security property — that user A never
   receives user B's events — depends entirely on the Gateway correctly
   validating the Entra token and never letting a wrong or attacker-supplied
   OID reach the API call. This is a **Gateway obligation** (Phase 2), not
   something the scoped app (Phase 1) can enforce on its own.

## Non-negotiable #8 — corrected text

See `CLAUDE.md`. The corrected rule states the mapping-table mechanism, the
OID-not-sys_id contract, the 403-on-unmapped rule, and — critically — that
the Gateway's token-derived-OID discipline is what the whole scheme rests
on, not a ServiceNow-side identity check that cannot exist under this auth
model.

## Open question for Phase 2 (not resolved here)

How does `companion_user_map` get populated? Candidates: (a) synced during
tenant onboarding from Entra + ServiceNow user records via some matching
rule (email match, on-premises SID, etc.), (b) an admin-driven manual
mapping UI, (c) a claim embedded in the Entra token if the customer's IdP
config supports it. This ADR does not decide this — it only fixes the shape
of the table and the contract the REST API exposes against it. Phase 2 must
resolve population before this is usable end-to-end.

## Consequences

- Phase 1's ATF suite must prove the 403-on-unmapped-OID behavior and that a
  tampered/foreign OID cannot retrieve another user's outbox rows, given a
  correctly-populated map — this tests the scoped app's half of the
  contract. It cannot test the Gateway's token-validation half (no Gateway
  exists yet); that integration test is explicitly a Phase 2 deliverable
  (see `docs/threat-model.md` §1.6).
- `docs/threat-model.md` §1.6 is updated to describe this as two separate,
  partially-independent mitigations (SN-side mapping/403, Gateway-side token
  validation) rather than one mitigation, since the second is unbuilt and
  the first alone does not close the threat.
