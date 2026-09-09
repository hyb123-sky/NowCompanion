# ServiceNow Version Compatibility

## Strategy: rolling N / N-1

NowCompanion supports the **current ServiceNow release (N)** and the
**immediately prior release (N-1)** at all times, not a single pinned
version. As ServiceNow ships a new release, the matrix rolls forward: the new
release becomes N, the previous N becomes N-1, and the previous N-1 is
dropped from support. This is a standing policy, not a per-release decision.

| Role | Release (as of 2026-09-08) |
|---|---|
| N (current) | Australia |
| N-1 | Zurich |

Update this table when ServiceNow ships the next family release; do not wait
for a dedicated ADR to roll the window forward.

## What "supported" means

- The scoped app (`/snow-app`) installs cleanly via SDK deploy or update set
  on both N and N-1.
- ATF tests pass on both releases (see below for how they stay
  version-tolerant).
- The Gateway's assumptions about API responses (field presence, pagination
  behavior of the watermark-paged `/events` endpoint) hold on both releases.
- Known incompatibilities are documented here per release, with a workaround
  or an explicit "not supported on N-1" note, rather than silently breaking.

## Keeping ATF tests version-tolerant

- Tests assert on the scoped app's own contract (its Scripted REST API
  responses, its own tables) rather than on platform UI details or base-table
  internals that shift between releases.
- Where a platform behavior genuinely differs between N and N-1 (e.g. a
  field default, a BR execution-order nuance), the test asserts the
  *observable contract* NowCompanion depends on and is parameterized/skipped
  per release rather than hardcoded to one release's behavior.
- Any release-specific branch in scoped-app code (rare, should be avoidable
  given the API is ours) must be justified in the PR and noted in this file.

## PDI observations (Phase 1, Australia, dev310526) — measured, not reasoned

Scope `x_1821654_buddy` deployed successfully. `scopeId`:
`3448709cc3930754f9ef98bc05013152`. App name: NowCompanion.

**Scope-name length limit — confirmed by platform behavior, not just SDK
source.** The platform auto-generated the end-user role as
`x_1821654_nowcompa.user` — "nowcompanion" truncated to "nowcompa", making
`x_1821654_nowcompa` exactly 18 characters. This is stronger evidence than
the SDK validator's comment citing `ScopeNameUtil.java` (which was itself
already good evidence) — it's the platform actually enforcing an 18-char
identifier limit on a derived name, observed directly. Action taken:
renaming the role to `x_1821654_buddy.user` explicitly in Fluent source
(`snow-app/src/fluent/roles.now.ts`) rather than leaving the platform's
auto-generated, truncated-and-confusing name in place — see PR-1.

**App settings observed (current state):**

| Setting | Value |
|---|---|
| Application administration | false |
| Runtime Access Tracking | None |
| Licensable | true |
| Subscription requirement | Monitor |
| JavaScript Mode | ES2021 |

**Runtime Access Tracking = None invalidates the cross-scope-access
evidence gathered so far.** `sys_scope_privilege` being empty is *not*
evidence that no cross-scope access is needed — privilege records are only
generated at runtime by the tracking mechanism, and tracking is off. Any
earlier assumption that cross-scope BR creation "just works" because no
privilege records exist was wrong and is corrected here. Separately, on the
`incident`, `change_request`, and `task_sla` tables: "Allow configuration"
is unchecked, "Can read/create/update" are checked, "Can delete" is
unchecked — but this reflects **design-time** access (what an admin can do
in Studio), not **runtime** execution permission for a deployed BR. These
are different questions; do not conflate them.

Open, tracked in ADR-0004: deploy the disabled cross-scope probe
(`snow-app/diagnostics/`), enable it, trigger it, and see what actually
appears in `sys_scope_privilege` once Runtime Access Tracking is set to
Tracking. Not done yet — needs a live PDI session.

**SLA scheduled jobs — corrected 2026-09-11.** The table that previously
stood here (an eight-job tiered list: "SLA Async Delegator" plus four "SLA
update (breach within X)" jobs) **did not survive an actual query against
the instance** (`snow-app/diagnostics/scripts/sla-job-intervals.js`). Those
five job names are not present on this PDI, active or inactive. The real,
current jobs (all `sysauto`, queried by `name CONTAINS 'SLA'`, two
substring false-positives via "tran**sla**tions"/"**Sla**ck" excluded):

| Job | Class | Active | Cadence |
|---|---|---|---|
| SLA async queue health check | sysauto_script | yes | periodically, every 5 min |
| Kokoro - SLA Status Update | sysauto_script | yes | periodically, every 1 min |
| Kokoro - Daily SLA Report | sysauto_script | yes | daily |
| [PA Incident SLA] Daily/Historic Data Collection | sysauto_pa | no | daily / on_demand |
| temporary job for collecting Kokoro SLA Breach/Health Rate | sysauto_pa | no | once |

"Kokoro" is not recognized OOB ServiceNow naming — this instance already
carries a pre-existing customization/demo integration, which is itself a
data point (this is not a clean baseline instance). The tiered-
recalculation-by-proximity-to-breach claim previously made here is
withdrawn — not confirmed by evidence, and should not have been presented
as measured. See `docs/adr/0005-sla-threshold-detection-strategy.md`
("PDI script results") for the full correction and what it changes about
the SLA detection strategy recommendation.

Also observed: `glide.sla.calculate_on_display = true`. The percentage
shown in the UI is computed at display time; the **stored**
`business_percentage` value may lag behind what's rendered. A UI
screenshot of a percentage is not evidence of the stored field's value —
only a direct read of the stored field is.

**`planned_end_time` pause/resume behavior — single observation, short
window, still NOT settled.** On one `task_sla` record: setting the parent
task to On Hold moved `stage` to Paused and stopped `business_percentage`
from advancing, but `planned_end_time` did not change. Setting it back to
In Progress did not push `planned_end_time` out either, in the short window
observed. Caveats that must not be dropped from this note: this is a single
record, a short observation window, and whatever job actually does the
recalculation work (see the corrected job list above — not confirmed to be
"SLA Async Delegator," which doesn't exist on this instance) may simply not
have run yet in that window. `task-sla-pause-fields.js` was subsequently
run once more (2026-09-11) but against a record that never paused
(`pause_duration`/`pause_time` both blank) — it added a different finding
(`business_percentage` is not capped at 100%, confirmed 54707.89% on an
old breached-but-unclosed record) but did **not** add new evidence on the
pause/resume question itself. Still needs the original three-part before/
while-paused/after-resume comparison. See ADR-0005 for what this means for
Option C's `pause_duration`-based correction idea.

## Current known gaps

- Confirmed (Phase 1): `now-sdk build` requires a real `scopeId` in
  `now.config.json`, which is only obtainable via an authenticated call
  during `now-sdk init` — it cannot be generated offline. Once `scopeId` is
  committed (it now is), `now-sdk build` runs with **no credential needed**
  — confirmed by running it locally and in a clean rebuild with no auth in
  scope. CI now runs `npm run build` in the `snow-lint` job (name unchanged
  to keep the branch-protection check list stable). `now-sdk install`
  (deploy) still needs the PDI credential and stays a manual, human-run
  step — CI cannot and should not attempt it without provisioning a
  CI-specific credential (not yet decided whether that's worth doing before
  v1.0).
- N-1 (Zurich) has not yet been provisioned as a test instance; Phase 1's
  ATF run is against the Australia PDI only until a second instance is
  available. Add the Zurich row's verification status here once tested.
