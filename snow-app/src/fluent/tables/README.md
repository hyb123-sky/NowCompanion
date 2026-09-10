# tables

`companion_policy`, `companion_outbox`, `companion_user_map` — schema only.

**ATF is not included in this PR.** `@servicenow/atf-fluent` is pinned at
`2.0.5` — the only version ever published — while every other
`@servicenow/*` package in this project is `3.0.3`. Building any ATF `Test()`
with at least one step (verified with the simplest possible step,
`atf.server.log`, and with a static literal table name like `incident` to
rule out anything specific to these tables) crashes `now-sdk build` with
`Cannot read properties of undefined (reading 'record')` — an internal
error inside the ATF plugin, not a mistake in the test code (an empty
`Test()` with no steps builds fine; the crash is specifically in step
composition). This is a genuine version-skew bug in the installed toolchain,
not something fixable by changing how these tables or a test are written.

Confirmed empirically, not assumed:
- `Test({...}, (atf) => {})` with zero steps builds cleanly.
- Any step call (tried `atf.server.recordInsert` and `atf.server.log`)
  crashes the same way, regardless of table name (tried both a computed
  scope-prefixed name and the static literal `'incident'`).
- `@servicenow/atf-fluent` has exactly one published version (`2.0.5`) —
  checked via `npm view @servicenow/atf-fluent versions`; there is no
  matching `3.0.3` release to upgrade to.

**Update — scratch-directory experiment (not applied to this project):** a
throwaway project, `@servicenow/sdk@4.11.2` + the same
`@servicenow/atf-fluent@2.0.5`, built the identical single-step test
(`atf.server.log`) cleanly — no crash. The crash is a defect in this
project's `3.0.3` build toolchain, not something intrinsic to
`atf-fluent@2.0.5`. **This project is not being upgraded to SDK 4.x on the
strength of one scratch test** — that's a real decision with its own blast
radius, for a later, explicit call. Separately, `now-sdk transform` (the
maintained replacement for deprecated `now-sdk fetch`) can in principle
convert instance-authored ATF records into Fluent source; an offline probe
against the SDK's own bundled ATF test fixtures hit a different error in
the same package, inconclusively — plausibly just missing a stock
dependency record the fixture doesn't include, not a confirmed dead end.
Full account: `docs/definition-of-done.md` ("A13 in detail").

The single-active-record, dual-uniqueness, and rejection behaviors these
tests were meant to prove are verified two ways short of ATF: structurally
(the generated dictionary XML for all three tables was inspected directly —
the unique indexes are present exactly as declared), and empirically via
four manual, non-repeatable write-capable scripts
(`snow-app/diagnostics/write-scripts/`) that insert a real conflicting row
and observe the platform reject it. Neither is a substitute for ATF running
in CI — see `docs/definition-of-done.md` A13 for why that distinction
matters.
