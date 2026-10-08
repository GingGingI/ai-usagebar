import GLib from 'gi://GLib';
// GNOME 42 port: the shell links libsoup 2.4, so this speaks its API.
import Soup from 'gi://Soup?version=2.4';

const DEFAULT_USER_AGENT = 'ai-usagebar/0.1';
const DEFAULT_TIMEOUT_MS = 10_000;

// libsoup 2.4 reports a transport failure as a status code below 100.
const SOUP_STATUS_CANCELLED = 1;

let _session = null;
const _pendingCancellables = new Set();
const _activeTimeouts = new Set();

export function getSession() {
    if (_session === null)
        _session = new Soup.Session();
    return _session;
}

export function disposeSession() {
    for (const abort of [..._pendingCancellables]) {
        try {
            abort();
        } catch (_) { /* best-effort */ }
    }
    _pendingCancellables.clear();
    for (const id of _activeTimeouts) {
        try {
            GLib.Source.remove(id);
        } catch (_) { /* best-effort */ }
    }
    _activeTimeouts.clear();
    _session = null;
}

export function _debug() {
    return {
        activeTimeouts: _activeTimeouts.size,
        pendingCancellables: _pendingCancellables.size,
        sessionExists: _session !== null,
    };
}

function isPlainObject(v) {
    if (v === null || typeof v !== 'object')
        return false;
    if (Array.isArray(v))
        return false;
    const proto = Object.getPrototypeOf(v);
    return proto === null || proto === Object.prototype;
}

function validateHeaders(headers) {
    if (headers === undefined || headers === null)
        return {};
    if (!isPlainObject(headers))
        throw new TypeError('request: headers must be a plain object whose values are strings');
    return headers;
}

function encodeBody(body) {
    if (body === undefined || body === null)
        return null;
    if (body instanceof Uint8Array)
        return body;
    if (typeof body === 'string')
        return new TextEncoder().encode(body);
    throw new TypeError('request: body must be string, Uint8Array, or omitted');
}

function headersToObject(messageHeaders) {
    const result = {};
    messageHeaders.foreach((name, value) => {
        result[name.toLowerCase()] = value;
    });
    return result;
}

const MAX_REDIRECTS = 10;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const DEFAULT_PORTS = {http: 80, https: 443};

function effectivePort(uri) {
    const port = uri.get_port();
    return port === -1 ? DEFAULT_PORTS[uri.get_scheme()] ?? -1 : port;
}

// The absolute redirect target when it keeps the scheme, host and port of
// `base`; null for a cross-origin or unparseable Location.
function sameOriginTarget(base, location) {
    if (!location)
        return null;
    try {
        const from = GLib.Uri.parse(base, GLib.UriFlags.NONE);
        const to = from.parse_relative(location, GLib.UriFlags.NONE);
        const same = to.get_scheme() === from.get_scheme() &&
            (to.get_host() ?? '').toLowerCase() === (from.get_host() ?? '').toLowerCase() &&
            effectivePort(to) === effectivePort(from);
        return same ? to.to_string() : null;
    } catch (_e) {
        return null;
    }
}

function bytesToU8(bytes) {
    if (bytes === null || bytes === undefined)
        return new Uint8Array(0);
    const data = bytes.get_data?.();
    if (data === null || data === undefined)
        return new Uint8Array(0);
    return data instanceof Uint8Array ? data : new Uint8Array(data);
}

function contentType(headers) {
    for (const [name, value] of Object.entries(headers)) {
        if (name.toLowerCase() === 'content-type')
            return String(value);
    }
    return 'application/octet-stream';
}

