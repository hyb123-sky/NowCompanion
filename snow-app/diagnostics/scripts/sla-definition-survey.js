// Read-only Background Script. Run in the PDI UI, paste the output back.
// Reads (does not write): every active SLA definition (contract_sla) -
// name, target table, duration type/value, schedule, pause condition - to
// see the real distribution of SLA lengths before optimizing for the
// long-SLA case. No update()/insert()/deleteRecord() below. If
// "contract_sla" isn't the right table on this version, say so rather than
// guessing another name.

var gr = new GlideRecord('contract_sla');
gr.addQuery('active', true);
gr.query();
var count = 0;
while (gr.next()) {
    count++;
    gs.print('--- ' + gr.getValue('name') + ' ---');
    gs.print('collection (target table): ' + gr.getValue('collection'));
    gs.print('duration_type: ' + gr.getValue('duration_type'));
    gs.print('duration (raw): ' + gr.getValue('duration'));
    gs.print('schedule: ' + gr.getDisplayValue('schedule'));
    gs.print('pause_condition: ' + gr.getValue('pause_condition'));
}
gs.print('Total active SLA definitions: ' + count);
