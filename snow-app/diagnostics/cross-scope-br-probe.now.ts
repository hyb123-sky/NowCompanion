import { BusinessRule } from '@servicenow/sdk/core'

// Deploy-time probe, NOT part of the deployable app - this directory is
// outside src/fluent (the configured Fluent source directory), so
// `now-sdk build` never picks it up on its own. See ./README.md for how to
// actually run this.
//
// Purpose: empirically confirm whether this scope can create a Business
// Rule against the global-scope `incident` table, and - with Runtime
// Access Tracking set to Tracking - what actually shows up in
// sys_scope_privilege when it executes. Design-time creation via Studio
// does not prove runtime execution; this probe is what proves it.
//
// active is true here (unlike the disabled version this replaces) because
// an inert BR can never be triggered to test runtime execution. Its
// condition is scoped as narrowly as possible so it does nothing observable
// beyond the sys_scope_privilege record it may generate.
export const crossScopeBrProbe = BusinessRule({
    $id: Now.ID['diagnostic.cross_scope_br_probe'],
    name: 'NowCompanion - cross-scope BR probe (diagnostic, remove before shipping)',
    table: 'incident',
    when: 'before',
    active: true,
    condition: 'false',
    action: ['insert', 'update'],
    script: function (_current, _previous) {
        // intentionally empty - condition: 'false' means this never
        // actually runs during normal use; only a manual trigger (see
        // README) with the condition temporarily relaxed exercises it.
    },
})
