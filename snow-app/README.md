# snow-app

ServiceNow scoped application, source-controlled and CI-deployable via the
ServiceNow SDK (Fluent). Empty in Phase 0 beyond `now.config.json`; Phase 1
adds:

- Tables: `companion_policy`, `companion_outbox`
- Business Rules on `task` and `sysapproval_approver` writing to the outbox
- Scripted REST API: `/events` (watermark-paged), `/ack`, `/context`
- A dedicated least-privilege integration role
- ATF tests, version-tolerant across the N/N-1 matrix — see
  `docs/servicenow-compatibility.md`

**Scope prefix policy:** the scope prefix in `now.config.json` is temporary,
personal-account debt — see `docs/adr/0002-vendor-prefix-and-rescope-plan.md`.
It must not be hardcoded anywhere outside `now.config.json`; CI enforces this
(`.github/workflows/guard-vendor-prefix.yml`).

Target PDI: `dev310526` (Australia). Deploy/build commands land here in
Phase 1 once the SDK project structure exists.

**`now.config.json` is intentionally incomplete.** The installed
`@servicenow/sdk` requires a `scopeId` (the scoped app's 32-char hex sys_id)
that only exists once the app record is created on an instance — it cannot
be known or fabricated ahead of that, so it's omitted here rather than
guessed. `now-sdk init`/`now-sdk build` against the PDI in Phase 1 will need
to populate it.

**Scope name — final decision:** see `now.config.json` for the current value
(fits the SDK schema's 4-18 char limit). Full reasoning in
`docs/adr/0002-vendor-prefix-and-rescope-plan.md` — why the chosen suffix
was preferred over an earlier, more ambiguous candidate, and why the suffix
is held to ≤ 5 characters (headroom for the eventual re-scope onto the
company's vendor prefix, whose length isn't known yet).

**Open task for Phase 1:** the 18-char limit above is the SDK schema's
stated limit, not a confirmed platform limit. Once connected to the PDI,
empirically verify the real ServiceNow scope-name length limit during
scoped-app creation and record the measured value here and in ADR-0002.
