# ADR-0004: Cross-Scope Access Tracking Mode

- Status: Proposed — recommendation stated, empirical verification (the
  probe-execution step below) not yet performed; do not treat as Accepted
  until that's done and this file is updated with the result.
- Date: 2026-09-09

## Context

The scoped app needs Business Rules on tables it doesn't own (`incident`,
`change_request` in the ITSM pack, `task_sla` for SLA detection —
non-negotiable #7's domain packs all live outside core scope tables).
ServiceNow gates this kind of cross-scope access via `sys_scope_privilege`
records and an app-level setting, **Runtime Access Tracking**, with three
modes:

- **None** (observed current state on the PDI): no privilege records are
  generated at all, regardless of what the app actually does at runtime.
- **Tracking**: privilege records are generated automatically as the app
  actually exercises cross-scope access, without blocking anything.
- **Enforcing**: only pre-declared, allowed privilege records are honored;
  undeclared cross-scope access is blocked at runtime.

An earlier working assumption — that an empty `sys_scope_privilege` table
meant no cross-scope privilege was needed — was wrong and is corrected here.
With tracking off, an empty table means only that nothing has been
*recorded*, not that nothing is *required*. Separately, the `incident`,
`change_request`, and `task_sla` tables were observed with "Allow
configuration" unchecked and "Can read/create/update" checked (Can delete
unchecked) — but this reflects **design-time** Studio access, not
**runtime** execution permission for a deployed, executing Business Rule.
Design-time creation (which was in fact done, as admin, via Studio) does
not prove the same code runs successfully once deployed. These are two
separate questions and this ADR does not conflate them again.

## What's actually needed to resolve this

Per the SDK's own Fluent API, cross-scope grants are declarable in source
(`@servicenow/sdk-core`'s `CrossScopePrivilege`, producing
`sys_scope_privilege` records directly) — this is not a runtime-only,
UI-only mechanism. That means the end state does not require permanently
running in Tracking mode and hoping the platform keeps recording correctly;
the actual cross-scope requirements can be captured once and declared
explicitly in Fluent, then enforced.

The sequence to get there:

1. Deploy the cross-scope BR probe (`snow-app/diagnostics/`, active and
   condition-gated rather than `active: false`, since an inert BR can never
   be observed executing).
2. Trigger it (an incident insert/update against the deployed instance).
3. Confirm it actually executes (not just deploys) — check for evidence
   distinct from "the BR record exists," e.g. a log entry or an intentional
   side effect during testing.
4. Set Runtime Access Tracking to **Tracking**, repeat steps 2–3, and diff
   `sys_scope_privilege` before/after. This is the actual, empirical list of
   privileges this scope requires.

**None of this has been executed yet.** It requires a live PDI session (see
`snow-app/README.md`'s workaround note) and is the next concrete task,
tracked here rather than assumed.

## Recommendation: Enforcing, with explicit `CrossScopePrivilege` declarations, before any external deployment

**Argument for:** an app running in None or Tracking mode gives an external
reviewer of this system no visible, auditable list of what it touches
outside its own scope — they'd have to take it on faith. **Enforcing**,
with every required privilege declared explicitly in Fluent source
(`CrossScopePrivilege` records, source-controlled, reviewable in a PR like
any other change), replaces that with "here is the exact, version-controlled
list, and the platform itself blocks anything not on it." Audit evidence
must be exportable in tabular form — this is what makes that possible for
cross-scope access specifically — and it costs nothing at runtime once the
correct set is known (Enforcing only blocks *undeclared* access — correctly
declared access is unaffected).

**Argument against / cost:** Enforcing is unforgiving of an incomplete
privilege list — if step 4 above misses a code path (e.g., a rarely-hit
branch that only touches a foreign-scope table under a specific condition),
that path silently breaks in production instead of failing loudly in dev.
This is a real risk if the discovery step (Tracking mode) isn't exercised
against realistic, varied test data before switching to Enforcing.

**Net recommendation:** stay in **Tracking** through the rest of Phase 1
while the real BR/Script Include surface is being built (PR-3, PR-4) and
exercised by ATF against varied scenarios, then switch to **Enforcing**
with the full, ATF-validated `CrossScopePrivilege` set as a Phase 1
exit criterion — not later, and not left at Tracking for v1.0 GA.

## What would change this recommendation

If the Phase 1 probe-execution step (above) shows that cross-scope Business
Rule creation is blocked outright regardless of tracking mode (i.e., Studio
allowed creating the record but the platform refuses to let it *execute*
against a foreign-scope table under this app's own access grant), the whole
premise changes: the ITSM pack's BR-on-concrete-table design (non-negotiable
#7, this ADR's context) would need Flow Designer event subscription, a
global-scope shim, or `sys_trigger`-based polling instead — see the options
CLAUDE.md's Phase 1 planning already flagged. That would make this ADR moot
in its current form and require a rewrite, not an amendment.
