// WRITE-CAPABLE Background Script. PDI ONLY. See ../write-scripts/README.md
// before running this. Run in the PDI UI, paste the output back.
//
// Purpose: companion_outbox.now.ts declares idempotency_key as
// `unique: true` (Definition of Done A3: every event delivered exactly
// once). This script inserts two rows with the same idempotency_key and
// asserts the second is rejected. source_table/source_sys_id are plain
// string columns (no reference constraint declared), so placeholder values
// are fine here - only target_user needs to be a real sys_user.
//
// Uses the current session user (gs.getUserID()) as target_user -
// guaranteed to exist - so this never depends on other data existing on
// the instance.
//
// Manual, non-repeatable interim evidence (docs/definition-of-done.md) -
// the real ATF test is still pending; see
// snow-app/src/fluent/tables/README.md for the blocker.
//
// Cleanup: deletes every row it creates, including the second row if the
// assertion fails and it actually gets inserted. Prints "Cleanup complete."
// on success - if that line is missing, check the table by hand before
// running anything else.

var TABLE = 'x_1821654_buddy_companion_outbox';
var userId = gs.getUserID();

var first = new GlideRecord(TABLE);
first.initialize();
first.target_user = userId;
first.event_type = 'CLAUDE_TEST_event';
first.source_table = 'incident';
first.source_sys_id = '00000000000000000000000000000001';
first.idempotency_key = 'CLAUDE_TEST_idem_key';
var firstId = first.insert();

if (!firstId) {
    gs.print('SETUP FAILED: could not insert the first row at all - ' +
        'cannot proceed with the rejection assertion. Nothing left to clean up.');
} else {
    gs.print('Setup: inserted first row ' + firstId + ' (idempotency_key=CLAUDE_TEST_idem_key)');

    var second = new GlideRecord(TABLE);
    second.initialize();
    second.target_user = userId;
    second.event_type = 'CLAUDE_TEST_event';
    second.source_table = 'incident';
    second.source_sys_id = '00000000000000000000000000000002'; // different source, same key
    second.idempotency_key = 'CLAUDE_TEST_idem_key'; // deliberately duplicate
    var secondId = second.insert();

    if (!secondId) {
        gs.print('ASSERTION PASSED: second row (duplicate idempotency_key) was rejected.');
    } else {
        gs.print('ASSERTION FAILED: second row was accepted - sys_id ' + secondId +
            '. The unique constraint on idempotency_key is not doing what the schema ' +
            'comment claims.');
    }

    var cleanupFirst = new GlideRecord(TABLE);
    if (cleanupFirst.get(firstId)) {
        cleanupFirst.deleteRecord();
        gs.print('Cleanup: deleted first row ' + firstId);
    }
    if (secondId) {
        var cleanupSecond = new GlideRecord(TABLE);
        if (cleanupSecond.get(secondId)) {
            cleanupSecond.deleteRecord();
            gs.print('Cleanup: deleted second row ' + secondId);
        }
    }
    gs.print('Cleanup complete.');
}
