// Read-only Background Script. Run in the PDI UI, paste the output back.
//
// Reads (does not write): sys_trigger directly - the scheduler's RUNTIME
// QUEUE - not sysauto (job DEFINITIONS). See sla-job-intervals.js for the
// superseded version of this investigation.
//
// Why this script exists: sla-job-intervals.js queried sysauto for job
// DEFINITIONS, then for each definition looked for a sys_trigger row with
// a MATCHING NAME. That nested lookup could only ever find a trigger whose
// name equals a static job definition's name - it had no chance of finding
// trigger rows the SLA engine generates dynamically at runtime. A prior
// conclusion drawn from that script's output ("these tiered SLA jobs don't
// exist on this instance") was wrong, and wrong for a specific, nameable
// reason: absence of a match in a nested, name-joined query is not evidence
// that no matching row exists anywhere in the table - it is only evidence
// that no row shares a name with something in sysauto. A screenshot from
// this same instance shows exactly these rows under Schedule
// (Name / Next action / Trigger type / Job ID / State / Run count), which
// is the sys_trigger list view. This script queries sys_trigger on its own,
// with no join back to sysauto.
//
// This script does NOT assume which field (if any) corresponds to the
// "Run count" column seen in that UI list - rather than guess a field name
// and print a blank if wrong, it dumps every field present on each matching
// sys_trigger record so the mapping can be read off the real output.
//
// No update()/insert()/deleteRecord() anywhere below.

var trig = new GlideRecord('sys_trigger');
trig.addQuery('name', 'CONTAINS', 'SLA');
trig.query();

var count = 0;
while (trig.next()) {
    count++;
    gs.print('--- sys_trigger: ' + trig.getValue('name') + ' (' + trig.getUniqueValue() + ') ---');

    var els = trig.getFields();
    for (var i = 0; i < els.size(); i++) {
        var fieldName = els.get(i).getName();
        gs.print(fieldName + ' = ' + trig.getValue(fieldName));
    }
    gs.print('');
}

gs.print('Total sys_trigger rows matching name CONTAINS "SLA": ' + count);
gs.print('');
gs.print('Caveat: CONTAINS "SLA" also matches unrelated names that happen to');
gs.print('contain that substring (translations, unrelated integrations, etc).');
gs.print('Read the actual name value per row - do not assume every row printed');
gs.print('above is SLA-engine-related just because it matched the filter.');
gs.print('');
gs.print('Caveat 2: this table is the runtime QUEUE, not the job DEFINITION.');
gs.print('A repeat job normally has exactly one live sys_trigger row at a time');
gs.print('(its next scheduled fire) - if a "run count" appears here, confirm');
gs.print('whether it is actually stored on this record or is a UI-computed');
gs.print('aggregate before treating it as a stored field value.');
