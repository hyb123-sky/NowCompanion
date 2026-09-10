# Definition of Done

Replaces `CLAUDE.md`'s earlier "Enterprise hardening" Phase 6 checklist and
the earlier "v1.0 (sellable)" list. Everything below is either verifiable
by one person with no external dependencies (Table A), explicitly deferred
because it requires something not currently available (Table B), or named
as a known unknown that must never be written as met.

Two items were flagged as not fully verifiable as originally written and
have since been resolved by explicit decision (A9's two-whitelist split,
A11's threshold-pending-baseline rule) — both noted in place below, with
the decision that closed them.

## Table A — Technical acceptance (verifiable by me, now)

| # | Item | Method | Pass criteria |
|---|---|---|---|
| A1 | Cross-tenant isolation | A tenant is a Gateway concept; one ServiceNow instance = one tenant. With only one instance available: register it as two tenant records with distinct OAuth clients. Identical underlying data is fine — the assertion is about the tenant label, not content. Additionally use the fake ServiceNow server to serve two different datasets. | Inject N events per tenant, one client connected per tenant, cross-delivery = 0. **Mutation test mandatory**: deliberately remove the tenant filter and the test must turn red. A test that cannot fail proves nothing. |
| A2 | Same-tenant cross-user isolation | Two users on the instance, each mapped, each assigned work items. ATF at the ServiceNow layer with a tampered subject; Gateway layer with a forged-claim token. | ServiceNow layer: tampered subject → 403. Gateway layer: forged token rejected **during validation**, not during filtering. Assert which layer rejected it. |
| A3 | Outbox: no loss, no duplication | 50 rows inserted in one transaction; kill the Gateway mid-poll and restart; simulate a network drop. | Client receives every event **exactly once** by idempotency key; zero events lost. |
| A4 | Version-drift failures are loud | **Two distinct sub-items, kept visually separate so neither is mistaken for gating the other:** (a) a schema-probe endpoint reports platform version and field presence; the contract test suite runs daily against it. (b) *Opportunistically, not as a scheduled deliverable* (upgrade timing isn't under anyone's control): if a platform family upgrade happens on the instance during development, run the suite against it. | (a) — **fully verifiable now**: deleting a field in the fake server turns CI red with a **named error**, not a silent null. (b) — **opportunistic only**: no pass/fail date; record what happened if and when it occurs. |
| A5 | The policy surface actually constrains | ATF assertions for each of the three disclosure levels: the outbox payload contains only permitted fields. Gateway independently rejects a non-compliant payload. | Mutation test: write a forbidden field → both layers fail independently. |
| A6 | Client persists nothing | Test fixture snapshots `%LOCALAPPDATA%`, `%APPDATA%`, `%TEMP%`, and HKCU before and after login + N events. **WebView2 maintains its own user-data folder and will cache there** — point it at a temp directory and clear on exit; the test must be able to catch this specific case. | Diff contains only whitelisted entries: credential-manager entry, logs with no record content, settings file with no business data. |
| A7 | Logs contain no record content | Inject sentinel strings into event content; grep all Gateway and client log output, including crash and debug output. | Sentinel hits = 0. |
| A8 | Error recovery and observability | In sequence: kill the Gateway; drop the network; expire the token; have ServiceNow return 5xx. | Client recovers within X seconds with no manual intervention; every failure path emits a structured event with a correlation id; a health endpoint reports poll lag. |
| A9 | Install, first login, and uninstall | **Windows Sandbox** (built in, free): install from the built artifact, sign in with a development IdP (free-tier tenant or a Keycloak container), see the first event. Then uninstall. The signing step is exercised **in the pipeline with a self-signed certificate now**. | No manual configuration file; completes within N minutes; steps documented. Signing does not break the package. **Two separate whitelists, resolved (2026-09-11)**: the *runtime* whitelist is A6's (credential-manager entry, content-free logs, business-data-free settings file — acceptable while the app is installed and in use). The **post-uninstall whitelist is empty** — uninstall must remove the credential-manager entry and all application-written state; nothing from A6's runtime whitelist carries over. If a case is found where something legitimately must survive uninstall, it is named explicitly and decided on its own merits, not added here silently. |
| A10a | Reference deployment path — image builds and runs | CI (`deploy-reference` job, `ubuntu-latest`, Docker available natively): build the image from `/deploy/reference`, start it via the compose file, hit the health endpoint, assert a response, tear down. Continuous evidence on every PR touching `/deploy/reference` or the Gateway, not a one-off local check. | **Verified once this CI job is green.** Proves: image builds, container starts, health endpoint responds. Does **not** prove A10b. |
| A10b | Reference deployment path — full end-to-end | Clean machine, `compose up`, real ServiceNow instance, real IdP, real desktop client, one event travels from ServiceNow to the desktop. | **Unverified — reason stated, not implied otherwise.** Requires the Gateway's real ServiceNow/IdP integration and the client to exist (Phase 2/3); a green A10a does not imply this works. Do not let a green build stand in for this. |
| A11 | Stability and interruption cost under real use | See below. | See below. |
| A12 | Policy delivery channel — **a Phase 3 design decision, not a later one** | Client reads policy from two sources: a local policy registry path and server-side policy. Enforced local values win on conflict. Verify with local Group Policy on a single machine (an ADMX can be loaded into the local policy editor without a domain). | Server-side change takes effect on the client; a locally enforced lock causes a server-side change to be refused, with a log entry naming the source that won. |
| A13 | PR-2 companion tables' schema-level constraints actually enforced | **Interim only — see below.** Four write-capable Background Scripts (`snow-app/diagnostics/write-scripts/`), each run once by hand on the PDI: second active `companion_policy` record, duplicate `sys_user` on `companion_user_map`, duplicate `(idp_issuer, idp_subject)` pair, duplicate `companion_outbox.idempotency_key`. | All four rejections observed and pasted back. **Manual, non-repeatable interim evidence, not a substitute for ATF** — see "A13 in detail" below for why, and for what closes this properly. |

The zero-cost practices already in place — production-dependency audit
gate, STRIDE model, ADR discipline, measured/reasoned tagging — are the
**evidence chain** for Table A. They are not downgraded and not optional.

### A11 in detail — long-term self-use

**Record daily:** crashes or hangs per week; notifications per day; click-
through (opened the record vs. dismissed); false fires (fired, judged
irrelevant); latency from source event to desktop (P50/P95); memory and CPU
over an 8-hour session.

**Threshold rule — do not invent a number up front (resolved 2026-09-11).**
Week 1 collects data only, no judgement — including click-through: **report
the metric with its sample size (n) alongside it, every time**, never a bare
percentage. The pass threshold for click-through is set by the project
owner *after* week-1 volume is observed, and is recorded here as
**"threshold pending observed baseline"** until that happens — not as a
number now, and not as "week-1 median" assumed to be an adequate baseline
sight unseen (a low-volume week makes a bare median noise, not signal; see
the limit below).

**Pass (partial — click-through threshold still pending):** two consecutive
weeks with zero crashes; false fires = 0; memory growth under 20% over
8 hours. Click-through's pass/fail line is not set until week-1 (n, metric)
is reported and the project owner sets the threshold explicitly.

**Honest limits, written into this document:** n = 1; a single instance;
the developer and the user are the same person. The bias is known. This
demonstrates "not obviously broken." It does not demonstrate "good."
**Additional limit, not in the original instruction but worth stating
plainly**: if week-1 notification volume is very low (a handful of events),
a "median click-through" over that few data points is noise, not a
baseline — this is a real risk given the product is still pre-Phase-4 and
notification volume depends entirely on how much real ITSM work flows
through in that week. No minimum-n threshold is proposed here (that would
be inventing a number this document explicitly says not to invent); it's
recorded as a limit to watch for, alongside n=1.

### A13 in detail — why interim, and what closes it properly

PR-2's ATF suite is blocked: `@servicenow/atf-fluent` is pinned at `2.0.5`
(the only version ever published) against this project's
`@servicenow/sdk@3.0.3`, and any `Test()` with at least one step crashes
`now-sdk build` with `Cannot read properties of undefined (reading
'record')` — see `snow-app/src/fluent/tables/README.md`. Until that's
resolved, the four scripts in `snow-app/diagnostics/write-scripts/` are the
only evidence that the unique-index constraints these tables declare are
actually enforced by the platform, not just declared in schema.

**This is explicitly weaker evidence than ATF, not a substitute for it**:
each script is run once, by a human, on one instance, and is not part of
CI — a future change that breaks one of these constraints will not turn
anything red until someone remembers to re-run the script by hand. Record
each run's outcome (pass/fail, date, who ran it) here or in the PR, not just
"a script exists for this."

**What would close this properly, investigated but not yet acted on:**
- A scratch-directory experiment (SDK `4.11.2` + the same
  `atf-fluent@2.0.5`, not upgraded in this project) built the identical
  single-step ATF test that crashes under `3.0.3` — cleanly, no crash. This
  is real, reproduced evidence that the crash is a `3.0.3`-toolchain defect,
  not something intrinsic to `atf-fluent@2.0.5` itself. It does **not**
  mean upgrading this project to SDK 4.x now — a major-version jump is its
  own blast radius, untested against everything else this project depends
  on, and this single test does not clear that bar. It does mean "wait for
  upstream" is no longer the only option on the table.
- `now-sdk transform` (the maintained replacement for the deprecated
  `now-sdk fetch`) can, in principle, convert instance-authored ATF records
  (`sys_atf_test`/`sys_atf_step`) into Fluent source — the SDK's own test
  suite ships fixtures for exactly this. An offline probe against those
  fixtures reached a **different** error inside the same `atf-fluent`
  package (`TestPlugin.js`, `transformStep`: "Cannot find a step matching
  config with id"), for a step type (`step_config` "Run Server Side
  Script") that looks like a stock/OOB `sys_atf_step_config` record not
  included in a 2-file test fixture — **inconclusive**, not a confirmed
  dead end: it may simply need the dependency records a real
  instance-connected download would include. Settling this needs a
  human-run `now-sdk transform --auth <alias> --from <scope-sysid>` against
  the PDI, following the established read-only-script pattern (this one
  isn't read-only in the credential sense — it needs `now-sdk auth` — but
  writes nothing to the instance itself).

### Table B — Deferred verification

| Item | Requires something not currently available | Technical groundwork possible now |
|---|---|---|
| Production code-signing certificate | Purchase and identity verification | Signing step exercised end to end with a self-signed certificate (A9) |
| Managed enterprise deployment | A management tenant and enrolled devices | Silent-install parameters work; policy registry path defined and verified locally (A12) — **partially verifiable** |
| Audit evidence compilation | An actual external review process to compile it for | Threat model plus evidence links are the raw material |
| Platform store listing | A partner account | Platform scan rules can be run against a developer instance — **partially verifiable** |
| Penetration test | A third party | None |
| Load and scale | Realistic tenant volume | None — goes on the known-unknowns list |

### Known unknowns — must never be written as met, anywhere

Concurrency and scale. Realistic tenant data distribution. Differences
across platform release families beyond those actually observed. IdP
diversity (only the IdPs actually tested). Real network conditions: VPN,
proxies, TLS inspection. Interaction with endpoint security software.
Accessibility. Localization. Reliability beyond a few weeks. Real
administrators' actual policy requirements.
