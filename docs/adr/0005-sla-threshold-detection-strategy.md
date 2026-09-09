# ADR-0005: SLA Notification Trigger Strategy

- Status: **Proposed — awaiting approval. No implementation in this PR or
  any PR until this is explicitly approved.**
- Date: 2026-09-09 (revised same day — reframed from "detect 80%" to
  "detect an absolute lead time before breach"). **Revised again
  2026-09-11**: the diagnostic scripts were run; the tiering hypothesis the
  reframing leaned on is withdrawn (it doesn't match this instance), the
  core recommendation is unchanged and, if anything, reinforced by the real
  SLA-duration survey. Recommendation still Proposed, not Accepted.

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
it?** **Superseded — the tiering hypothesis this answer relied on has been
withdrawn** (see "PDI script results" above; the five named tiers don't
exist on this instance). **[measured, incomplete]** The two real,
frequently-running SLA-adjacent jobs found cadence every 1-5 minutes; if
either refreshes the fields Option A reads, latency is plausibly single-
digit minutes, but this is not confirmed — neither job's actual effect on
`business_percentage`/`stage` has been checked. This needs a direct test
(watch a record's fields across a few minutes, or check what a job's
script actually touches), not more querying of job metadata.

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

**[withdrawn]** This section originally asserted an eight-job tiered OOB
schedule here. That assertion did not survive an actual query against the
instance — see "PDI script results" above for what's really there and for
the corrected, honest state of this evidence. Left as a marker rather than
silently deleted, so the correction is visible in the ADR's own history,
not just in a commit message.

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
(detection latency bounded by a coarse "30 days" tier) relied on the now-
withdrawn tiering hypothesis. What still holds without it: percentage mode
on a long SLA depends on *whatever* mechanism refreshes
`business_percentage` for that record, at *whatever* cadence that turns out
to be for a row far from breach — unmeasured, not assumed coarse or fine.
Per the real SLA-definition survey (above), this scenario doesn't currently
exist on this instance at all (no SLA definition anywhere near 30 days), so
it's scoped down for a different reason now: not just "opt-in," but
"unobserved in the one real sample available."

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

## What would change this recommendation

- **Superseded**: the original tiering-based question ("do the 1hr/1day
  tiers run coarser than acceptable") no longer applies — those tiers
  aren't confirmed to exist. Replaced by: **what actually refreshes
  `business_percentage`/`stage`, and how often** — still open, needs a
  direct test (watch fields change in real time), not job-metadata
  inference.
- `task-sla-pause-fields.js` was run once, on a record that never paused
  (`pause_duration`/`pause_time` both blank) — it did not answer whether
  `pause_duration` reliably tracks total paused time. Still open; needs
  the original three-part before/while-paused/after-resume comparison,
  not a single snapshot.
- **Resolved**: `sla-definition-survey.js` shows the 13 real SLA
  definitions on this instance range 15 minutes to 2 days, none near 30
  days. The long-SLA percentage/Option-C discussion is confirmed
  low-priority on this evidence — build it only if a customer actually
  configures percentage mode on a long SLA, not speculatively ahead of
  that.

**No implementation until this recommendation is approved.**
