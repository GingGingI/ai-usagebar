export const RELEASES_API_URL = 'https://api.github.com/repos/wilfison/ai-usagebar/releases/latest';
export const RELEASES_PAGE_URL = 'https://github.com/wilfison/ai-usagebar/releases/latest';
export const STATE_VERSION = 1;
export const CHECK_INTERVAL_MS = 24 * 3600 * 1000;
export const RETRY_INTERVAL_MS = 3600 * 1000;

const VERSION_RE = /^v?(\d{1,9}(?:\.\d{1,9}){0,3})$/;

function emptyState() {
    return {version: STATE_VERSION, nextCheckAt: 0, latest: null};
}

export function parseVersion(text) {
    const match = typeof text === 'string' ? VERSION_RE.exec(text.trim()) : null;
    return match ? match[1].split('.').map(Number) : null;
}

export function isNewer(candidate, current) {
    const a = parseVersion(candidate);
    const b = parseVersion(current);
    if (!a || !b)
        return false;
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const diff = (a[i] ?? 0) - (b[i] ?? 0);
        if (diff !== 0)
            return diff > 0;
    }
    return false;
}

// The tag is network input: only a plain dotted version is ever kept or shown.
export function parseLatestTag(text) {
    try {
        const parts = parseVersion(JSON.parse(text)?.tag_name);
        return parts ? parts.join('.') : null;
    } catch (_e) {
        return null;
    }
}

export function parseState(text) {
    try {
        const obj = JSON.parse(text);
        if (obj?.version !== STATE_VERSION || !Number.isFinite(obj.nextCheckAt))
            return emptyState();
        return {
            version: STATE_VERSION,
            nextCheckAt: obj.nextCheckAt,
            latest: parseVersion(obj.latest) ? obj.latest : null,
        };
    } catch (_e) {
        return emptyState();
    }
}

export function serializeState(state) {
    return JSON.stringify(state);
}

// A deadline further away than one interval means the clock moved back.
export function isDue(state, now) {
    return now >= state.nextCheckAt || state.nextCheckAt > now + CHECK_INTERVAL_MS;
}

// A null `latest` is a failed check: retry sooner, keep what was known.
export function afterCheck(state, latest, now) {
    if (latest === null)
        return {version: STATE_VERSION, nextCheckAt: now + RETRY_INTERVAL_MS, latest: state.latest};
    return {version: STATE_VERSION, nextCheckAt: now + CHECK_INTERVAL_MS, latest};
}

export function availableUpdate(state, current) {
    return isNewer(state.latest, current) ? state.latest : null;
}
