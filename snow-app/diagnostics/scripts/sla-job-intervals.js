// Read-only Background Script. Run in the PDI UI, paste the output back.
// Reads (does not write): sysauto (+ subclasses) for every Scheduled Job
// whose name contains "SLA" - job type, active, run_type, run_period
// (repeat interval), run_time - and the matching sys_trigger row for
// runtime next_action/state. No update()/insert()/deleteRecord() anywhere
// below. Field names are best-effort for a recent ServiceNow release;
// if a field prints blank, the name may differ on this instance - say so
// rather than guessing further.

var gr = new GlideRecord('sysauto');
gr.addQuery('name', 'CONTAINS', 'SLA');
gr.query();
while (gr.next()) {
    gs.print('--- ' + gr.getValue('name') + ' (' + gr.getUniqueValue() + ') ---');
    gs.print('class: ' + gr.getValue('sys_class_name'));
    gs.print('active: ' + gr.getValue('active'));
    gs.print('run_type: ' + gr.getValue('run_type'));
    // run_period is a glide_duration field; raw value looks like a
    // 1970-01-01 HH:MM:SS style string representing elapsed time, not a
    // real date - that's expected, not a bug.
    gs.print('run_period (raw duration): ' + gr.getValue('run_period'));
    gs.print('run_time: ' + gr.getValue('run_time'));

    var trig = new GlideRecord('sys_trigger');
    trig.addQuery('name', gr.getValue('name'));
    trig.query();
    if (trig.next()) {
        gs.print('sys_trigger.next_action: ' + trig.getValue('next_action'));
        gs.print('sys_trigger.state: ' + trig.getValue('state'));
        gs.print('sys_trigger.trigger_type: ' + trig.getValue('trigger_type'));
    } else {
        gs.print('sys_trigger: no matching row found by name');
    }
}
