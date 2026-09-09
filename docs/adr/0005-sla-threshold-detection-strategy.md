# ADR-0005: SLA 80%-Threshold Detection Strategy

- Status: **Proposed — awaiting approval. No implementation in this PR or
  any PR until this is explicitly approved.**
- Date: 2026-09-09

## Context

The ITSM domain pack must detect when a `task_sla` record crosses 80% of
its business-time budget, to write a `companion_outbox` notification. Three
candidate designs were raised:

- **Option A** — a Business Rule on `task_sla` (`after update`) comparing
  `current.business_percentage >= 80 && previous.business_percentage < 80`.
- **Option B** — an independent scheduled job polling `task_sla` for
  `business_percentage >= 80 AND has_breached=false`, with a dedupe flag.
- **Option C** — precompute a `fire_at` timestamp from `planned_end_time`
  when the SLA starts; a lightweight (e.g. per-minute) scheduled job scans
  for due rows.

Every claim below is labeled **[measured]** (observed on the PDI, Australia,
dev310526) or **[reasoned]** (derived from ServiceNow's documented/general
SLA engine architecture, not directly observed this session). Where a claim
depends on data not yet supplied, that's stated explicitly rather than
filled in with a guess.

## What's measured so far

**[measured]** Eight OOB scheduled jobs exist, all Ready, all in Global
scope:

| Job | Type | Observed run count |
|---|---|---|
| SLA Async Delegator | Repeat, RunScriptJob | ~1,713,001 |
| SLA async queue health check | Repeat | ~28,602 |
| SLA update (breach within 10 min) | Interval | ~147,157 |
| SLA update (breach within 1 hour) | Interval | ~18,422 |
| SLA update (breach within 1 day) | Interval | ~6,497 |
| SLA update (breach within 30 days) | Interval | ~4,208 |
| SLA update (already breached) | Interval | ~4,201 |
| SLA update (breach after 30 days) | Interval | ~4,122 |

**[measured]** `glide.sla.calculate_on_display = true` — the UI-displayed
percentage is computed at display time and may not equal the stored
`business_percentage`. A screenshot of a percentage is not evidence of the
stored value.

**[measured, single observation, short window, not settled]** Setting a
task to On Hold moved `stage` to Paused and froze `business_percentage`,
but `planned_end_time` did not change — and did not change back when
resumed, in the window observed. The SLA Async Delegator may simply not
have run yet in that window; this is not confirmed as settled behavior.

**[reasoned, not yet confirmed]** The job list's run-count ratios (the "10
min" tier has run ~35x as often as the "30 days" tier) are consistent with
a tiered architecture: rows closer to breach get recalculated far more
often than rows far from breach, and presumably migrate between tiers as
time passes. This qualitative structure is confirmed by the job
names/counts alone. **The exact Repeat Interval duration for each tier is
not yet available** — pending data to be supplied separately. Until that
arrives, no quantitative worst-case latency number below should be read as
final; they are illustrative, and are marked as such.

## Evaluating the "Option A degrades for long SLAs" hypothesis

**[reasoned — structurally sound, quantitatively unconfirmed]** A `task_sla`
row's tier is presumably determined by proximity to its *own* breach time,
not by the SLA definition's total duration. A 4-hour SLA crosses 80% about
48 minutes before breach — inside the "within 1 hour" tier. A 30-day SLA
crosses 80% about 6 days before breach — still inside the "within 30 days"
tier (6 days > 1 day), the *coarsest* interval short of "after 30 days."
Under Option A (a BR reacting to whatever the OOB job actually writes),
detection latency for a long SLA's 80% crossing is bounded by **that
row's current tier's own interval**, not by the fine-grained tiers that
exist for near-breach urgency. If the "within 30 days" tier's interval
is materially coarser than the "within 1 hour" tier's (which the run-count
ratio suggests, but doesn't quantify), the hypothesis is **confirmed in
mechanism**, even without the exact numbers: Option A's detection latency
is tier-dependent, and worse for SLAs that spend longer in the coarser
tiers before crossing 80%. This is **not refuted** by anything measured so
far; it is not yet **numerically confirmed** either.

Decision rule once the interval numbers arrive: if the coarse tiers
("30 days," "after 30 days") run at an interval that would make an
80%-crossing notification arrive many minutes-to-hours late for a long SLA,
that's a real, customer-visible latency problem under Option A. If all
tiers turn out to run within a few minutes of each other, this concern is
largely refuted and Option A's simplicity becomes the stronger argument.

## Comparison

### 1. Worst-case detection latency

- **Short SLA (e.g. 4-hour), Option A**: **[reasoned]** bounded by the "1
  hour" (or finer) tier's interval — likely tight, since that tier runs
  ~18k times observed (frequent).
- **Short SLA, Option B**: **[reasoned]** same underlying stored-value
  freshness as A, plus Option B's own poll interval on top — **strictly no
  better than A**, since it reads the same field and can only react at its
  next poll after the field is already stale by A's standard.
- **Short SLA, Option C**: **[reasoned]** bounded by Option C's own scan
  interval (e.g., 1 minute) — decoupled from the OOB tiering entirely,
  since it fires off a precomputed timestamp, not the OOB-recalculated
  percentage.
- **30-day SLA, Option A**: **[reasoned]** bounded by the "30 days" tier's
  interval, which — per the tiering hypothesis above — is plausibly much
  coarser than the "1 hour" tier. **This is the tier this SLA occupies at
  the moment of crossing 80%** (6 days before breach), so the "fine" tiers
  never help it.
- **30-day SLA, Option B**: **[reasoned]** same bound as A, plus its own
  poll interval — again no better than A.
- **30-day SLA, Option C**: **[reasoned]** unchanged from the short-SLA
  case — Option C's latency is independent of SLA duration by design,
  because it never depends on which OOB tier a row is in.

