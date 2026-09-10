// WRITE-CAPABLE Background Script. PDI ONLY. See ../write-scripts/README.md
// before running this. Run in the PDI UI, paste the output back.
//
// Purpose: companion_user_map.now.ts declares `sys_user` as `unique: true`
// on its own (independent of the composite idp_issuer+idp_subject index -
// see user-map-duplicate-idp-pair-rejected.js for that one). This script
// inserts two rows for the SAME sys_user with DIFFERENT idp_issuer/
// idp_subject pairs, so a rejection can only be attributed to the sys_user
// uniqueness, not the composite index. Asserts the second insert is
// rejected.
//
// Uses the current session user (gs.getUserID()) - guaranteed to exist and
// be a real sys_user - so this never depends on other data existing on the
// instance.
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
var userId = gs.getUserID();

gs.print('Using current session user sys_id ' + userId + ' for both rows.');

var first = new GlideRecord(TABLE);
first.initialize();
first.sys_user = userId;
first.idp_issuer = 'https://claude-test.invalid/';
first.idp_subject = 'CLAUDE_TEST_subject_1';
var firstId = first.insert();

if (!firstId) {
    gs.print('SETUP FAILED: could not insert the first row at all - ' +
        'cannot proceed with the rejection assertion. Nothing left to clean up.');
} else {
    gs.print('Setup: inserted first row ' + firstId + ' (idp_subject=CLAUDE_TEST_subject_1)');

    var second = new GlideRecord(TABLE);
    second.initialize();
    second.sys_user = userId;
    second.idp_issuer = 'https://claude-test.invalid/';
    second.idp_subject = 'CLAUDE_TEST_subject_2'; // deliberately different pair
    var secondId = second.insert();

    if (!secondId) {
        gs.print('ASSERTION PASSED: second row (same sys_user, different idp pair) was rejected.');
    } else {
        gs.print('ASSERTION FAILED: second row was accepted - sys_id ' + secondId +
            '. The unique constraint on sys_user is not doing what the schema comment claims.');
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
