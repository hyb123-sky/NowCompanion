# ADR-0005: SLA Notification Trigger Strategy

- Status: **Proposed — awaiting approval. No implementation in this PR or
  any PR until this is explicitly approved.**
- Date: 2026-09-09 (revised same day — reframed from "detect 80%" to
  "detect an absolute lead time before breach"). **Revised again
  2026-09-11**: the diagnostic scripts were run; the tiering hypothesis the
  reframing leaned on is withdrawn (it doesn't match this instance), the
  core recommendation is unchanged and, if anything, reinforced by the real
  SLA-duration survey. **Revised a third time, same investigation**: the
  withdrawal itself was wrong — see "Correction to the correction" below.
  Finding 3 (pause/resume) is now resolved on a clean record; see "Finding 3
  resolved" below. Recommendation still Proposed, not Accepted.

## Context

The ITSM domain pack must decide when a `task_sla` record has become
notification-worthy, to write a `companion_outbox` row. The original framing
was "detect an 80%-of-budget crossing," evaluated across three candidate
mechanisms:

- **Option A** — a Business Rule on `task_sla` (`after update`) comparing
  the trigger condition against its previous value.
- **Option B** — an independent scheduled job polling `task_sla`, with a
  dedupe flag.
- **Option C** — precompute a `fire_at` timestamp from `planned_end_time`
  when the SLA starts; a lightweight scheduled job scans for due rows.

That framing has been challenged and is revised below. Every claim is still
labeled **[measured]** (observed on the PDI, Australia, dev310526) or
**[reasoned]**, per the same discipline as the original version of this ADR.

## PDI script results (2026-09-11) — a correction, not a confirmation

The three diagnostic scripts have now been run. **The most important result
is negative**: the OOB tiered-job list this ADR's earlier tiering hypothesis
was built on (`SLA Async Delegator`, and the four `SLA update (breach within
10 min / 1 hour / 1 day / 30 days)` jobs) **does not appear in the actual
query results against this instance.** `sla-job-intervals.js` queries
`sysauto` for `name CONTAINS 'SLA'` — those five job names are simply not
present, active or inactive. This isn't a query bug: two names that
superficially matched the filter turned out to be false positives from
naive substring matching (`AutoRetrieveTranslationsFromTMS` and `Generate
topic path translations` match via "tran**sla**tions"; `Certificate Slack
Notification` and `Slack Users Auto Syncing` match via "**Sla**ck") — worth
naming as a real limitation of the script itself, not swept under the rug.

**What's actually present, real SLA-related jobs only:**

| Job | Class | Active | Cadence |
|---|---|---|---|
| SLA async queue health check | sysauto_script | yes | periodically, every 5 min |
| Kokoro - SLA Status Update | sysauto_script | yes | periodically, every 1 min |
| Kokoro - Daily SLA Report | sysauto_script | yes | daily |
| [PA Incident SLA] Daily Data Collection | sysauto_pa | no | daily |
| [PA Incident SLA] Historic Data Collection | sysauto_pa | no | on_demand |
| temporary job for collecting Kokoro SLA Breach Rate | sysauto_pa | no | once |
| temporary job for collecting Kokoro SLA Health Score | sysauto_pa | no | once |

Only "SLA async queue health check" corroborates anything from the earlier
list (it was named there too). "Kokoro" is not a name I recognize as OOB
ServiceNow — these look like a pre-existing customization/demo integration
already present on this personal PDI, not a clean baseline. **This is
itself relevant evidence for ADR-0005's dimension 4** (sensitivity to
customer SLA-engine customization): the one instance available for testing
is *already* customized, which is a live example of exactly the risk that
dimension discusses, not a hypothetical.

