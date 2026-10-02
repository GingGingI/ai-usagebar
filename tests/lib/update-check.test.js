import system from 'system';

import {
    parseVersion, isNewer, parseLatestTag, parseState, serializeState, isDue, afterCheck, availableUpdate,
    STATE_VERSION, CHECK_INTERVAL_MS, RETRY_INTERVAL_MS,
} from '../../lib/update-check.js';
import {describe, it, assertEqual, assertDeepEqual, summary} from '../_assert.js';

const NOW = Date.UTC(2026, 9, 2, 12, 0, 0);
const EMPTY = {version: STATE_VERSION, nextCheckAt: 0, latest: null};

describe('parseVersion', () => {
    it('plain version', () => assertDeepEqual(parseVersion('1.5.0'), [1, 5, 0]));
    it('v-prefixed tag', () => assertDeepEqual(parseVersion('v1.5.0'), [1, 5, 0]));
    it('two components', () => assertDeepEqual(parseVersion('2.1'), [2, 1]));
    it('surrounding whitespace', () => assertDeepEqual(parseVersion(' v3.0.1\n'), [3, 0, 1]));
    it('pre-release suffix → null', () => assertEqual(parseVersion('1.6.0-rc1'), null));
    it('arbitrary text → null', () => assertEqual(parseVersion('<b>latest</b>'), null));
    it('empty → null', () => assertEqual(parseVersion(''), null));
    it('non-string → null', () => {
        assertEqual(parseVersion(null), null);
        assertEqual(parseVersion(8), null);
    });
});

describe('isNewer', () => {
    it('higher patch', () => assertEqual(isNewer('1.5.1', '1.5.0'), true));
    it('numeric, not lexical', () => assertEqual(isNewer('1.10.0', '1.9.0'), true));
    it('higher major', () => assertEqual(isNewer('v2.0.0', '1.9.9'), true));
    it('equal', () => assertEqual(isNewer('v1.5.0', '1.5.0'), false));
    it('older', () => assertEqual(isNewer('1.4.9', '1.5.0'), false));
    it('missing component counts as zero', () => {
        assertEqual(isNewer('1.5', '1.5.0'), false);
        assertEqual(isNewer('1.5.0.1', '1.5'), true);
    });
    it('unparseable candidate', () => assertEqual(isNewer('nightly', '1.5.0'), false));
    it('unparseable current', () => assertEqual(isNewer('1.6.0', undefined), false));
});

describe('parseLatestTag', () => {
    it('reads tag_name without the v', () =>
        assertEqual(parseLatestTag('{"tag_name":"v1.6.0","html_url":"https://example.invalid"}'), '1.6.0'));
    it('missing tag_name → null', () => assertEqual(parseLatestTag('{"message":"Not Found"}'), null));
    it('non-version tag → null', () => assertEqual(parseLatestTag('{"tag_name":"nightly"}'), null));
    it('non-string tag → null', () => assertEqual(parseLatestTag('{"tag_name":16}'), null));
    it('invalid JSON → null', () => assertEqual(parseLatestTag('<html>'), null));
    it('JSON null → null', () => assertEqual(parseLatestTag('null'), null));
});

describe('state round-trip', () => {
    it('round-trips', () => {
        const state = {version: STATE_VERSION, nextCheckAt: NOW, latest: '1.6.0'};
        assertDeepEqual(parseState(serializeState(state)), state);
    });
    it('invalid JSON → empty', () => assertDeepEqual(parseState('not json'), EMPTY));
    it('other version → empty', () =>
        assertDeepEqual(parseState('{"version":99,"nextCheckAt":1,"latest":"1.6.0"}'), EMPTY));
    it('bad nextCheckAt → empty', () =>
        assertDeepEqual(parseState(`{"version":${STATE_VERSION},"nextCheckAt":"soon","latest":"1.6.0"}`), EMPTY));
    it('non-version latest is dropped', () =>
        assertDeepEqual(parseState(`{"version":${STATE_VERSION},"nextCheckAt":5,"latest":"<b>x</b>"}`),
            {version: STATE_VERSION, nextCheckAt: 5, latest: null}));
});

describe('isDue', () => {
    it('empty state is due', () => assertEqual(isDue(EMPTY, NOW), true));
    it('before the deadline', () => assertEqual(isDue({...EMPTY, nextCheckAt: NOW + 1000}, NOW), false));
    it('at the deadline', () => assertEqual(isDue({...EMPTY, nextCheckAt: NOW}, NOW), true));
    it('past the deadline', () => assertEqual(isDue({...EMPTY, nextCheckAt: NOW - 1}, NOW), true));
    it('a full interval ahead is not due', () =>
        assertEqual(isDue({...EMPTY, nextCheckAt: NOW + CHECK_INTERVAL_MS}, NOW), false));
    it('deadline beyond one interval (clock moved back) is due', () =>
        assertEqual(isDue({...EMPTY, nextCheckAt: NOW + CHECK_INTERVAL_MS + 1}, NOW), true));
});

describe('afterCheck', () => {
    it('success stores the version and waits a day', () =>
        assertDeepEqual(afterCheck(EMPTY, '1.6.0', NOW),
            {version: STATE_VERSION, nextCheckAt: NOW + CHECK_INTERVAL_MS, latest: '1.6.0'}));
    it('failure retries sooner and keeps the known version', () =>
        assertDeepEqual(afterCheck({...EMPTY, latest: '1.6.0'}, null, NOW),
            {version: STATE_VERSION, nextCheckAt: NOW + RETRY_INTERVAL_MS, latest: '1.6.0'}));
    it('failure with nothing known', () =>
        assertDeepEqual(afterCheck(EMPTY, null, NOW),
            {version: STATE_VERSION, nextCheckAt: NOW + RETRY_INTERVAL_MS, latest: null}));
});

describe('availableUpdate', () => {
    it('newer release', () => assertEqual(availableUpdate({...EMPTY, latest: '1.6.0'}, '1.5.0'), '1.6.0'));
    it('same release', () => assertEqual(availableUpdate({...EMPTY, latest: '1.5.0'}, '1.5.0'), null));
    it('installed is ahead', () => assertEqual(availableUpdate({...EMPTY, latest: '1.5.0'}, '1.6.0'), null));
    it('nothing known', () => assertEqual(availableUpdate(EMPTY, '1.5.0'), null));
    it('unknown installed version', () =>
        assertEqual(availableUpdate({...EMPTY, latest: '1.6.0'}, undefined), null));
});

system.exit(summary());
