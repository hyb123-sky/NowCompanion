# Runbook: reference deployment

Prerequisites: Docker (with Compose), a clone of this repository.

1. From the repo root:
   ```
   docker compose -f deploy/reference/docker-compose.yml up --build
   ```
2. Wait for the build to finish and the container to report it's listening.
3. `curl http://localhost:8080/healthz` — expect `{"status":"ok"}`.
4. `docker compose -f deploy/reference/docker-compose.yml down` to stop.

That's the whole runbook — one endpoint, one container, no configuration
file, no cloud account. This is intentionally the smallest possible proof
that the image builds and runs; it grows only as real functionality
(database, ServiceNow integration) exists to demonstrate.
