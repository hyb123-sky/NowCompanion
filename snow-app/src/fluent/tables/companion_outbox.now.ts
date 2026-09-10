import { ChoiceColumn, DateTimeColumn, ReferenceColumn, StringColumn, Table } from '@servicenow/sdk/core'
import config from '../../../now.config.json'

// One row per deliverable event. Domain-agnostic (non-negotiable #7 / PR-3
// acceptance criteria): `event_type` is a plain string with a registry
// (defined in PR-3's core Script Include), not a choice/enum, so a second
// domain pack never needs a schema change here. `payload` is a generic
// envelope plus pack-specific body, written already disclosure-filtered at
// insert time - never filtered at read time. No index or field here
// presumes ITSM; `source_table`/`source_sys_id` are generic pointers valid
// for any task-derived table.

const scope = config.scope

export const companion_outbox = Table({
    name: `${scope}_companion_outbox`,
    label: 'Companion Outbox',
    schema: {
        target_user: ReferenceColumn({
            label: 'Target user',
            mandatory: true,
            referenceTable: 'sys_user',
        }),
        event_type: StringColumn({
            label: 'Event type',
            mandatory: true,
            maxLength: 100,
            hint: `Registry string (PR-3 core Script Include), not a choice/enum - domain packs add values without a schema change.`,
        }),
        source_table: StringColumn({
            label: 'Source table',
            mandatory: true,
            maxLength: 80,
        }),
        source_sys_id: StringColumn({
            label: 'Source sys_id',
            mandatory: true,
            maxLength: 32,
        }),
        payload: StringColumn({
            label: 'Payload',
            maxLength: 4000,
            hint: `Generic envelope plus pack-specific body, written already disclosure-filtered (companion_policy.disclosure_level) at insert time. A summary/context envelope, not a full record dump - large content is out of scope by design.`,
        }),
        state: ChoiceColumn({
            label: 'State',
            mandatory: true,
            default: 'new',
            dropdown: 'dropdown_without_none',
            choices: {
                new: { label: 'New' },
                delivered: { label: 'Delivered' },
                acked: { label: 'Acked' },
            },
        }),
        created_on: DateTimeColumn({
            label: 'Source event created on',
            hint: 'Timestamp of the underlying source event, distinct from sys_created_on (when this outbox row itself was inserted).',
        }),
        expires_at: DateTimeColumn({ label: 'Expires at' }),
        idempotency_key: StringColumn({
            label: 'Idempotency key',
            mandatory: true,
            unique: true,
            maxLength: 64,
            hint: 'Client dedupe key (Definition of Done A3): every event delivered exactly once.',
        }),
    },
})
