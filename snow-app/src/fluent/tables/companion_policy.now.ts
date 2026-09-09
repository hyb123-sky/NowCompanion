import { BooleanColumn, ChoiceColumn, DecimalColumn, IntegerColumn, ListColumn, StringColumn, Table } from '@servicenow/sdk/core'
import config from '../../../now.config.json'

// Instance-level configuration, admin-owned. Exactly one active record is
// enforced at the schema level via `singleton_active_marker`: blank on every
// inactive/historical row, set to the fixed value 'policy' on the (at most
// one) active row, with a unique index on that column. Standard RDBMS
// semantics exempt NULL/blank from unique-index conflicts, so any number of
// inactive rows coexist while at most one can hold the marker value - this
// is what makes "single active record" a database-enforced property rather
// than an application-level convention, with no Business Rule required (see
// this table's ATF suite, which proves a second active insert is rejected).
//
// Two independently configurable notification trigger types (ADR-0005) -
// absolute lead time and percentage threshold are equally real options, not
// a primary plus a fallback. `lead_time_floor_ratio` guards against a
// configured lead time exceeding what a short SLA can support: effective
// lead = min(absolute_lead_minutes, sla_total_duration * lead_time_floor_ratio).

const scope = config.scope

export const companion_policy = Table({
    name: `${scope}_companion_policy`,
    label: 'Companion Policy',
    schema: {
        singleton_active_marker: StringColumn({
            label: 'Singleton active marker',
            mandatory: false,
            unique: true,
            maxLength: 20,
            hint: `Schema-enforced single-active-record guard. Blank on inactive/historical rows; set to the fixed value 'policy' on the one active row. Do not set this directly outside of activation/deactivation handling (Script Include, later phase) - this PR only defines the constraint, not the maintenance logic.`,
        }),
        disclosure_level: ChoiceColumn({
            label: 'Disclosure level',
            mandatory: true,
            default: 'id_only',
            dropdown: 'dropdown_without_none',
            choices: {
                id_only: { label: 'ID only' },
                id_and_short_description: { label: 'ID and short description' },
                full: { label: 'Full' },
            },
        }),
        absolute_lead_time_enabled: BooleanColumn({ label: 'Absolute lead time enabled', default: true }),
        absolute_lead_minutes: IntegerColumn({ label: 'Absolute lead minutes', default: 60 }),
        percentage_threshold_enabled: BooleanColumn({ label: 'Percentage threshold enabled', default: false }),
        percentage_threshold: IntegerColumn({ label: 'Percentage threshold', default: 80 }),
        lead_time_floor_ratio: DecimalColumn({ label: 'Lead time floor ratio', default: '0.5' }),
        external_context_enabled: BooleanColumn({ label: 'External context enabled', default: false }),
        context_provider_id: StringColumn({ label: 'Context provider ID', maxLength: 40, default: 'stub' }),
        quiet_hours_start_minute: IntegerColumn({
            label: 'Quiet hours start (minutes since midnight)',
            hint: '0-1439. Blank/0 means no quiet-hours restriction configured.',
        }),
        quiet_hours_end_minute: IntegerColumn({ label: 'Quiet hours end (minutes since midnight)' }),
        max_events_per_poll: IntegerColumn({ label: 'Max events per poll', default: 50 }),
        outbox_retention_days: IntegerColumn({ label: 'Outbox retention days', default: 30 }),
        allowed_source_tables: ListColumn({
            label: 'Allowed source tables',
            referenceTable: 'sys_db_object',
        }),
    },
})
