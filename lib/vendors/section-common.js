import {localTimeHm, vformat, sanitizeUntrusted} from '../format.js';
import {formatBackoff} from '../countdown.js';
import {severityColor} from '../severity.js';
import {RATE_LIMITED, AUTH_REJECTED} from './fetch-common.js';

const ERROR_WRAP_COLS = 35;

export const ICON_ERR_SERVER = 'dialog-error-symbolic';
export const ICON_ERR_CLIENT = 'dialog-warning-symbolic';
export const ICON_FOOTER = 'emblem-synchronizing-symbolic';

export function wrapWords(text, width) {
    const words = String(text ?? '').split(/\s+/u).filter(w => w.length > 0);
    if (words.length === 0)
        return [];

    const lines = [];
    let line = '';
    for (const w of words) {
        if (line === '')
            line = w;
        else if (line.length + 1 + w.length <= width)
            line += ` ${w}`;
        else {
            lines.push(line);
            line = w;
        }
    }
    lines.push(line);
    return lines;
}

export function rateLimitedText(retryInMs, _ = (s) => s) {
    return vformat(_('rate limited; next attempt in %s'), formatBackoff(retryInMs, _));
}

export function authRejectedText(status, _ = (s) => s) {
    return vformat(_('HTTP %d: authentication rejected — credentials may be missing, expired, or invalid'), status);
}

function isAuthStatus(code) {
    return code === 401 || code === 403;
}

// The text for an `ok:false` error result; a coded error is translated here
// because main.js has no translator.
export function errorText(res, _ = (s) => s) {
    if (res.code === RATE_LIMITED)
        return rateLimitedText(res.retryInMs, _);
    if (res.code === AUTH_REJECTED)
        return authRejectedText(res.status, _);
    return res.message;
}

export function httpErrorRow(meta, theme, _ = (s) => s) {
    if (!meta.lastError || meta.lastError.code === 0)
        return null;
    if (meta.lastError.code === RATE_LIMITED) {
        return {
            kind: 'http-error',
            icon: ICON_ERR_CLIENT,
            color: theme.orange,
            code: RATE_LIMITED,
            status: rateLimitedText(meta.lastError.retryInMs, _),
            lines: [],
        };
    }
    const {code, body} = meta.lastError;
    const server = code >= 500;
    // A 401/403 body is never shown, even one persisted by an older release.
    const auth = isAuthStatus(code);
    return {
        kind: 'http-error',
        icon: server ? ICON_ERR_SERVER : ICON_ERR_CLIENT,
        color: server ? theme.red : theme.orange,
        code,
        status: auth ? authRejectedText(code, _) : vformat(_('HTTP %s'), code),
        lines: auth ? [] : wrapWords(sanitizeUntrusted(body), ERROR_WRAP_COLS),
    };
}

export function footerRow(meta, _ = (s) => s) {
    const updated = meta.fetchedAt ? localTimeHm(meta.fetchedAt) : '—';
    return {
        kind: 'footer',
        icon: ICON_FOOTER,
        updated,
        text: vformat(_('Updated %s'), updated),
    };
}

export function groupHeading(label) {
    return {kind: 'group-heading', label};
}

// A null severity paints the fill muted (a breakdown share, not a quota).
export function groupedUsage({group = '', label, percent, valueText, detail = null, severity = null}, theme) {
    return {
        kind: 'grouped',
        key: `${group}\u0000${label}`,
        label,
        pct: percent,
        valueText,
        detail,
        severity,
        color: severity ? severityColor(severity, theme) : theme.dim,
        trackColor: theme.barEmpty,
    };
}
