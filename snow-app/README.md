# snow-app

ServiceNow scoped application, source-controlled and CI-deployable via the
ServiceNow SDK (Fluent). Deployed successfully to the PDI (Phase 1). Phase 1
adds:

- Tables: `companion_policy`, `companion_outbox`, `companion_user_map`
  (Entra OID ↔ `sys_user`, see
  `docs/adr/0003-identity-resolution-oauth-client-credentials.md`) — PR-2,
  not yet built.
- Business Rules on concrete tables (e.g. `incident`, `change_request`) in
  the ITSM domain pack — never on `task` directly — each calling a shared,
  domain-agnostic Script Include in this scope — PR-4, pending the SLA
  detection strategy decision in `docs/adr/0005-sla-threshold-detection-strategy.md`.
- Scripted REST API: `/events` (OID-based, watermark-paged), `/ack`,
  `/context` — PR-5.
- Roles: `.user`, `.admin`, `.integration` (scope-prefixed per
  `now.config.json`), declared explicitly in `src/fluent/roles.now.ts` so
  they're reproducible from source rather than left to platform
  auto-generation.
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
#4 and ADR-0001 decision #4. See `docs/threat-model.md` boundary 3.5.

**Known limitation, worked around, not solved:** the agent driving this
repository could not read the stored `now-sdk auth` credential from its own
tool-execution context even though it's confirmed present (Windows
Credential Manager, target `now-sdk.ServiceNow`) — most likely a Windows
logon-session scoping difference between that context and the interactive
session that created the credential. Workaround: `now-sdk auth`/`build`/
`install` are run by a human in an interactive session; the agent prepares
Fluent source and reads back results. Not investigated further because
doing so would mean handling the credential directly, which is exactly what
this workaround avoids.

**App settings (current state, observed on the PDI):**

| Setting | Value |
|---|---|
| Application administration | false |
| Runtime Access Tracking | None |
| Licensable | true |
| Subscription requirement | Monitor |
| JavaScript Mode | ES2021 |

`Runtime Access Tracking = None` means `sys_scope_privilege` is not being
populated at all right now — see `docs/adr/0004-cross-scope-access-tracking-mode.md`
before treating an empty `sys_scope_privilege` as evidence of anything.

Local SDK commands (always the pinned local version, never a possibly-newer
one `npx` might resolve from outside this directory):
```
npm run auth -- --add <pdi-host> --type basic --alias <alias>   # interactive, run once, from this directory
npm run build                                                    # no auth needed
npm run deploy -- --auth <alias>                                 # aliases to `now-sdk install`
```

**Diagnostics (`snow-app/diagnostics/`):** deploy-time probes that are never
part of the deployable app — excluded by living outside `src/fluent`, the
configured Fluent source directory. See `snow-app/diagnostics/README.md` for
what's there and how to run one.

**Scope name length limit — confirmed on the platform, not just from SDK
source.** The chosen scope name (`now.config.json`) deployed successfully.
The platform independently confirmed the 18-character limit by truncating
the auto-generated end-user role's base name to fit it — actual platform
enforcement, not just a comment in SDK source. Details and the exact
observed value are in `docs/servicenow-compatibility.md` (why this belongs
in `docs/` rather than repeated here: it's the vendor-prefix-adjacent kind
of detail `guard-vendor-prefix.yml` polices). Full reasoning on the chosen
name in `docs/adr/0002-vendor-prefix-and-rescope-plan.md`.

**Reproducibility:** the PDI is reclaimed after ~10 days idle. After every
deploy, confirm a clean rebuild path still works from source alone (delete
local build/output directories and re-run build + deploy) — a scoped app
that can only be reproduced from a half-remembered manual sequence isn't
actually source-controlled.