**Consequence for the tiering hypothesis**: it is **withdrawn as stated**.
I do not have confirmed evidence of a tiered OOB recalculation engine on
this instance/version — the earlier reasoning built on those five absent
jobs was wrong to present as measured, and I should have caught the
mismatch before writing it. What's left, honestly: two real jobs run every
1-5 minutes with names suggesting they touch SLA state ("async queue health
check," "SLA Status Update"). If either is what actually refreshes
`business_percentage`/`stage`, single-digit-minute latency for Option A's
default config is plausible — **but I have not confirmed that either job
is the thing that updates those fields**, only that they exist and run
often. Treat the "60-minute lead time governed by the within-1-hour tier"
claim below as superseded by this section, not layered on top of it.

**`task-sla-pause-fields.js`** (one record, `03d8c106d732220035ae23c7ce6103fd`):
`stage=in_progress`, `has_breached=1`, `business_percentage=54707.89`,
`business_duration` ≈ 22.79 days, `planned_end_time` exactly 1 hour after
`start_time`, `pause_duration`/`pause_time` both blank, `schedule=null`.
**New finding, not previously known**: `business_percentage` is **not
capped at 100%** and keeps climbing indefinitely for a breached-but-never-
closed record (54707.89% here). This doesn't break Option A/B's
crossing-detection logic (they fire once on the 80% crossing and don't
re-fire), but it's a real data-shape quirk worth documenting for anything
that reads this field as if it were bounded. **Finding 3's actual question
(does `planned_end_time` move on pause/resume) is still not answered** —
this record's `pause_duration`/`pause_time` are both blank, meaning it
never went through a pause cycle; the three-part before/while-paused/after-
resume comparison this script was designed for hasn't been run yet.

**`sla-definition-survey.js`**: 13 active SLA definitions, all on
`incident`, ranging from 15 minutes to 2 days — **none anywhere near 30
days**. Most have a `pause_condition` set; two use an "8-5 weekdays"
schedule, the rest run on 24/7 calendar time (`schedule` blank). This
answers one of the "what would change this recommendation" items below
directly: on the one real sample available, long-SLA percentage mode is
low-priority — worth building only if a customer actually asks for it, not
speculatively.

## Correction to the correction (same day, later) — the withdrawal above was itself wrong

The section above concluded "the tiering hypothesis is withdrawn... I do not
have confirmed evidence of a tiered OOB recalculation engine on this
instance." **That conclusion was wrong, and wrong for a specific, nameable
reason, not just an unlucky guess.**

**What was actually wrong with `sla-job-intervals.js`.** The script queried
`sysauto` (job **definitions**) for `name CONTAINS 'SLA'`, and for each
definition it found, it queried `sys_trigger` (the scheduler's runtime
**queue**) for a row whose `name` **matched the sysauto definition's
name**. That nested, name-joined lookup could only ever find a trigger row
that happens to share a name with a static job definition. It had no chance
of finding trigger rows the SLA engine generates **dynamically at runtime**
— which is very likely exactly what "SLA update (breach within 10 min / 1
hour / 1 day / 30 days)" are. A blank result from that nested query is
evidence that no `sysauto`-defined job shares a name with a `sys_trigger`
row. It is not evidence that no such row exists in `sys_trigger` on its
own — and I reported it as the latter.

