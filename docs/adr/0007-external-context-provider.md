# ADR-0007: External Context Provider

- Status: Accepted
- Date: 2026-09-10
- Narrows: the previously planned AI-provider subsystem (an `IAiProvider`
  abstraction, versioned prompt storage, output-approval audit, a default
  provider assumption) described under ADR-0001's forward-looking decisions
  and the Phase 5 plan.

## Context

The previously planned scope — a provider abstraction over specific
external AI services, versioned prompt management, tenant-configurable
provider/region selection, and an output-approval audit trail — is a
separate, product-sized subsystem in its own right. It is not what this
project is set up to validate (there is no mechanism here for evaluating
summarization quality, prompt safety, or output review at any meaningful
scale), and building it now would be scope invented ahead of any evidence
it's needed in this shape.

## Decision

Replace the AI-provider subsystem with a narrow **`IContextProvider`**
interface (likely MCP-client shaped — the provider is called for context,
not orchestrated as part of this system's own request pipeline), plus a
local stub implementation. The real provider is treated as an external
system, integrated later, not designed here.

**Integration contract** (defined now, because a narrow interface still
needs a real contract to be more than a name):

- **What is sent**: a disclosure-filtered context payload — exactly the
  fields the tenant's `companion_policy` disclosure level permits, nothing
  else. The provider never receives unfiltered record content.
- **What is expected back**: an opaque text/structured result, treated as
  a summary to display, not as something this system parses for control
  flow. No schema is assumed about the provider's internals.
- **Unavailable or slow provider**: the call has an explicit timeout.
  **A degraded provider must never block event delivery** — the
  notification/outbox path does not wait on `IContextProvider` for
  anything; a summarization request is a separate, on-demand call whose
  failure surfaces as "summary unavailable," not as a delay or failure of
  the underlying event.
- **Failure behavior**: a failed or timed-out call is logged (correlation
  id, provider id, failure reason — never the request payload's business
  content) and surfaced to the caller as a clear failure state, not a
  silent empty result — the same "fail loud, not silent" discipline
  established for the identity-mapping 403 in ADR-0003.

Remove the AI-provider abstraction, versioned prompt storage, and the
"AI"-specific framing from the plan and the phase list (`CLAUDE.md` Phase 5
now describes external context integration via `IContextProvider`, not an
AI subsystem). `gateway/Prompts/` is deleted — it existed specifically for
versioned prompt storage under the removed design; `IContextProvider`'s
narrow contract above has no equivalent need (there's no prompt template
this system owns once the provider is external and MCP-client shaped).

## `/context` in the scoped app stays, unchanged and unrenamed

`/context` is the **data-egress contract** — what may leave ServiceNow, and
at which disclosure level. That is orthogonal to who or what consumes the
result. Stated here explicitly so this endpoint is never later mistaken
for an AI-specific one: it existed, and is scoped the way it is, because of
the disclosure-level policy gate (non-negotiable #5), independent of
whether the consumer is `IContextProvider`'s stub, a real external
provider, or something else entirely later.

## PR-2 schema delta

Exactly two items on `companion_policy` — nothing else added under this
ADR:

- Rename `ai_enabled` → `external_context_enabled`.
- Add `context_provider_id` (string, default `"stub"`), used to constrain
  which providers are permitted for a tenant.

## Data-egress audit stays in scope

"It's an external system" is not a reason to skip auditing the boundary —
the boundary (what left ServiceNow, at which disclosure level, when, to
which `context_provider_id`) is the part this project owns, regardless of
what's on the other side of it. This audit trail is part of the same
tamper-evident hash chain established in ADR-0006, not a separate
mechanism.

## Consequences

- Threat model boundary 4 is renamed "Gateway ↔ External Context Provider"
  and its rows rewritten around this narrower, provider-agnostic contract
  — see `docs/threat-model.md`.
- `docs/licenses.md`'s note about a specific external AI service's
  data-processing terms is removed; there is no specific provider committed
  to yet under this design, so there's nothing to license-track until one
  is chosen for real integration.
- Phase 5's actual work shrinks: the stub `IContextProvider` and its
  degraded-mode contract are what Phase 5 delivers, not a full multi-
  provider abstraction with prompt versioning.
