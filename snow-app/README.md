# snow-app

ServiceNow scoped application, source-controlled and CI-deployable via the
ServiceNow SDK (Fluent). Phase 1 adds:

- Tables: `companion_policy`, `companion_outbox`, `companion_user_map`
  (Entra OID ↔ `sys_user`, see
  `docs/adr/0003-identity-resolution-oauth-client-credentials.md`)
- Business Rules on concrete tables (e.g. `incident`, `change_request`) in
  the ITSM domain pack — never on `task` directly — each calling a shared,
  domain-agnostic Script Include in this scope
- Scripted REST API: `/events` (OID-based, watermark-paged), `/ack`,
  `/context`
- A dedicated least-privilege integration role
- ATF tests, version-tolerant across the N/N-1 matrix — see
  `docs/servicenow-compatibility.md`

**Scope prefix policy:** the scope prefix in `now.config.json` is temporary,
personal-account debt — see `docs/adr/0002-vendor-prefix-and-rescope-plan.md`.
It must not be hardcoded anywhere outside `now.config.json`; CI enforces this
(`.github/workflows/guard-vendor-prefix.yml`).

**PDI identity policy:** the target instance's hostname and the local
credential alias used to deploy to it must never be hardcoded in this
project's source, config, or CI files — only in `docs/`. CI enforces this
(`.github/workflows/guard-pdi-hygiene.yml`). Credentials themselves are never
committed anywhere, by construction: they live only in Windows Credential
Manager via `now-sdk auth`, which this project never bypasses.

**Auth is basic+admin on the personal PDI only, and that is not a pattern.**
A ServiceNow Developer Program PDI has no OAuth application registry to
configure against, so `now-sdk auth --type basic` with the PDI's default
admin account is the pragmatic choice for this throwaway dev instance —
acceptable *here and only here*. It must never be the template for a real
customer instance: those are OAuth 2.0 Client Credentials against a
dedicated least-privilege integration role, per `CLAUDE.md` non-negotiable
#4 and ADR-0001 decision #4. See `docs/threat-model.md` boundary 3.

**`now.config.json` needs a real `scopeId` before `now-sdk build` will run at
all** — confirmed by actually running the build locally (`error: requires
property "scopeId"`), not assumed. This isn't optional metadata; the build
command validates the whole config up front. A `scopeId` is a real
ServiceNow-assigned identifier obtained via an authenticated call
(`now-sdk`'s own `init` flow calls `generateAppSysId(...)` against the
instance) — it cannot be fabricated locally. Until that authenticated step
has run once against the PDI, this project cannot build, only lint.

Local SDK commands (always the pinned local version, never a possibly-newer
one `npx` might resolve from outside this directory):
```
npm run auth -- --add <pdi-host> --type basic --alias <alias>   # interactive, run once, from this directory
npm run build                                                    # no auth needed - fails until scopeId exists
npm run deploy -- --auth <alias>                                 # aliases to `now-sdk install`
```

`src/fluent/index.now.ts` currently contains one **inert, deploy-time-only
probe** — a disabled Business Rule declared against the global-scope
`incident` table — used to empirically confirm whether this scope is
permitted to create Business Rules there before PR-4 commits the ITSM pack
to that design. It is replaced once that finding is recorded (see
`docs/servicenow-compatibility.md`).

**Scope name length limit:** the SDK's own validation function
(`@servicenow/sdk-project`'s `validateScopeName`) cites ServiceNow's actual
platform source (`ScopeNameUtil.java`) in a comment as the origin of its
18-character cap — meaning this is very likely the real platform limit, not
just an SDK-side guess, though it should still be confirmed by an actual
successful deploy rather than taken purely on the comment's word. The
current scope name (`now.config.json`) is 15 characters and passes every
rule in that validator (length, no double/trailing underscore, lowercase
alphanumeric+underscore only). Still open: an actual live deploy hasn't
succeeded yet (blocked on the `scopeId` issue above), so this hasn't been
empirically confirmed end-to-end. Full reasoning on the name itself in
`docs/adr/0002-vendor-prefix-and-rescope-plan.md`.

**Reproducibility:** the PDI is reclaimed after ~10 days idle. After every
deploy, confirm a clean rebuild path still works from source alone (delete
local build/output directories and re-run build + deploy) — a scoped app
that can only be reproduced from a half-remembered manual sequence isn't
actually source-controlled.
