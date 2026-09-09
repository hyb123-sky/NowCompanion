# ADR-0002: Temporary Vendor Prefix and Re-Scope Plan

- Status: Accepted. **Closed 2026-09-11** — see "Trigger for migration."
  On 2026-09-10, non-negotiable #9's audit found the original trigger
  condition ("before any real customer onboarding," "do not ship v1.0")
  was commercial, not technical, and this ADR was reopened rather than
  repainted rather than left with an invented substitute. The correct
  technical trigger turned out to already be implicit in this ADR's own
  content (see below) — it just hadn't been stated as the trigger. Once
  stated plainly, the trigger holds on technical grounds alone, so this
  ADR is closed again, not left open-ended.
- Date: 2026-09-08

## Context

ServiceNow scoped application names are prefixed with a vendor prefix that is
**immutable once the scope is created and used** — changing it means creating
a new scoped application, not renaming the existing one. NowCompanion's
company vendor prefix is not yet registered. A prefix is available now,
`x_1821654_buddy`, but it belongs to the developer's **personal**
ServiceNow Developer Program account, on the personal PDI `dev310526`, not to
the company. Development needs to start now (Phase 1), so this ADR accepts
the personal prefix as a starting point and fixes the containment and
migration rules so the debt is paid down deliberately rather than discovered
later as hardcoded strings scattered through the codebase.

## Decision

1. The literal string `x_1821654_buddy` (and its bare prefix
   `x_1821654_`) may appear in exactly one **source/config** file:
   `snow-app/now.config.json`. It must not be hardcoded anywhere else in
   `/snow-app`, `/gateway`, `/client`, `/deploy`, `/installer`, or tests.
   `/docs` is exempt from this rule — an ADR that can't name the debt it's
   describing is useless — as is the one line in the CI guard below whose job
   is to detect the literal.
2. The Gateway resolves the ServiceNow scoped-app API path prefix from
   configuration only, at the key `ServiceNow:ScopePrefix` (appsettings /
   environment variable / `ISecretSource` reference depending on
   environment — see ADR-0006). No compile-time constant, no string
   literal fallback.
3. A CI job (`guard-vendor-prefix`, see `.github/workflows/`) fails the build
   if the literal prefix is found anywhere in the tree except
   `snow-app/now.config.json` and the guard's own detection line — scoped to
   `/snow-app`, `/gateway`, `/client`, `/deploy`, `/installer`, and CI workflow
   files, excluding `/docs`. This makes the rule enforced, not aspirational.
4. Any deployment/runbook doc outside `/docs/adr` refers to the prefix as
   "the tenant's configured scope prefix," never hardcodes it — the ADR and
   threat model are the sanctioned exception, not a precedent for scattering
   it elsewhere.

## Scope name — final decision

`x_1821654_buddy` (15 characters). Rejected `x_1821654_comp`: "comp" is
ambiguous in a ServiceNow context (compliance / component / compensation),
and a `packs/rc` compliance pack is planned — a name that reads as
"compliance" would be actively misleading. "buddy" is unambiguous and
matches the product's actual framing (a companion/buddy character).

The suffix (`buddy`, after `x_1821654_`) is constrained to **5 characters or
fewer**, independent of any single SDK's length limit. Reason: when the
re-scope in this ADR happens, the new scope is `x_<company-prefix>_buddy` —
and the company's future vendor prefix length is unknown today. Keeping the
suffix short leaves headroom under whatever length limit applies to the
combined name, so the re-scope isn't blocked by a suffix that was fine under
one prefix and too long under another.

**Open task for Phase 1:** the SDK's own JSON schema caps `scope` at 18
characters, but that may not be the ServiceNow platform's actual limit (SDK
tooling constraints and platform constraints aren't guaranteed to match).
Once connected to the PDI (`dev310526`), empirically verify the platform's
real scope-name length limit during scoped-app creation and record the
measured value in `snow-app/README.md` and here — don't assume the SDK's 18
is authoritative.

The display label (`name` in `now.config.json`) stays "NowCompanion" — the
constraint above is on the immutable `scope` field only, not the
human-readable name.

## Blast radius of a future re-scope

Because scope names are immutable, migrating to a company-registered prefix
is **not a rename**. It requires:

- Creating a brand-new scoped application (`x_<company>_buddy`, suffix ≤ 5
  chars per the decision above) in the
  target instance(s), including re-running the SDK deploy for all tables,
  Business Rules, the Scripted REST API, and the integration role.
- A data migration for any existing `companion_policy` / `companion_outbox`
  records if a customer has already onboarded under the old scope (only a
  risk once a real customer, not the personal PDI, is live).
- A coordinated, simultaneous config change: `snow-app/now.config.json`'s
  scope name **and** every tenant's `ServiceNow:ScopePrefix` Gateway
  configuration, per environment. These cannot be rolled out independently
  without breaking the API path for the affected tenant.
- Re-running ATF tests and the Postman/HTTP-file collection (Phase 1
  deliverable) against the new scope before it replaces the old one.

## Trigger for migration

**Migration is required before the app is installed on any instance not
controlled by the holder of the vendor prefix.**

This is purely technical: scope names are unique per instance. A prefix
derived from one developer's personal account may already be occupied by
something unrelated on a third-party instance, and this project has no
claim to that namespace there regardless — the prefix was never
"reserved" anywhere beyond the personal account it was issued to. No
commercial framing (who the third party is, why they're onboarding, any
notion of "customer") is needed to state this; it holds for literally any
instance this project's holder doesn't control.

The blast-radius plan above is the entire cost of staying on
`x_1821654_buddy` until that trigger fires — bounded and known, not urgent
to resolve while the only instance in use is the personal PDI itself.

## Risk while the debt is outstanding

The target PDI (`dev310526`) is tied to a personal ServiceNow Developer
Program account, not a company-owned asset. Personal Developer Program
instances are subject to reclamation/expiry independent of this project's
timeline. Since non-negotiable #1 requires the scoped app to be "fully
reproducible from source via the SDK," this risk is mitigated (a reclaimed
PDI can be replaced by deploying the source-controlled scoped app to a new
instance) but the *scope name itself* would still need to migrate under this
ADR's plan if the replacement instance is not under the same personal account.

## Consequences

- One extra CI job (prefix guard) and one extra piece of Gateway
  configuration (`ServiceNow:ScopePrefix`) versus hardcoding — negligible
  cost, and it is the only thing standing between "temporary debt" and
  "permanent hidden coupling."
- The re-scope, when it happens, is a scheduled migration with a known
  checklist (this ADR), not emergency surgery.
