# write-scripts — WRITE-CAPABLE. PDI ONLY.

Everything in `../scripts/` is read-only, by design and by header comment,
and is safe to read before running for that reason. **The scripts in this
folder are not read-only** — each one inserts, and in the failure branch may
leave, rows in `x_1821654_buddy_companion_policy`,
`x_1821654_buddy_companion_user_map`, or `x_1821654_buddy_companion_outbox`.

**Do not run these against any instance other than the PDI
(`dev310526`).** They exist for one purpose: PR-2's three companion tables
enforce their uniqueness rules (single active policy record, unique
`sys_user` on the user map, unique `(idp_issuer, idp_subject)` pair, unique
`idempotency_key` on the outbox) at the schema level, with no Business Rule.
The generated dictionary XML was inspected and shows the unique indexes are
declared exactly as intended (see `snow-app/src/fluent/tables/README.md`),
but a declared index and platform enforcement of that index are two
different claims — these scripts insert a real conflicting row and observe
whether the platform actually rejects the second one.

## Why these exist instead of ATF

The tables' own ATF suite is blocked: `@servicenow/atf-fluent` is pinned at
`2.0.5` (the only version ever published) against
`@servicenow/sdk@3.0.3`, and any `Test()` with at least one step crashes
`now-sdk build` with `Cannot read properties of undefined (reading
'record')`. A scratch-directory experiment (SDK `4.11.2` + the same
`atf-fluent@2.0.5`) built the identical step cleanly — see
`docs/adr/0005-sla-threshold-detection-strategy.md`'s revision history and
`docs/definition-of-done.md` for what that does and does not settle. Until
an ATF suite actually runs against this project, these scripts are **manual,
non-repeatable interim evidence**, not a substitute for one — record every
run's outcome in `docs/definition-of-done.md`, don't just note that a script
exists.

## Scripts

- `policy-second-active-rejected.js` — inserts one active
  `companion_policy` record, then attempts a second, asserts the second is
  rejected. Aborts without writing anything if a real active policy record
  already exists.
- `user-map-duplicate-sys-user-rejected.js` — inserts two
  `companion_user_map` rows for the **same** `sys_user` (different
  `idp_issuer`/`idp_subject` pairs, to isolate this from the composite
  index), asserts the second is rejected.
- `user-map-duplicate-idp-pair-rejected.js` — inserts two
  `companion_user_map` rows for the **same** `(idp_issuer, idp_subject)`
  pair but **different** `sys_user`, asserts the second is rejected.
- `outbox-duplicate-idempotency-key-rejected.js` — inserts two
  `companion_outbox` rows with the same `idempotency_key`, asserts the
  second is rejected.

Each script cleans up every row it creates (including a row that should
have been rejected but wasn't, so a failed assertion never leaves duplicate
data behind) and prints a `Cleanup complete.` line at the end. **If a script
does not print that line, the instance is not clean — check the table
manually before running anything else against it.** All test rows use an
`idp_issuer`/`event_type`/`idempotency_key` value prefixed `CLAUDE_TEST_` so
they are identifiable if cleanup is ever interrupted partway (e.g. the PDI
session times out mid-script).

These require PR-2's tables to already be deployed to the PDI
(`now-sdk install`) before running.