export function request(opts) {
    const o = opts ?? {};
    const method = o.method ?? 'GET';
    const url = o.url;
    if (!url || typeof url !== 'string')
        throw new TypeError('request: url is required');
    const headers = validateHeaders(o.headers);
    const bodyBytes = encodeBody(o.body);
    const timeoutMs = o.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const callerCancellable = o.cancellable ?? null;

    return new Promise((resolve) => {
        const session = getSession();

        let timeoutId = 0;
        let timedOut = false;
        let linkHandlerId = 0;
        let inLinkHandler = false;
        let settled = false;
        let cancelled = false;
        let currentMsg = null;

        // Soup 2 may delay the message callback; settle cancellation immediately.
        const abort = () => {
            cancelled = true;
            if (currentMsg !== null)
                session.cancel_message(currentMsg, SOUP_STATUS_CANCELLED);
            fail(timedOut ? 'timeout' : 'cancelled', timedOut
                ? `request timed out after ${timeoutMs}ms` : 'request cancelled');
        };
        _pendingCancellables.add(abort);

        const unlink = () => {
            try {
                callerCancellable.disconnect(linkHandlerId);
            } catch (_) { /* best-effort */ }
            return GLib.SOURCE_REMOVE;
        };

        const cleanup = () => {
            if (timeoutId !== 0) {
                // disposeSession() may already have removed it: libsoup 2.4
                // delivers a cancelled message's callback later.
                if (_activeTimeouts.delete(timeoutId))
                    GLib.Source.remove(timeoutId);
                timeoutId = 0;
            }
            if (linkHandlerId !== 0 && callerCancellable) {
                // Disconnecting from inside the handler itself would deadlock.
                if (inLinkHandler)
                    GLib.idle_add(GLib.PRIORITY_DEFAULT, unlink);
                else
                    unlink();
            }
            _pendingCancellables.delete(abort);
        };

        const settle = (result) => {
            if (settled)
                return;
            settled = true;
            cleanup();
            resolve(result);
        };

        const fail = (kind, message) => settle({
            status: 0,
            headers: {},
            bodyBytes: new Uint8Array(0),
            error: {kind, message},
        });

        if (callerCancellable) {
            if (callerCancellable.is_cancelled()) {
                cancelled = true;
            } else {
                linkHandlerId = callerCancellable.connect(() => {
                    inLinkHandler = true;
                    abort();
                    inLinkHandler = false;
                });
            }
        }

        // One timeout covers the whole redirect chain.
        if (timeoutMs > 0) {
            timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, timeoutMs, () => {
                timedOut = true;
                _activeTimeouts.delete(timeoutId);
                timeoutId = 0;
                abort();
                return GLib.SOURCE_REMOVE;
            });
            _activeTimeouts.add(timeoutId);
        }

        const send = (currentUrl, currentMethod, currentBody, hops) => {
            let msg;
            try {
                msg = Soup.Message.new(currentMethod, currentUrl);
            } catch (e) {
                fail('transport', `invalid URL: ${e?.message ?? e}`);
                return;
            }
            if (msg === null) {
                fail('transport', 'invalid URL');
                return;
            }
            // Redirects are followed by hand below, and only within one origin.
            msg.set_flags(Soup.MessageFlags.NO_REDIRECT);

            // Before the headers: set_request() writes a Content-Type of its own.
            if (currentBody !== null && currentBody.length > 0)
                msg.set_request(contentType(headers), Soup.MemoryUse.COPY, currentBody);

            const reqHeaders = msg.request_headers;
            let hasUserAgent = false;
            for (const [name, value] of Object.entries(headers)) {
                reqHeaders.replace(name, String(value));
                if (name.toLowerCase() === 'user-agent')
                    hasUserAgent = true;
            }
            if (!hasUserAgent)
                reqHeaders.replace('User-Agent', DEFAULT_USER_AGENT);

            if (cancelled) {
                fail('cancelled', 'request cancelled');
                return;
            }

            currentMsg = msg;
            session.queue_message(msg, (_sess, m) => {
                currentMsg = null;
                const status = m.status_code;
                if (timedOut) {
                    fail('timeout', `request timed out after ${timeoutMs}ms`);
                    return;
                }
                if (cancelled || status === SOUP_STATUS_CANCELLED) {
                    fail('cancelled', 'request cancelled');
                    return;
                }
                if (status < 100) {
                    fail('transport', m.reason_phrase || `transport error ${status}`);
                    return;
                }
                const respHeaders = headersToObject(m.response_headers);
                const next = REDIRECT_STATUSES.has(status) && hops < MAX_REDIRECTS
                    ? sameOriginTarget(currentUrl, respHeaders.location)
                    : null;
                if (next !== null) {
                    // 303 always becomes a bodiless GET.
                    const nextMethod = status === 303 ? 'GET' : currentMethod;
                    send(next, nextMethod, status === 303 ? null : currentBody, hops + 1);
                    return;
                }
                // A cross-origin (or over-long) redirect stops here and
                // surfaces as the 3xx itself.
                let bytes = null;
                try {
                    bytes = m.response_body.flatten().get_as_bytes();
                } catch (e) {
                    fail('transport', e?.message ?? String(e));
                    return;
                }
                settle({
                    status,
                    headers: respHeaders,
                    bodyBytes: bytesToU8(bytes),
                    error: null,
                });
            });
        };
        send(url, method, bodyBytes, 0);
    });
}
