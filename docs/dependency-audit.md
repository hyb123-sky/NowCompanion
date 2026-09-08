# Dependency Audit

## Strategy

Production and dev-toolchain dependencies are audited separately, because
they carry different consequences and different urgency:

- **Production dependencies** (`npm audit --omit=dev --audit-level=high`) —
  code that ships and runs as part of the product. This is a **blocking**
  step inside `live2d-web.yml` and `snow-app.yml`'s existing job — a
  high/critical finding here fails the PR. This is the number that goes on
  the security questionnaire as "zero known critical findings in shipped
  dependencies," backed by CI.
- **Dev-toolchain dependencies** (`npm audit`, full tree) — build/lint/test
  tooling that never ships. Reported by the separate, **non-blocking**
  `dependency-audit.yml` workflow (`continue-on-error: true`), which uploads
  a JSON report per package as a workflow artifact. Findings here are worth
  tracking (a compromised build tool is still a supply-chain risk) but
  shouldn't block a PR on a transitive dependency of, say, ESLint.

Never run `npm audit fix --force` on `snow-app` — it would bump
`@servicenow/sdk` to a version outside what's been used/verified, which is a
bigger risk than the advisories it "fixes."

## Refreshing this document

This file is **updated by hand**, not auto-committed from CI. When package
versions change meaningfully (a `package-lock.json` update, a new
dependency), re-run `npm audit` and `npm audit --omit=dev` in the affected
package and update the snapshot below. (A bot-commit workflow that updates
this file automatically was considered and deliberately not built for
Phase 0 — auto-committing from CI adds a write path into the repo that
wasn't worth the complexity yet; revisit if the manual step starts getting
skipped.)

## Snapshot (2026-09-08)

| Package | Production deps (blocking gate) | Dev-toolchain (informational) |
|---|---|---|
| `client/live2d-web` | 0 vulnerabilities (no runtime dependencies yet) | 5 vulnerabilities (3 moderate, 1 high, 1 critical) — transitively via `vite`/`vitest`/`esbuild` |
| `snow-app` | 0 vulnerabilities (`@servicenow/sdk` and all current deps are dev-only) | 31 vulnerabilities (3 low, 11 moderate, 12 high, 5 critical) — transitively via `@servicenow/sdk`'s dependency tree (includes `keytar`, `libxmljs2`, and others pulling native/legacy transitive deps) |

Both packages currently have **zero production dependencies at all** — this
is Phase 0 scaffolding (a build-time SDK wrapper and a Vite/Vitest shell).
The blocking gate is real infrastructure but has nothing to actually block
yet. It starts doing real work once:

- Phase 3 adds a Live2D Cubism SDK runtime dependency to `live2d-web`'s
  `dependencies` (not `devDependencies`).
- Any future runtime npm dependency is added to either package.

The `@servicenow/sdk` dev-toolchain findings are a known, recorded item —
not fixed as of this snapshot, not blocking, but should be named explicitly
in the security questionnaire as "build-time tooling, not shipped in the
product."
