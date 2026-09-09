# ADR-0003: Identity Resolution Under OAuth Client Credentials

- Status: Accepted — corrects a mistaken assumption in `CLAUDE.md`
  non-negotiable #8 as originally written. **Amended 2026-09-10** — see
  "Amendment: OIDC generalization" below. The original decision (2026-09-09)
  is left as written; the amendment supersedes its Entra-specific wording
  without changing the trust boundary it establishes.
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

## Amendment (2026-09-10): OIDC generalization

The original decision above is written in terms of Entra and its `oid`
claim, matching ADR-0001's original single-IdP assumption. ADR-0006
generalizes hosting; this amendment generalizes identity provider choice
the same way, **without weakening the cross-user isolation defence this
ADR exists to establish.**

1. **`companion_user_map`'s key becomes the composite `(idp_issuer,
   idp_subject)`, unique on the pair.** A subject alone is not a key — the
   same subject value could in principle be issued by different issuers
   with different meanings, and treating a bare subject as globally unique
   would silently reintroduce a cross-tenant confusion risk this project
   has already had to correct once (threat 2.1). The table's two original
   columns (`sys_user` reference, subject identifier) are unchanged in
   spirit; only the subject side gains the issuer as a required companion
   field.
2. **Deployment precondition, stated plainly, not silently degraded
   around**: the IdP must issue a subject claim that is stable across
   applications for the same human. Entra ID's `oid` claim satisfies this.
   A plain OIDC `sub` claim is not guaranteed to — many OIDC providers
   issue **pairwise** subjects, a different value per client application
   for the same underlying user, by design (it's a privacy feature at the
   IdP layer, not a bug). **If the deployed IdP cannot guarantee a stable,
   cross-application subject, this product cannot correctly resolve
   identity under this design — that must be said plainly during
   integration/onboarding with a new IdP, not discovered later as silently
   broken mappings.** No fallback or best-effort behavior is specified for
   a pairwise-subject IdP; building one is future work if it's ever needed,
   not assumed here.
3. **The abstraction changes the name of the claim, not the trust
   boundary.** Everything non-negotiable #8 and this ADR's original
   decision established is unchanged: server-side reverse lookup only; the
   Scripted REST API never accepts a caller-supplied user identifier as a
   filter, only the IdP-issuer-scoped subject the Gateway derived from a
   validated token; 403 — never an empty result — when the subject has no
   map entry. Generalizing the claim's name from "Entra OID" to "OIDC
   `(issuer, subject)`" is a terminology and schema change, not a relaxation
   of any of these rules.
