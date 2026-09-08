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
