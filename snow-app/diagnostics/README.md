# diagnostics

Deploy-time probes. Never part of the deployable app — this directory is
outside `src/fluent` (the `fluentDir` configured in `now.config.json`), so
`now-sdk build` never picks anything up from here on its own.

## `cross-scope-br-probe.now.ts`

Tests whether this scope can create *and actually execute* a Business Rule
against the global-scope `incident` table — a design-time Studio check
(admin can always create a BR via the UI) does not prove the same code
executes once deployed through the SDK, and an empty `sys_scope_privilege`
table doesn't prove anything at all while Runtime Access Tracking is set to
None. See `docs/adr/0004-cross-scope-access-tracking-mode.md`.

**To run it:**

1. Copy this file into `../src/fluent/` (temporarily — do not commit it
   there).
2. `now-sdk build` from `snow-app/`.
3. `now-sdk install --auth <alias>` to deploy.
4. On the instance: set **Runtime Access Tracking** to **Tracking** (System
   Applications → the NowCompanion app record).
5. Trigger the probe — insert or update an `incident` record. (The probe's
   `condition: 'false'` means it won't fire as committed; temporarily change
   that to something that will actually match your test record before
   deploying, then change it back before removing the probe.)
6. Check `sys_scope_privilege` for what appeared, and confirm via a log
   statement or other observable side effect that the script body actually
   ran (not just that the BR record exists).
7. Record what you observed in `docs/adr/0004-cross-scope-access-tracking-mode.md`
   and `docs/servicenow-compatibility.md`.
8. Remove the copy from `src/fluent/`, redeploy, confirm the app is clean
   again.

Do not leave this active in a real deploy — it's diagnostic-only, and its
own name says "remove before shipping" for a reason.

## `scripts/`

Read-only ServiceNow Background Scripts (System Definition → Scripts -
Background), not Fluent — they're never built or deployed, only pasted
into the UI and run by hand. Each is under 40 lines, asserts in its own
header comment that it writes nothing, and is safe to review before
running because of that. This is the standing pattern for PDI
investigation going forward: Claude Code writes the script, a human runs
it and pastes back the raw output — the credential never has to leave the
human's session for this to work.

- `sla-job-intervals.js` — Scheduled Job config/state for every job whose
  name contains "SLA."
- `task-sla-pause-fields.js` — raw stored fields (not display values) for
  one `task_sla` record; set the sys_id before each run.
- `sla-definition-survey.js` — active SLA definitions and their durations.

Field/table names in these scripts are best-effort for a recent ServiceNow
release. If a script prints blanks where data is expected, that's a signal
the name differs on this instance — report it rather than assuming the
script is simply broken.

- `sla-trigger-queue.js` — queries `sys_trigger` (the scheduler's runtime
  QUEUE) directly. Supersedes the nested `sysauto`-then-`sys_trigger`-by-name
  lookup in `sla-job-intervals.js`, which could only ever find a trigger row
  whose name matched a job definition and so could never find the
  dynamically-generated tiered SLA trigger rows — see
  `docs/adr/0005-sla-threshold-detection-strategy.md` revision history.
