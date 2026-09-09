// Read-only Background Script. Run in the PDI UI, paste the output back.
// Reads (does not write): one task_sla record's RAW STORED field values
// via getValue() - never getDisplayValue() - since
// glide.sla.calculate_on_display=true means the UI-shown percentage can
// differ from what's actually stored. No update()/insert()/deleteRecord()
// below. Set TASK_SLA_SYS_ID before each of the three runs (before pause,
// while paused, after resume) and paste all three outputs.

var TASK_SLA_SYS_ID = 'PUT_SYS_ID_HERE';

var gr = new GlideRecord('task_sla');
if (!gr.get(TASK_SLA_SYS_ID)) {
    gs.print('No task_sla record found for sys_id ' + TASK_SLA_SYS_ID);
} else {
    var fields = [
        'stage', 'has_breached', 'business_percentage', 'percentage',
        'business_time_left', 'business_duration', 'pause_duration',
        'pause_time', 'start_time', 'end_time', 'planned_end_time', 'schedule'
    ];
    for (var i = 0; i < fields.length; i++) {
        gs.print(fields[i] + ' = ' + gr.getValue(fields[i]));
    }
}
