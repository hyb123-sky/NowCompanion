# Definition of Done

Replaces `CLAUDE.md`'s earlier "Enterprise hardening" Phase 6 checklist and
the earlier "v1.0 (sellable)" list. Everything below is either verifiable
by one person with no external dependencies (Table A), explicitly deferred
because it requires something not currently available (Table B), or named
as a known unknown that must never be written as met.

Two items in the transcription below are flagged as **not fully
verifiable as originally written** — noted in place, not silently
weakened, per the instruction that produced this document.

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
| A9 | Install, first login, and uninstall | **Windows Sandbox** (built in, free): install from the built artifact, sign in with a development IdP (free-tier tenant or a Keycloak container), see the first event. Then uninstall. The signing step is exercised **in the pipeline with a self-signed certificate now**. | No manual configuration file; completes within N minutes; steps documented. Signing does not break the package. **After uninstall, the A6 snapshot diff is empty apart from whitelisted entries.** ⚠️ **Flagged, not silently fixed**: this criterion as written is self-contradictory. A6's whitelist (credential-manager entry, logs, settings file) describes what's acceptable to find **while the app is installed and in use**. After uninstall, those entries should be **gone**, not present — an uninstalled app that leaves a credential-manager entry behind is a real finding, not a pass. A9 needs its own, narrower whitelist (most likely: empty, full stop — or at most a log file explicitly kept for post-uninstall diagnostics, if that's ever wanted) rather than reusing A6's. Not corrected here because choosing that narrower whitelist is a product decision, not a documentation fix. |
| A10 | Reference deployment path | Clean machine, `compose up`, end to end. | One event travels from ServiceNow to the desktop. |
| A11 | Stability and interruption cost under real use | See below. | See below. |
| A12 | Policy delivery channel — **a Phase 3 design decision, not a later one** | Client reads policy from two sources: a local policy registry path and server-side policy. Enforced local values win on conflict. Verify with local Group Policy on a single machine (an ADMX can be loaded into the local policy editor without a domain). | Server-side change takes effect on the client; a locally enforced lock causes a server-side change to be refused, with a log entry naming the source that won. |

The zero-cost practices already in place — production-dependency audit
gate, STRIDE model, ADR discipline, measured/reasoned tagging — are the
**evidence chain** for Table A. They are not downgraded and not optional.

### A11 in detail — long-term self-use

**Record daily:** crashes or hangs per week; notifications per day; click-
through (opened the record vs. dismissed); false fires (fired, judged
irrelevant); latency from source event to desktop (P50/P95); memory and CPU
over an 8-hour session.

**Threshold rule — do not invent a number up front.** Week 1 collects data
only, no judgement. At the end of week 1, take the observed median
click-through, **write it into this document as the fixed baseline, and do
not change it afterwards**. Week 2 is judged against that baseline.

**Pass:** two consecutive weeks with zero crashes; week-2 click-through not
below the week-1 baseline; false fires = 0; memory growth under 20% over
8 hours.

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