**The deeper error, worth stating plainly rather than glossing over**: I
inferred "these jobs don't exist" from "my query didn't return them."
Absence of evidence from one table read is not evidence of absence —
especially here, since the very thing I was contradicting (an earlier
report with specific run counts: SLA Async Delegator ~1,713,001 runs, "10
min" tier ~147,157, etc.) should have prompted the question "what table
did those numbers actually come from," not "that evidence must have been
wrong." A false "the evidence doesn't exist" is worse than no conclusion —
it actively points future work in the wrong direction. Recorded here
rather than silently re-edited away, per the standing rule for this ADR.

**New evidence, this session**: a screenshot from this same instance shows
a list titled **"Schedule"**, columns **Name / Next action / Trigger type /
Job ID / State / Run count**, listing exactly the eight originally-reported
jobs (SLA Async Delegator; SLA update breach within 10 min / 1 hour / 1 day
/ 30 days; SLA update already breached; SLA update breach after 30 days;
SLA async queue health check). That column layout — `next_action`, `trigger_type`,
`job_id`, `state` — is the **`sys_trigger`** list view, not `sysauto`. These
are two different tables with two different purposes (definitions vs. the
live queue), and the original script only ever looked at the second one
through a filter keyed to the first.

**Corrective action taken**: `snow-app/diagnostics/scripts/sla-trigger-queue.js`
now queries `sys_trigger` directly, with no join back to `sysauto`. It also
does not assume which field (if any) corresponds to the "Run count" column
seen in the UI — rather than guess a field name and silently print a blank
if wrong (the same mistake that produced this whole detour), it dumps every
field present on each matching row so the mapping can be read off real
output.

**Status of the tiering table as of this revision**: `sla-trigger-queue.js`
has been written but **not yet run**. The table below is **not** re-asserted
as measured — it restores the *shape* of the original report (which the
user's screenshot corroborates, table-level, as real) but the exact
per-tier repeat intervals still require this instance's own
`sys_trigger` data before they can be called measured again.

| Job (as shown in the "Schedule" list) | Trigger type | Repeat interval |
|---|---|---|
| SLA Async Delegator | — | *pending sla-trigger-queue.js output* |
| SLA update (breach within 10 min) | — | *pending* |
| SLA update (breach within 1 hour) | — | *pending* |
| SLA update (breach within 1 day) | — | *pending* |
| SLA update (breach within 30 days) | — | *pending* |
| SLA update (already breached) | — | *pending* |
| SLA update (breach after 30 days) | — | *pending* |
| SLA async queue health check | — | *pending* |

**[measured — user's screenshot of this instance's `sys_trigger` list,
pending my own re-query]**: these eight rows exist, by name, on this
instance. **[pending]**: their trigger types and repeat intervals, until
`sla-trigger-queue.js` is run and pasted back. Until then, treat "Worst-case
latency for a 60-minute lead time" below as still open on the *tiering*
question specifically (separate from the two "Kokoro"/health-check jobs
found by the withdrawn-script's `sysauto` half, which remain real and
independently relevant per the section below).

## Reframing: absolute lead time, not percentage — evaluated, not just adopted

**The core claim, and why I agree with it.** 80% of a 4-hour SLA is ~48
minutes before breach — actionable. 80% of a 30-day SLA is **six days**
before breach — not actionable as a desktop interrupt, and a notification
nobody acts on trains the user to ignore the ones that matter. The real
product need for a per-item push notification is an **absolute lead
time** ("tell me 60 minutes before breach"), not a fraction of budget
consumed. I agree with this.

**A stronger piece of evidence than what was offered, worth stating
explicitly**: the OOB scheduled jobs' *names themselves* are stated in
absolute-time-to-breach terms — "breach within 10 min / 1 hour / 1 day / 30
days" — not in percentage terms. **[measured, job names]** This means the
platform's own internal model was never organized around percentage at
all; percentage was our framing, imposed on a platform that already thinks
in absolute time-to-breach. That's a stronger reason to prefer absolute
lead time than "customers won't act on a 6-day-early ping" alone — it also
means Option A stops fighting the platform's grain and starts working with
it. This point wasn't in the original proposal and materially strengthens
it.

**Where I push back — two refinements, not a rejection.**

1. **The naive `min(percentage_threshold, absolute_lead_time)` formula has
   a correctness bug for short SLAs.** For an SLA whose total duration is
   shorter than the configured absolute lead time (e.g., a 30-minute P1
   response SLA against a default 60-minute lead time), "60 minutes before
   breach" is satisfied *before the SLA even starts* — a literal `min()`
   would fire immediately at creation, at 0% consumed. This isn't an edge
   case to hand-wave; short-fuse SLAs are common precisely for the
   highest-priority work, where a false-immediate notification is actively
   harmful (it's the P1 case, not a corner case). **Proposed fix**: guard
   the absolute-lead-time trigger to only apply when the SLA definition's
   total business duration exceeds some multiple of the configured lead
   time (e.g., lead time must be ≤ 50% of total duration); below that
   threshold, fall back to a percentage trigger (80%, or configurable) for
   *that SLA definition specifically*. This is a product-config detail, not
   a code detail, and needs your call before PR-4, but the bug itself is
   real and needs a decision, not silence.
2. **Percentage is not merely "an edge feature for customers who insist"
   — recommend keeping it first-class, off by default, not demoted.** Two
   reasons: (a) some outsourcing/vendor SLA contracts specify
   percentage-of-budget escalation clauses as a *contractual* term, not a
   preference — relevant given `packs/rc` (compliance) is on the roadmap;
   a percentage trigger might not be optional for some regulated
   customers. (b) `business_percentage` may still be useful data for
   Phase 5's queue-summarization AI feature (an aggregate/reporting signal)
   even where it's the wrong mechanism for a per-item push interrupt — the
   reframing argues against percentage *as a notification trigger*, not
   against capturing the data at all. Recommend `companion_policy` treats
   both trigger types as equally real, independently configurable options
   (absolute lead time on by default, percentage off by default), not a
   primary mechanism plus a bolted-on fallback.

## Answering the four questions directly

**Does absolute lead time make Option A adequate for the default
configuration?** **[reasoned, high confidence]** Yes. The OOB tiers'
absolute-time framing (see above) means a BR comparing
"time-until-`planned_end_time` ≤ configured lead time" is reacting to
exactly the dimension the platform already optimizes recalculation
frequency around. No new scheduled job is needed for the default case.

**Worst-case latency for a 60-minute lead time, and which tier governs
it?** **Reopened** (see "Correction to the correction" above) — a same-day
revision withdrew the tiering hypothesis on the strength of a query that
was itself wrong; the five named tiers are real, by name, on this
instance. **[pending]** Exact repeat intervals await
`sla-trigger-queue.js`'s output. Separately, **[measured, incomplete]**:
two other real, frequently-running SLA-adjacent jobs ("Kokoro" cadence,
every 1-5 minutes) were also found; if either refreshes the fields Option A
reads, latency is plausibly single-digit minutes, but this is unconfirmed —
neither job's actual effect on `business_percentage`/`stage` has been
checked. Both lines of evidence need to converge before this question is
answered numerically.

**Is there a case where percentage is clearly right and absolute lead time
is clearly wrong?** **[reasoned]** Yes, two: (a) SLAs shorter than the
configured lead time (the bug above — percentage is the only mechanism
that scales down correctly), and (b) contractually-mandated
percentage-escalation clauses, where the customer's obligation is stated
in budget-consumed terms regardless of what's "actionable." I would not
have surfaced (b) without deliberately looking for a case against the
reframing, which is exactly the exercise you asked for.

**Do I think the reframing is mistaken?** No — the core claim holds and is
now better-supported than when proposed. The two refinements above are
amendments (a bug fix and a demotion-to-avoid), not disagreements with the
premise.

## Comparison — percentage-mode analysis (retained from the original framing)

This section is retained because percentage remains a supported,
first-class trigger type (see above) — it now applies specifically to
"when percentage mode is configured for a given SLA definition,"
particularly the short-SLA fallback case and any customer that enables it
deliberately, rather than to the default path.

**[withdrawn, then the withdrawal was itself corrected — see "Correction to
the correction" above]** This section originally asserted an eight-job
tiered OOB schedule here. A same-day revision withdrew it, on the strength
of a query that (wrongly) concluded the jobs don't exist. That withdrawal
has since been shown to be wrong too: the eight jobs are real, by name, on
this instance (per a screenshot of `sys_trigger`) — the withdrawing query
only ever looked at `sys_trigger` rows joined by name back to `sysauto`
definitions, which structurally could not find them. Exact repeat intervals
are still pending `sla-trigger-queue.js`'s output (see above). Left as a
marker rather than silently deleted at either step, so both corrections are
visible in the ADR's own history, not just in commit messages.

**[measured]** `glide.sla.calculate_on_display = true` — the UI-displayed
percentage is computed at display time and may not equal the stored
`business_percentage`. A screenshot of a percentage is not evidence of the
stored value.

**[measured, single observation, short window, not settled]** Setting a
task to On Hold moved `stage` to Paused and froze `business_percentage`,
but `planned_end_time` did not change — and did not change back when
resumed, in the window observed. The SLA Async Delegator may simply not
have run yet in that window; not confirmed as settled behavior. This
affects both percentage-mode and absolute-lead-time-mode equally, since
both ultimately reason about `planned_end_time`/`business_percentage`.

For a **30-day SLA in percentage mode** specifically: the original argument
(detection latency bounded by a coarse "30 days" tier) relied on the
tiering hypothesis, which is reopened but not yet quantitatively confirmed
(see "Correction to the correction" above) — treat the "coarse 30-day tier"
claim as plausible again, not settled. What still holds regardless: percentage mode
on a long SLA depends on *whatever* mechanism refreshes
`business_percentage` for that record, at *whatever* cadence that turns out
to be for a row far from breach — unmeasured, not assumed coarse or fine.
Per the real SLA-definition survey (above), this scenario doesn't currently
exist on this instance at all (no SLA definition anywhere near 30 days), so
it's scoped down for a different reason now: not just "opt-in," but
"unobserved in the one real sample available."

## Finding 3 resolved — pause/resume on a clean record

The earlier pause/resume observation (a single breached record, see
"Comparison" above) proved nothing — a record that's already breached and
never closed isn't a clean test of pause/resume mechanics. **[measured]**
This has now been tested properly: one never-breached `task_sla` record,
schedule `08fcd0830a0a0b2600079f56b1adb9ae` attached, observed across three
states (in_progress → paused → resumed):

| field | in_progress | paused | resumed |
|---|---|---|---|
| stage | in_progress | paused | in_progress |
| planned_end_time | 2026-09-10 23:00:00 | 23:00:00 | 23:00:00 |
| pause_time | (empty) | 2026-09-10 05:26:20 | (empty) |
| pause_duration | (empty) | (empty) | 00:04:02 |
| percentage | 0.01 | 0.26 | 0.26 |
| business_percentage | 0 | 0 | 0 |
| business_duration | 0 | 0 | 0 |
| business_time_left | 08:00:00 | 08:00:00 | 08:00:00 |
| start_time | 2026-09-10 05:23:37 | same | same |

**Conclusion 1 — `planned_end_time` does not move on pause or resume.**
Confirmed on a clean record (the earlier breached-record observation is
superseded, not corroborating — it proved nothing, as noted above). A naive
`fire_at` derived once from `planned_end_time` and never revisited drifts
**early** by exactly the pause duration, because the deadline it's counting
down to never moved even though real progress toward it stopped.

**Conclusion 2 — `pause_duration` materializes only on resume.** It's
blank throughout the paused state and only appears once `stage` returns to
`in_progress`. Any correction logic must run **on the transition back to
`in_progress`**, not during the pause itself — there is nothing to read
while still paused.

**Conclusion 3 — `percentage` and `business_percentage` are two different
fields with two different, divergent behaviors, and both need to be named
explicitly in this ADR, not treated as interchangeable.** Over roughly
three minutes, `percentage` moved 0.01 → 0.26 while `business_percentage`
(and `business_duration`) stayed at 0 throughout — 05:23 falls outside the
attached schedule's business hours, so no business time accrued at all in
that window. **`percentage` is calendar-based**; **`business_percentage` is
schedule-based** and can sit at 0 for hours before jumping once business
hours start. Combined with the earlier finding that `business_percentage`
is uncapped (54707.89% observed on a different, breached record — see
"PDI script results" above), these are two fields with materially
different meanings and, in the schedule-based case, pathological range
behavior. **This makes "absolute lead time by default, percentage off by
default" (the reframing's core recommendation) a technical necessity, not
just a product preference**: a percentage trigger has to pick one of two
candidate fields, and neither is a safe default — the calendar-based one
ignores business hours entirely, the schedule-based one can be silently
frozen at 0 for an arbitrary stretch and is unbounded past 100%.

**Conclusion 4 — `planned_end_time` is schedule-aware, not naive calendar
arithmetic — mechanism not yet verified.** `start_time` 05:23:37 plus an
8-hour business duration would be 13:23 under naive addition; the actual
`planned_end_time` is 23:00. This is exactly the property Option C needs
(an absolute timestamp with the schedule already resolved into it), but
**how the platform derives it has not been investigated** — this is stated
as an observation, not an asserted mechanism, and needs a direct look
(likely at the SLA engine's script includes, or a controlled test varying
the schedule) before anything is built that depends on understanding *how*
it's computed rather than just that it moves correctly.

**Unreconciled discrepancy, flagged rather than silently resolved either
way**: a fourth raw run of the same script (resumed state, later) showed
`percentage=0.33` against the `0.26` recorded in the "resumed" column
above. Both are real captures from the same investigation; which one is
representative (or whether `percentage` simply kept advancing calendar-time
between the two captures, which would make both correct at their own
instant) is not yet determined.

**Open question, not yet answered — do not assume either direction**: does
`pause_duration` accumulate across multiple pauses on the same record, or
reset on each pause/resume cycle? This decides whether a `fire_at`
correction can read `pause_duration` directly on each resume, or must
maintain its own running total across possibly-multiple pause cycles.
Pending a follow-up test with more than one pause/resume cycle on the same
record.

**A second open question this data surfaces, not previously stated**:
`pause_duration` above (00:04:02) is **calendar time** from `pause_time`
(05:26:20) to resume — but if `fire_at` is derived from the
**schedule-aware** `planned_end_time` (Conclusion 4), correcting it with a
**calendar-based** `pause_duration` mixes units. Whether that's actually
wrong depends on how `planned_end_time` accounts for non-business time to
begin with (Conclusion 4's open mechanism question) — flagged here as a
consequence of that same unresolved mechanism, not resolved by assertion.

**Design decisions this resolves for `fire_at` (Option C, and the
short-SLA/percentage fallback that uses it)**:
- `fire_at = planned_end_time − effective_lead`, computed once when the SLA
  starts.
- Recomputed on **resume** (Conclusion 2) as `base fire_at + cumulative
  pause_duration` — not recomputed during the pause, since there is nothing
  to read yet.
- At fire time, check `stage`: if `paused`, suppress and re-evaluate on the
  next resume rather than firing on a stale timestamp.
- Whether "cumulative" means "read `pause_duration` directly" or "accumulate
  it manually across cycles" is exactly the pending multi-pause question
  above — **do not implement the correction formula until that's answered**.

## Recommendation (revised)

**Default (v1, all tenants unless configured otherwise): Option A, keyed on
absolute lead time**, with the short-SLA guard above (fall back to
percentage when lead time isn't meaningfully smaller than the SLA's total
duration). No new scheduled job; a BR on `task_sla` comparing time-to-breach
against a configurable `companion_policy` lead-time setting (default e.g.
60 minutes, per-SLA-definition override left open for later).

**Percentage as an equally real, independently configurable trigger type**
(off by default), for the short-SLA guard case and for customers with a
contractual/compliance need for it. When percentage mode is active on a
long-duration SLA, **Option C's precomputed-`fire_at` idea is the correct
implementation for that specific combination** — not a general-purpose
replacement for Option A, a targeted answer to a scoped-down problem.

**Why this is different from the original recommendation (Option C
generally)**: the original recommendation optimized for making percentage
detection latency-independent of SLA duration, in general. The reframing
establishes that percentage-as-a-*default*-trigger was the wrong target
from the start; Option A resolves the default case better than Option C
ever could (zero new infrastructure, working with the platform's own
absolute-time model), and Option C's actual value is narrower than
originally scoped — it matters only where percentage mode is deliberately
enabled on a long SLA.

## The short-SLA clamp is the primary path, not an edge case

Refinement 1 (above) proposed `lead_time_floor_ratio` to guard the naive
`min()` formula for SLAs shorter than the configured lead time. **Stated
plainly with the real distribution as evidence, not hedged as a corner
case**: per `sla-definition-survey.js`, all 13 active SLA definitions on
this instance run 15 minutes to 2 days, with **none** anywhere near 30
days. Against the default 60-minute lead time, **every SLA definition
under 2 hours total duration** is short enough to trip the clamp — on this
instance's real distribution, that's a majority of the surveyed
definitions, not a handful of outliers. **The clamp governs the common
case, not the exception**: for most SLAs this instance actually has, the
"effective lead time" that fires a notification is `sla_total_duration *
lead_time_floor_ratio` (i.e., 50% of duration at the default ratio), not
the nominal 60-minute default at all. Any implementation, testing, or
documentation that treats the clamp as a rarely-hit fallback path is
building for the wrong common case — it needs the same level of scrutiny
as the unclamped path, arguably more, since it's what most configured SLAs
will actually run through.

## What would change this recommendation

- **Reopened, not superseded** (see "Correction to the correction" above):
  the tiering hypothesis was wrongly withdrawn — the eight named jobs are
  real on this instance, by name, per the user's `sys_trigger` screenshot.
  The original question ("do the 1hr/1day tiers run coarser than
  acceptable") is back open, pending `sla-trigger-queue.js`'s output for
  real repeat intervals. Separately, still worth answering regardless of
  what the tiers turn out to be: **what actually refreshes
  `business_percentage`/`stage`, and how often** — needs a direct test
  (watch fields change in real time), not job-metadata inference alone.
- **Resolved (see "Finding 3 resolved" above)**: `task-sla-pause-fields.js`
  has now been run through a real before/paused/resumed cycle on a clean
  record. `planned_end_time` does not move; `pause_duration` materializes
  only on resume; `percentage` (calendar) and `business_percentage`
  (schedule) diverge severely. **Still open, narrower now**: whether
  `pause_duration` accumulates across multiple pauses or resets each time —
  pending a follow-up multi-pause test — and whether mixing a
  schedule-aware `planned_end_time` with a calendar-based `pause_duration`
  in the correction formula is actually safe, which depends on the
  still-unverified mechanism behind `planned_end_time`'s schedule-awareness
  (Conclusion 4).
- **Resolved**: `sla-definition-survey.js` shows the 13 real SLA
  definitions on this instance range 15 minutes to 2 days, none near 30
  days. The long-SLA percentage/Option-C discussion is confirmed
  low-priority on this evidence — build it only if a customer actually
  configures percentage mode on a long SLA, not speculatively ahead of
  that.

**No implementation until this recommendation is approved.**
