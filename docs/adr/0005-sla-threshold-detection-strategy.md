# ADR-0005: SLA Notification Trigger Strategy

- Status: **Proposed — awaiting approval. No implementation in this PR or
  any PR until this is explicitly approved.**
- Date: 2026-09-09 (revised same day — reframed from "detect 80%" to
  "detect an absolute lead time before breach")

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
it?** **[reasoned, structurally argued, quantitatively pending]** A
60-minute-before-breach crossing sits almost exactly on the boundary
between the "within 1 hour" and "within 1 day" tiers. Detection latency is
bounded by whichever tier is actively recalculating the row at that
boundary — most likely "within 1 hour," which is also one of the
more-frequently-run tiers observed (~18,422 runs vs. ~4,208 for "30
days"). **This will be answered numerically once `sla-job-intervals.js`
(below) returns actual interval values** — flagged here rather than
guessed at.

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
have run yet in that window; not confirmed as settled behavior. This
affects both percentage-mode and absolute-lead-time-mode equally, since
both ultimately reason about `planned_end_time`/`business_percentage`.

For a **30-day SLA in percentage mode** specifically: detection latency for
an 80% crossing is bounded by the "30 days" tier's own interval (the
coarsest short of "after 30 days") — this is the scenario the original
framing was solving for, and it's now scoped down to "only matters when a
customer has actually turned percentage mode on for a long SLA," not the
default path every tenant hits.

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

- If `sla-job-intervals.js`'s output shows the "within 1 hour"/"within 1
  day" tiers run coarser than acceptable for a 60-minute default lead time
  (say, tens of minutes rather than a few) — the default lead time itself
  may need to move (e.g., to 90 or 120 minutes) rather than the mechanism
  changing; Option A would still be adequate, just configured differently.
- If `task-sla-pause-fields.js` shows `pause_duration` doesn't reliably
  track total paused time — Option C's percentage-mode implementation (for
  long SLAs with percentage enabled) has no clean correction input, and
  that narrower case would need its own fallback (likely accepting
  imprecise latency for that specific, already-opt-in configuration,
  rather than building a more complex correction mechanism for a
  now-narrow use case).
- If `sla-definition-survey.js` shows real customer SLA definitions are
  overwhelmingly short (hours to a few days), the entire long-SLA
  percentage/Option-C discussion becomes low-priority engineering effort
  relative to its actual usage — worth knowing before investing in it.

**No implementation until this recommendation is approved.**
