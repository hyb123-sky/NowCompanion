// WRITE-CAPABLE Background Script. PDI ONLY. See ../write-scripts/README.md
// before running this. Run in the PDI UI, paste the output back.
//
// Purpose: companion_user_map.now.ts declares a composite unique index
// (idx_companion_user_map_idp) on (idp_issuer, idp_subject), independent of
// the single-column unique on sys_user (see
// user-map-duplicate-sys-user-rejected.js for that one). This script
// inserts two rows with the SAME (idp_issuer, idp_subject) pair but
// DIFFERENT sys_user, so a rejection can only be attributed to the
// composite index, not the sys_user column. Asserts the second insert is
// rejected.
//
// Requires two distinct real sys_user records to exist on the instance
// (the current session user plus one other active user). Aborts without
// writing anything if a second distinct active user can't be found.
//
// Manual, non-repeatable interim evidence (docs/definition-of-done.md) -
// the real ATF test is still pending; see
// snow-app/src/fluent/tables/README.md for the blocker.
//
// Cleanup: deletes every row it creates, including the second row if the
// assertion fails and it actually gets inserted. Prints "Cleanup complete."
// on success - if that line is missing, check the table by hand before
// running anything else.

var TABLE = 'x_1821654_buddy_companion_user_map';
var userA = gs.getUserID();

var otherUser = new GlideRecord('sys_user');
otherUser.addQuery('active', true);
otherUser.addQuery('sys_id', '!=', userA);
otherUser.setLimit(1);
otherUser.query();

if (!otherUser.next()) {
    gs.print('ABORTING: could not find a second distinct active sys_user on this ' +
        'instance. This assertion needs two real users. Nothing was written.');
} else {
    var userB = otherUser.getUniqueValue();
    gs.print('Using sys_user ' + userA + ' (current session) and ' + userB + ' (other) for the two rows.');

    var first = new GlideRecord(TABLE);
    first.initialize();
    first.sys_user = userA;
    first.idp_issuer = 'https://claude-test.invalid/';
    first.idp_subject = 'CLAUDE_TEST_shared_subject';
    var firstId = first.insert();

    if (!firstId) {
        gs.print('SETUP FAILED: could not insert the first row at all - ' +
            'cannot proceed with the rejection assertion. Nothing left to clean up.');
    } else {
        gs.print('Setup: inserted first row ' + firstId + ' (sys_user=' + userA + ')');

        var second = new GlideRecord(TABLE);
        second.initialize();
        second.sys_user = userB; // deliberately different user
        second.idp_issuer = 'https://claude-test.invalid/';
        second.idp_subject = 'CLAUDE_TEST_shared_subject'; // same pair as first
        var secondId = second.insert();

        if (!secondId) {
            gs.print('ASSERTION PASSED: second row (same idp pair, different sys_user) was rejected.');
        } else {
            gs.print('ASSERTION FAILED: second row was accepted - sys_id ' + secondId +
                '. The composite unique index on (idp_issuer, idp_subject) is not doing ' +
                'what the schema comment claims.');
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
}
