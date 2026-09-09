import { BusinessRule } from '@servicenow/sdk/core'

// Deploy-time probe only - not a real feature. Proves (or disproves) that
// this scope can create a Business Rule against the global-scope `incident`
// table before PR-4 commits to that design for the ITSM pack. Inactive, so
// it can never execute even if deployed; PR-1 removes/replaces this once the
// cross-scope-access finding is recorded. See docs/adr and
// docs/servicenow-compatibility.md for the result.
BusinessRule({
    $id: Now.ID[0],
    name: 'NowCompanion - cross-scope BR probe (inert)',
    table: 'incident',
    when: 'before',
    active: false,
    action: ['insert'],
    script: function (current, previous) {
        // intentionally empty - active:false means this never runs
    },
})
