import {vformat} from './format.js';

// How long until a rate-limit backoff lifts: seconds under a minute, whole
// minutes rounded up under an hour, then hours and minutes.
export function formatBackoff(ms, _ = (s) => s) {
    const secs = Math.max(0, Math.ceil(ms / 1000));
    if (secs < 60)
        // Translators: compact duration — s = seconds.
        return vformat(_('%ds'), secs);
    const mins = Math.ceil(secs / 60);
    if (mins < 60)
        // Translators: compact duration — m = minutes.
        return vformat(_('%dm'), mins);
    // Translators: compact duration — h = hours, m = minutes.
    return vformat(_('%dh %dm'), Math.floor(mins / 60), mins % 60);
}

export function format(reset, now, _ = (s) => s) {
    if (reset === null || reset === undefined)
        return '—'; // em-dash marker — punctuation, not translated.

    const secs = Math.floor((reset.getTime() - now.getTime()) / 1000);
    if (secs <= 0)
        return _('now');

    const days = Math.floor(secs / 86400);
    const hours = Math.floor((secs % 86400) / 3600);
    const mins = Math.floor((secs % 3600) / 60);

    if (days > 0)
        // Translators: compact countdown — d = days, h = hours.
        return vformat(_('%dd %dh'), days, hours);
    // Translators: compact countdown — h = hours, m = minutes (zero-padded).
    return vformat(_('%dh %02dm'), hours, mins);
}
