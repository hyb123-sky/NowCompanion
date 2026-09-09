# installer

MSIX/MSI via WiX, code-signed, silent install, ADMX policy template for
enforced settings. Deployable through a centrally managed deployment
vehicle (a machine-wide policy store / MDM product — Intune is one
example, not an assumption baked into the architecture; see
`docs/definition-of-done.md` Table B, "Managed enterprise deployment").
Empty as of this writing; see `docs/definition-of-done.md` A9 for what's
verifiable now versus deferred.

Long-lead item to flag early even though it isn't current work: procuring a
code-signing certificate typically takes weeks — start that process well
before it's needed, not at the point A9's signing step needs a real
certificate instead of the self-signed one exercised in CI.
