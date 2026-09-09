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

Options going forward (not decided here): pin to the newer `4.x`
`@servicenow/sdk` line the CLI has been suggesting throughout this project,
in case it pulls a compatible `atf-fluent`; write these tests against the
ServiceNow ATF UI/API directly instead of Fluent; or wait and track upstream.
The single-active-record, dual-uniqueness, and rejection behaviors these
tests were meant to prove are already verified structurally (the generated
dictionary XML for all three tables was inspected directly — the unique
indexes are present exactly as declared), just not proven end-to-end via
ATF yet.
