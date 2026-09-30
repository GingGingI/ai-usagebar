import GLib from 'gi://GLib';
import system from 'system';

import {withMutex, staleResult, MAX_STALE_MS} from '../../../lib/vendors/fetch-common.js';
import {describe, it, assertEqual, assertDeepEqual, summary} from '../../_assert.js';

// The `it` harness is synchronous, so resolve promises against a main loop.
function runSync(promise) {
    const loop = GLib.MainLoop.new(null, false);
    let value, err, done = false;
    Promise.resolve(promise).then(
        v => { value = v; done = true; loop.quit(); },
        e => { err = e; done = true; loop.quit(); }
    );
    if (!done)
        loop.run();
    if (err)
        throw err;
    return value;
}

function fakeCache({payload = null, lastError = null, ageMs = null} = {}) {
    return {
        maybePayload: () => payload,
        readLastError: () => lastError,
        payloadAgeMs: () => ageMs,
    };
}

const NO_CACHE = {ok: false, kind: 'loading'};

describe('staleResult', () => {
    it('returns the noCache fallback when nothing is cached', () => {
        const out = runSync(staleResult(fakeCache({payload: null}), () => ({}), NO_CACHE));
        assertEqual(out, NO_CACHE);
    });

    it('returns the noCache fallback when the payload will not parse', () => {
        const out = runSync(staleResult(fakeCache({payload: 'bad'}), () => { throw new Error('nope'); }, NO_CACHE));
        assertEqual(out, NO_CACHE);
    });

    it('builds a stale ok-result from a parseable payload', () => {
        const cache = fakeCache({payload: 'x', lastError: {code: 429}, ageMs: 1234});
        const out = runSync(staleResult(cache, () => ({pct: 7}), NO_CACHE));
        assertDeepEqual(out, {
            ok: true,
            snapshot: {pct: 7},
            stale: true,
            lastError: {code: 429},
            cacheAgeMs: 1234,
        });
    });

    it('coerces a null cache age to 0', () => {
        const out = runSync(staleResult(fakeCache({payload: 'x', ageMs: null}), () => ({}), NO_CACHE));
        assertEqual(out.cacheAgeMs, 0);
    });

    it('passes the raw payload bytes through to the parser', () => {
        let seen = null;
        runSync(staleResult(fakeCache({payload: 'PAYLOAD'}), (b) => { seen = b; return {}; }, NO_CACHE));
        assertEqual(seen, 'PAYLOAD');
    });
});

describe('staleResult — ceiling and original error', () => {
    const ORIGINAL = {ok: false, kind: 'error', status: 401, message: 'usage request failed (HTTP 401)'};
    const DAY = 86400 * 1000;

    it('MAX_STALE_MS is seven days', () => assertEqual(MAX_STALE_MS, 7 * DAY));

    it('an 8-day-old payload is not served; the original error is returned', () => {
        const out = runSync(staleResult(fakeCache({payload: 'x', ageMs: 8 * DAY}), () => ({}), ORIGINAL));
        assertEqual(out, ORIGINAL);
    });

    it('a payload exactly at the ceiling is still served', () => {
        const out = runSync(staleResult(fakeCache({payload: 'x', ageMs: MAX_STALE_MS}), () => ({v: 1}), ORIGINAL));
        assertEqual(out.ok, true);
        assertEqual(out.stale, true);
    });

    it('a corrupt stale payload returns the original error, not a synthesized one', () => {
        const out = runSync(staleResult(fakeCache({payload: '{', ageMs: 1000}), () => { throw new Error('bad'); }, ORIGINAL));
        assertEqual(out, ORIGINAL);
        assertEqual(out.status, 401);
    });

    it('no payload propagates the original error verbatim', () =>
        assertEqual(runSync(staleResult(fakeCache({payload: null}), () => ({}), ORIGINAL)), ORIGINAL));
});

describe('withMutex', () => {
    it('serializes calls sharing a key (no interleaving)', () => {
        const order = [];
        const make = (tag) => async () => {
            order.push(`${tag}:start`);
            await Promise.resolve();
            order.push(`${tag}:end`);
            return tag;
        };
        const a = withMutex('k', make('a'));
        const b = withMutex('k', make('b'));
        assertDeepEqual(runSync(Promise.all([a, b])), ['a', 'b']);
        assertDeepEqual(order, ['a:start', 'a:end', 'b:start', 'b:end']);
    });

    it('returns the wrapped function result', () => {
        assertEqual(runSync(withMutex('ret', () => 42)), 42);
    });

    it('keeps the chain alive after a rejection (next call still runs)', () => {
        const recovered = runSync(
            withMutex('err', () => Promise.reject(new Error('boom'))).then(
                () => 'unexpected',
                () => withMutex('err', () => 'recovered')
            )
        );
        assertEqual(recovered, 'recovered');
    });
});

system.exit(summary());
