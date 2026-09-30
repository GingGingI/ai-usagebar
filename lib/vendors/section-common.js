import {localTimeHm, vformat} from '../format.js';
import {formatBackoff} from '../countdown.js';
import {RATE_LIMITED} from './fetch-common.js';

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

// The text for an `ok:false` error result; a coded error is translated here
// because main.js has no translator.
export function errorText(res, _ = (s) => s) {
    if (res.code === RATE_LIMITED)
        return rateLimitedText(res.retryInMs, _);
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
    return {
        kind: 'http-error',
        icon: server ? ICON_ERR_SERVER : ICON_ERR_CLIENT,
        color: server ? theme.red : theme.orange,
        code,
        status: vformat(_('HTTP %s'), code),
        lines: wrapWords(body, ERROR_WRAP_COLS),
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