**Provisional conclusion**: Option C is the only one of the three whose
worst-case latency doesn't depend on SLA duration. This is the strongest
argument in its favor and holds regardless of the still-missing interval
numbers — it follows from C not depending on the OOB tiering mechanism at
all for its firing decision, only for the (independent) breach calculation
ServiceNow already owns.

### 2. Behavior across pause / resume / cancel

- **[measured, single observation — see caveats above]** `planned_end_time`
  did not move on pause or resume in the one case observed.
- **Option A**: **[reasoned]** naturally correct *if* `business_percentage`
  itself correctly freezes during a pause (which the single observation
  supports) — the BR simply doesn't see a crossing while paused, and
  resumes reacting once the OOB engine resumes updating the field. No
  extra logic needed, **provided** the stored percentage is trustworthy.
- **Option B**: **[reasoned]** same as A — reads the same field, same
  correctness dependency, plus its own dedupe-flag bookkeeping must also
  handle "was above 80%, still above 80% after resume, don't re-notify."
- **Option C**: **[reasoned]** this is where Option C is weakest as
  described. A `fire_at` computed once from `planned_end_time` at SLA start
  drifts **early** after any pause, if `planned_end_time` really doesn't
  shift on resume (per the single observation) — the row would fire before
  it should. **Investigated, not resolved**: whether `pause_duration` on
  `task_sla` accumulates total paused business time reliably enough to
  correct this (`fire_at' = fire_at + pause_duration`, recomputed on every
  pause_duration change). This requires **[not yet measured]**: whether
  `pause_duration` updates once per pause/resume cycle or continuously,
  whether it resets or accumulates across multiple pauses on the same
  record, and what event (a BR on `stage` transition, or on `pause_duration`
  itself changing) would need to trigger the recompute. **Cancelled**
  SLAs need the corresponding outbox/fire-time row suppressed/expired under
  all three options equally — this isn't option-specific.

**Provisional conclusion**: Option C is not a pure "compute once and
forget" design — it needs a narrow, event-driven recompute step for pause/
resume, making it a hybrid (precomputed fire time + a small BR), not a
replacement for event-driven logic entirely. Its advantage over A is that
the event-driven part is narrow (react to pause/resume/cancel state
transitions) rather than broad (react to every percentage recalculation).

### 3. Load added to the instance

- **Option A**: **[reasoned]** effectively zero incremental load — piggybacks
  on saves the OOB engine already performs; no new scheduled job.
- **Option B**: **[reasoned]** a new scheduled job scanning `task_sla`,
  cost scaling with the number of open, in-progress SLA rows per run.
- **Option C**: **[reasoned]** also a new scheduled job, but its query is
  narrower in shape (`fire_at <= now AND NOT fired`, indexable) than a broad
  percentage scan — plausibly cheaper per run than B for a comparable
  polling interval, though both are "our new job" versus A's "no new job."

### 4. Sensitivity to customer SLA-engine customization

- **Option A / B**: **[reasoned]** both depend on `business_percentage`
  being kept fresh by *whatever* mechanism the customer's instance uses.
  A customer who has heavily customized SLA definitions, disabled some OOB
  tiers, or otherwise altered the recalculation cadence changes A/B's
  latency in a way NowCompanion has no visibility into and cannot detect
  from the outside.
- **Option C**: **[reasoned]** depends on `planned_end_time` and (if the
  pause-correction is built) `pause_duration` — more fundamental fields
  that breach calculation itself depends on, and thus less likely to be
  disabled even under heavy customization (a customer that breaks breach
  calculation has bigger problems than NowCompanion's notifications). Still
  not zero-risk: a customer using a substantially different SLA framework
  (e.g., fully custom, not built on `contract_sla`/`task_sla` at all) breaks
  the underlying assumption for all three options equally, not just C.

### 5. Survivability across an N+1 platform upgrade

- **Option A / B**: **[reasoned]** depend on `business_percentage` (or
  equivalent) continuing to be computed and stored in roughly its current
  form — a longstanding, foundational field, plausibly stable, though the
  OOB job *names/tiering* could be restructured by ServiceNow without
  breaking A/B, since neither references job names directly, only the
  field's eventual freshness.
- **Option C**: **[reasoned]** depends on `planned_end_time` and
  `pause_duration` retaining their current meaning — similarly foundational.
  Its own scheduled job is ours, so it's immune to ServiceNow renaming or
  restructuring *its* jobs, which is a genuine (if narrow) robustness edge
  over A/B.

## Recommendation

**Option C, augmented with a narrow event-driven recompute** (a BR reacting
to `task_sla` stage transitions / `pause_duration` changes to correct
`fire_at`), pending confirmation that `pause_duration` is reliable enough to
support that correction.

**Why**: it's the only option whose detection latency doesn't degrade for
long SLAs — a structural property, not one that depends on the still-missing
interval numbers. Sections 3–5 are roughly a wash across all three options,
none decisively rules Option C out.

**What would change this recommendation**:

- If `pause_duration` turns out not to reliably track total paused time
  (e.g., resets, only tracks the most recent pause, or is otherwise
  unusable as a correction input) — Option C's pause-handling has no clean
  data source, and I'd fall back to **Option A** with an explicit,
  documented customer-facing caveat that notification latency varies with
  SLA duration, rather than pretend a false precision.
- If the still-pending interval numbers show all tiers run within a few
  minutes of each other — the "Option A degrades for long SLAs" concern is
  largely refuted, and **Option A's simplicity (zero new scheduled jobs, no
  new failure mode) becomes the stronger choice**, since Option C's
  precision would then be solving a latency problem that doesn't actually
  exist at meaningful scale.

**No implementation until this recommendation is approved.**
