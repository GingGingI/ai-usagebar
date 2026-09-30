import {severityFor, severityColor} from '../../severity.js';
import {calc, paceGlyph} from '../../pacing.js';
import {fillColors} from '../../pace-fill.js';
import {format as formatCountdown, formatWithClock, localDateHm} from '../../countdown.js';
import {vformat} from '../../format.js';
import {httpErrorRow, footerRow, wrapWords, groupHeading} from '../section-common.js';
import {SESSION_MS, WEEKLY_MS, formatExtraAmount, extraPercent} from './parser.js';

export {wrapWords};

const ICON_SESSION = 'alarm-symbolic';
const ICON_WEEKLY = 'x-office-calendar-symbolic';
const ICON_SONNET = 'starred-symbolic';
const ICON_EXTRA = 'utilities-system-monitor-symbolic';

function windowRow(icon, title, win, windowMs, now, theme, _) {
    const pct = win.utilizationPct;
    const pace = windowMs === null
        ? null
        : calc({usagePct: pct, reset: win.resetsAt, now, windowMs});
    const reset = formatCountdown(win.resetsAt, now, _);
    const {base, over} = fillColors(pct, pace ? pace.elapsedPct : null, theme);
    return {
        kind: 'window',
        icon,
        title,
        pct,
        color: base,
        reset,
        subtitle: formatWithClock(win.resetsAt, now, _),
        paceGlyph: pace ? paceGlyph(pace.ratioPace) : '',
        ...(pace ? {elapsedPct: pace.elapsedPct, paceColor: over} : {}),
    };
}

function expiryText(endsAt, now, _) {
    if (endsAt === null || endsAt === undefined)
        return _('no expiry reported');
    if (endsAt.getTime() <= now.getTime())
        return vformat(_('expired %s'), localDateHm(endsAt));
    // Translators: "expires Oct 22 16:00 (3d 4h)" — the date and time, then a countdown.
    return vformat(_('expires %s (%s)'), localDateHm(endsAt), formatCountdown(endsAt, now, _));
}

function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

// A grant without an expiry sorts first, as upstream does.
function byExpiry(a, b) {
    return (a.endsAt?.getTime() ?? -Infinity) - (b.endsAt?.getTime() ?? -Infinity);
}

function resetRows(resets, now, _) {
    if (!resets || resets.length === 0)
        return [];
    const rows = [groupHeading(_('Resets'))];
    for (const r of [...resets].sort(byExpiry)) {
        const expiry = expiryText(r.endsAt, now, _);
        rows.push({kind: 'text', text: r.label ? `${r.label} · ${expiry}` : capitalize(expiry)});
    }
    return rows;
}

export function buildSection(snapshot, meta, now, theme, _ = (s) => s) {
    const rows = [];

    rows.push(windowRow(ICON_SESSION, _('Session'), snapshot.session, SESSION_MS, now, theme, _));
    rows.push(windowRow(ICON_WEEKLY, _('Weekly'), snapshot.weekly, WEEKLY_MS, now, theme, _));
    if (snapshot.sonnet)
        rows.push(windowRow(ICON_SONNET, _('Sonnet only'), snapshot.sonnet, null, now, theme, _));

    // Model-scoped weekly caps (e.g. Fable). Same weekly window kind as above;
    // the title is the API's model display name, a brand label kept verbatim
    // (outside `_()`).
    for (const sw of snapshot.scoped ?? [])
        rows.push(windowRow(ICON_WEEKLY, sw.label, sw, WEEKLY_MS, now, theme, _));

    const extra = snapshot.extra;
    if (extra && extra.limitCents === null) {
        // No cap means no denominator: the spend is shown without a bar (no `pct`).
        rows.push({
            kind: 'gauge',
            icon: ICON_EXTRA,
            title: _('Extra usage'),
            value: formatExtraAmount(extra, extra.spentCents),
            subLine: _('Limit: none reported'),
            color: null,
        });
    } else if (extra) {
        const extraPct = extraPercent(extra);
        rows.push({
            kind: 'gauge',
            icon: ICON_EXTRA,
            title: _('Extra usage'),
            pct: extraPct,
            value: formatExtraAmount(extra, extra.spentCents),
            subLine: vformat(_('Limit: %s'), formatExtraAmount(extra, extra.limitCents)),
            color: severityColor(severityFor(extraPct), theme),
        });
    }

    rows.push(...resetRows(snapshot.resets, now, _));

    const err = httpErrorRow(meta, theme, _);
    if (err)
        rows.push(err);

    rows.push(footerRow(meta, _));

    // Translators: %s is the Anthropic plan name (e.g. "Max 5x") — kept verbatim.
    return {title: vformat(_('Claude %s'), snapshot.plan), plan: snapshot.plan, rows};
}
