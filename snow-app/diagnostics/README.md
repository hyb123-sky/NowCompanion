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
