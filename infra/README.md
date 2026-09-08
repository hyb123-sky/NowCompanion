# infra

Bicep for Azure Container Apps, Key Vault, SQL, and App Insights. Empty in
Phase 0.

Constraint fixed now for when Phase 2 writes these templates: Phase 2 must be
fully testable **without** a live Azure subscription (SQL Server in a local
container, an emulated/dev Entra tenant, a fake ServiceNow server double). A
live subscription is only required at the end of Phase 2 to validate the
Bicep deploy itself. CI-to-Azure auth uses GitHub OIDC federated credentials
(see ADR-0001), never a stored service-principal secret.
