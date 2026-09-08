# Third-Party Licenses

Every external dependency that ships in a build (not just dev-time tooling)
must have a row here before it lands in a PR, per `CLAUDE.md`. Review terms
before adding, don't backfill after the fact — Live2D in particular must be
reviewed before Phase 3 starts.

| Dependency | Version | License | Notes |
|---|---|---|---|
| Live2D Cubism SDK for Web | TBD (selected in Phase 3) | Live2D Proprietary — **Free/Evaluation Material License** for Phase 3 MVP | Free tier is scoped to evaluation/small-scale commercial use under Live2D's published thresholds (revenue/user-count caps); re-review before any commercial launch to confirm whether a paid Cubism license is required at that point. Renderer is behind an `ICharacterRenderer` abstraction (Phase 3 ADR) specifically so the licensed SDK is swappable, not load-bearing across the whole client. |

## Pending review

- .NET/NuGet package licenses (MSAL.NET, EF Core, Serilog, SignalR client,
  xunit, etc.) — add rows as each is pinned in `Directory.Packages.props`,
  starting Phase 1/2.
- npm packages for the Live2D web layer and the ServiceNow SDK tooling — add
  rows as each is added to a `package.json`.
- Azure OpenAI usage (Phase 5) is a service, not a redistributed dependency,
  but its data-processing terms (Japan East residency) are tracked in
  `docs/threat-model.md` §4 rather than duplicated here.
