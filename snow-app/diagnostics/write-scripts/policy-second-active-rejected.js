// WRITE-CAPABLE Background Script. PDI ONLY. See ../write-scripts/README.md
// before running this. Run in the PDI UI, paste the output back.
//
// Purpose: companion_policy.now.ts declares "at most one active record" as
// a database-enforced property - singleton_active_marker is blank on every
// inactive row and set to the fixed value 'policy' on the active row, with
// a unique index on that column - not a Business Rule. This script inserts
// one active record, then attempts a second, and asserts the second is
// rejected by the platform, not just declared in schema.
//
// Manual, non-repeatable interim evidence (docs/definition-of-done.md) -
// the real ATF test is still pending; see
// snow-app/src/fluent/tables/README.md for the blocker.
//
// Cleanup: deletes every row it creates, including the second row if the
// assertion fails and it actually gets inserted. Prints "Cleanup complete."
// on success - if that line is missing, check the table by hand before
// running anything else.

var TABLE = 'x_1821654_buddy_companion_policy';

var existing = new GlideRecord(TABLE);
existing.addQuery('singleton_active_marker', 'policy');
existing.query();

if (existing.next()) {
    gs.print('ABORTING: a real active companion_policy record already exists (' +
        existing.getUniqueValue() + '). This probe only runs against a table ' +
        'with no active record. Nothing was written.');
} else {
    var first = new GlideRecord(TABLE);
    first.initialize();
    first.singleton_active_marker = 'policy';
    first.disclosure_level = 'id_only';
    var firstId = first.insert();

    if (!firstId) {
        gs.print('SETUP FAILED: could not insert the first active record at all - ' +
            'cannot proceed with the rejection assertion. Nothing left to clean up.');
    } else {
        gs.print('Setup: inserted first active policy record ' + firstId);

        var second = new GlideRecord(TABLE);
        second.initialize();
        second.singleton_active_marker = 'policy';
        second.disclosure_level = 'id_only';
        var secondId = second.insert();

        if (!secondId) {
            gs.print('ASSERTION PASSED: second active record was rejected (insert() returned null/false).');
        } else {
            gs.print('ASSERTION FAILED: second active record was accepted - sys_id ' + secondId +
                '. The unique index is not doing what the schema comment claims.');
        }

        var cleanupFirst = new GlideRecord(TABLE);
        if (cleanupFirst.get(firstId)) {
            cleanupFirst.deleteRecord();
            gs.print('Cleanup: deleted first record ' + firstId);
        }
        if (secondId) {
            var cleanupSecond = new GlideRecord(TABLE);
            if (cleanupSecond.get(secondId)) {
                cleanupSecond.deleteRecord();
                gs.print('Cleanup: deleted second record ' + secondId);
            }
        }
        gs.print('Cleanup complete.');
    }
}
