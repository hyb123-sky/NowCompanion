# ADR-0002: Temporary Vendor Prefix and Re-Scope Plan

- Status: Accepted (tracked as technical debt)
- Date: 2026-09-08

## Context

ServiceNow scoped application names are prefixed with a vendor prefix that is
**immutable once the scope is created and used** — changing it means creating
a new scoped application, not renaming the existing one. NowCompanion's
company vendor prefix is not yet registered. A prefix is available now,
`x_1821654_companion`, but it belongs to the developer's **personal**
ServiceNow Developer Program account, on the personal PDI `dev310526`, not to
the company. Development needs to start now (Phase 1), so this ADR accepts
the personal prefix as a starting point and fixes the containment and
migration rules so the debt is paid down deliberately rather than discovered
later as hardcoded strings scattered through the codebase.

## Decision

1. The literal string `x_1821654_companion` (and its bare prefix
   `x_1821654_`) may appear in exactly one **source/config** file:
   `snow-app/now.config.json`. It must not be hardcoded anywhere else in
   `/snow-app`, `/gateway`, `/client`, `/infra`, `/installer`, or tests.
   `/docs` is exempt from this rule — an ADR that can't name the debt it's
   describing is useless — as is the one line in the CI guard below whose job
   is to detect the literal.
2. The Gateway resolves the ServiceNow scoped-app API path prefix from
   configuration only, at the key `ServiceNow:ScopePrefix` (appsettings /
   environment variable / Key Vault reference depending on environment).
   No compile-time constant, no string literal fallback.
3. A CI job (`guard-vendor-prefix`, see `.github/workflows/`) fails the build
   if the literal prefix is found anywhere in the tree except
   `snow-app/now.config.json` and the guard's own detection line — scoped to
   `/snow-app`, `/gateway`, `/client`, `/infra`, `/installer`, and CI workflow
   files, excluding `/docs`. This makes the rule enforced, not aspirational.
4. Any deployment/runbook doc outside `/docs/adr` refers to the prefix as
   "the tenant's configured scope prefix," never hardcodes it — the ADR and
   threat model are the sanctioned exception, not a precedent for scattering
   it elsewhere.

## Blast radius of a future re-scope

Because scope names are immutable, migrating to a company-registered prefix
is **not a rename**. It requires:

- Creating a brand-new scoped application (`x_<company>_companion`) in the
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

Migrate off `x_1821654_companion` when the company's own ServiceNow vendor
prefix is registered — before any real customer (i.e., non-personal-PDI)
onboarding. Do not ship v1.0 against a personal-account prefix.

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
