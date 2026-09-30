// Shared fetch-state-machine helpers for every vendor `main.js`. Pure JS
// (the cache is duck-typed), so this is unit-tested directly.

const _locks = new Map();

// Serialize calls that share a key (the cache dir) so concurrent fetches for
// one vendor don't double-request or race the cache writes. The chain is kept
// rejection-free so a failing `fn` never surfaces as an unhandled rejection.
export function withMutex(key, fn) {
    const prev = _locks.get(key) ?? Promise.resolve();
    const result = prev.then(fn, fn);
    _locks.set(key, result.then(() => {}, () => {}));
    return result;
}

// Past this age a cached figure is history, not usage: the failure is shown instead.
export const MAX_STALE_MS = 7 * 86400 * 1000;

// Build a stale `ok:true` result from the cached payload, or return
// `original` — the result that caused the fallback — when nothing usable is
// cached (absent, older than MAX_STALE_MS, or unparseable). `parse(bytes) →
// snapshot` is the vendor's pure parser and may throw.
export async function staleResult(cache, parse, original) {
    const bytes = await cache.maybePayload();
    if (bytes === null)
        return original;
    const ageMs = await cache.payloadAgeMs() ?? 0;
    if (ageMs > MAX_STALE_MS)
        return original;
    try {
        return {
            ok: true,
            snapshot: parse(bytes),
            stale: true,
            lastError: await cache.readLastError(),
            cacheAgeMs: ageMs,
        };
    } catch (_) {
        return original;
    }
}
