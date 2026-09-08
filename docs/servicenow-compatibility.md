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

## Current known gaps

- Not yet verified: whether the ServiceNow SDK (`now-sdk`) tooling used for
  CI build/lint requires an authenticated instance or can run fully offline.
  Until confirmed, the `snow-app` CI lane is lint-only; build/deploy
  verification happens against the PDI (`dev310526`, Australia) manually
  during Phase 1. This file will be updated once the SDK's CI story is
  confirmed.
- N-1 (Zurich) has not yet been provisioned as a test instance; Phase 1's
  ATF run is against the Australia PDI only until a second instance is
  available. Add the Zurich row's verification status here once tested.
