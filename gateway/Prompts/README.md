# Prompts

Versioned prompt files for the AI summary layer (Phase 5), one file per
prompt per version (e.g. `summarize-queue.v1.md`). Prompts are data, not
code — never interpolate record content directly; bind via named parameters
so prompt changes ship without a Gateway redeploy where possible.

Empty in Phase 0; populated when Phase 5 introduces `IAiProvider`.
