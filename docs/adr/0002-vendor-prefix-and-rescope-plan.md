# ADR-0002: Temporary Vendor Prefix and Re-Scope Plan

- Status: Accepted (the decision to proceed on a personal prefix now, and
  the containment/migration rules below) — **but see "Trigger for
  migration," reopened 2026-09-10.** Under non-negotiable #9's audit ("an
  ADR whose only reason was commercial should be reopened, not repainted"),
  the original trigger condition for this ADR was commercial ("before any
  real customer onboarding," "do not ship v1.0"), not technical. That
  section is corrected below rather than reworded into technical-sounding
  language it doesn't actually have. The rest of this ADR — accepting the
  personal prefix, the containment rule, the blast-radius plan — stands on
  its own technical merit (the prefix is immutable and Phase 1 needs to
  start) and needed no correction.
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

## Trigger for migration — reopened, not answered here

The original trigger condition ("before any real customer onboarding," "do
not ship v1.0 against a personal-account prefix") was commercial, not
technical — there is no technical event that fires "a company prefix has
been registered." Stripped of that framing, **this ADR does not currently
have a technical trigger for the re-scope**, and this document will not
invent one to fill the gap (non-negotiable #9). What's actually known,
technically:

- The re-scope must happen before this project's scoped app is deployed
  to any ServiceNow instance other than the developer's own personal PDI
  — reusing a personal-account scope name against a second party's
  instance is the actual technical constraint, independent of any
  commercial framing of who that second party is or why.
- Until that happens, the blast-radius plan above is the entire cost of
  staying on `x_1821654_buddy` — which is bounded and known, not urgent to
  resolve on its own.

Whoever owns this project's roadmap decides when a company-registered
prefix is worth acquiring; this ADR only guarantees that whenever that
happens, the migration is a scheduled, checklist-driven event rather than
emergency surgery.

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
