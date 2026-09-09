# deploy/reference

**Evidence that a deployment path works. Not an architectural commitment.
Any container host can consume the same image.**

See `docs/adr/0006-hosting-neutrality.md`. This directory replaces `/infra`
(deleted — it held only a placeholder README describing a future Bicep
setup, nothing built, so there was nothing to migrate, only an assumption
to remove).

## What's here

- `Dockerfile` — builds and runs the Gateway host. Build from the **repo
  root**, not this directory (`Gateway.Host` has project references outside
  this folder): `docker build -f deploy/reference/Dockerfile -t nowcompanion-gateway .`
- `docker-compose.yml` — runs the Gateway host container. Nothing else is
  composed yet; there's no database schema and no fake ServiceNow server to
  add until Phase 2 actually builds them.
- `RUNBOOK.md` — one page, clean-machine to running container.

## What's not verified

The `dotnet publish` command the Dockerfile uses was run directly on the
host and confirmed to work. The Dockerfile/compose file themselves have
**not** been run — this environment has no Docker installed. Treat both as
unverified until someone with Docker runs them once; if something's wrong,
it's most likely a path or base-image-tag issue, not the underlying .NET
build (that part's confirmed).
