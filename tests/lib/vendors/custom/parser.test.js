import system from 'system';

import {
    parseUsage, validateMapping, placeholders, customPeakUsage, customSeverity, formatNumber, SchemaError,
} from '../../../../lib/vendors/custom/parser.js';
import {Severity} from '../../../../lib/severity.js';
import {describe, it, assertEqual, assertDeepEqual, summary} from '../../../_assert.js';

const NOW = new Date('2026-06-05T12:00:00Z');

const BODY = JSON.stringify({
    account: {tier: 'Team'},
    usage: {used: 12, limit: 100, pct: '42.6', reset_ms: 1_780_000_000_000, reset_s: '1780000000',
        reset_iso: '2026-06-06T00:00:00Z', left: 3600},
    status: {ok: true, region: 'eu', count: 7, ratio: 0.125},
});

function parse(mapping, body = BODY) {
    return parseUsage(body, mapping, NOW);
}

function schemaError(fn) {
    try {
        fn();
    } catch (e) {
        return e instanceof SchemaError ? e.message : `wrong error: ${e}`;
    }
    return null;
}

const metric = (extra) => ({metrics: [Object.assign({label: 'Requests'}, extra)]});

describe('parseUsage — metrics', () => {
    it('used + limit → rounded, clamped percent with an "X of Y" footnote', () => {
        const m = parse(metric({used: '/usage/used', limit: '/usage/limit'})).metrics[0];
        assertEqual(m.pct, 12);
        assertEqual(m.footnote, '12 of 100');
        assertEqual(parse(metric({used: '/a', limit: '/b'}), '{"a":2,"b":3}').metrics[0].pct, 67);
        assertEqual(parse(metric({used: '/a', limit: '/b'}), '{"a":250,"b":100}').metrics[0].pct, 100);
    });

    it('a limit of 0 or less is a SchemaError', () => {
        assertEqual(schemaError(() => parse(metric({used: '/a', limit: '/b'}), '{"a":1,"b":0}')) !== null, true);
        assertEqual(schemaError(() => parse(metric({used: '/a', limit: '/b'}), '{"a":1,"b":-5}')) !== null, true);
    });

    it('percent alone is used directly (numeric strings accepted), with no footnote', () => {
        const m = parse(metric({percent: '/usage/pct'})).metrics[0];
        assertEqual(m.pct, 43);
        assertEqual(m.footnote, '');
    });

    it('rejects number-like strings that are not plain numbers', () => {
        for (const bad of ['"1,234"', '"inf"', '"0x10"', '""'])
            assertEqual(schemaError(() => parse(metric({percent: '/p'}), `{"p":${bad}}`)) !== null, true);
    });

    it('resetsAt accepts epoch ms, epoch s (number or string) and RFC 3339', () => {
        assertEqual(parse(metric({percent: '/usage/pct', resetsAt: '/usage/reset_ms'})).metrics[0].resetsAt.getTime(), 1_780_000_000_000);
        assertEqual(parse(metric({percent: '/usage/pct', resetsAt: '/usage/reset_s'})).metrics[0].resetsAt.getTime(), 1_780_000_000_000);
        assertEqual(parse(metric({percent: '/usage/pct', resetsAt: '/usage/reset_iso'})).metrics[0].resetsAt.toISOString(),
            '2026-06-06T00:00:00.000Z');
    });

    it('a negative or unreadable timestamp is a SchemaError', () => {
        assertEqual(schemaError(() => parse(metric({percent: '/p', resetsAt: '/r'}), '{"p":1,"r":-1}')) !== null, true);
        assertEqual(schemaError(() => parse(metric({percent: '/p', resetsAt: '/r'}), '{"p":1,"r":"tomorrow"}')) !== null, true);
        assertEqual(schemaError(() => parse(metric({percent: '/p', resetsAt: '/r'}), '{"p":1,"r":true}')) !== null, true);
    });

    it('resetsAfterSeconds is relative to now', () => {
        const m = parse(metric({percent: '/usage/pct', resetsAfterSeconds: '/usage/left'})).metrics[0];
        assertEqual(m.resetsAt.getTime(), NOW.getTime() + 3600 * 1000);
    });

    it('when both resolve, resetsAt wins', () => {
        const m = parse(metric({percent: '/usage/pct', resetsAt: '/usage/reset_ms', resetsAfterSeconds: '/usage/left'})).metrics[0];
        assertEqual(m.resetsAt.getTime(), 1_780_000_000_000);
    });

    it('windowSecs becomes windowMs; absent is null', () => {
        assertEqual(parse(metric({percent: '/usage/pct', windowSecs: 3600})).metrics[0].windowMs, 3_600_000);
        assertEqual(parse(metric({percent: '/usage/pct'})).metrics[0].windowMs, null);
    });

    it('a pointer that does not resolve fails the whole projection', () => {
        const msg = schemaError(() => parse(metric({used: '/usage/used', limit: '/usage/nope'})));
        assertEqual(msg.includes('/usage/nope'), true);
    });

    it('a wrong type is a SchemaError', () => {
        assertEqual(schemaError(() => parse(metric({percent: '/usage'}))) !== null, true);
        assertEqual(schemaError(() => parse(metric({percent: '/status/ok'}))) !== null, true);
    });
});

describe('parseUsage — plan and texts', () => {
    it('planPath wins over plan', () => {
        assertEqual(parse({plan: 'Static', planPath: '/account/tier', texts: [{label: 'x', value: '/status/region'}]}).plan, 'Team');
        assertEqual(parse({plan: 'Static', texts: [{label: 'x', value: '/status/region'}]}).plan, 'Static');
        assertEqual(parse({texts: [{label: 'x', value: '/status/region'}]}).plan, null);
    });

    it('texts accept strings, numbers and booleans', () => {
        const s = parse({texts: [
            {label: 'Region', value: '/status/region'},
            {label: 'Count', value: '/status/count'},
            {label: 'Ratio', value: '/status/ratio'},
            {label: 'OK', value: '/status/ok'},
        ]});
        assertDeepEqual(s.texts.map(t => t.value), ['eu', '7', '0.13', 'true']);
    });

    it('a text of another type is a SchemaError', () =>
        assertEqual(schemaError(() => parse({texts: [{label: 'x', value: '/usage'}]})) !== null, true));

    it('sanitizes and caps every string at 200 characters', () => {
        const body = JSON.stringify({name: `ev‮il\u0007${'x'.repeat(300)}`, plan: 'Pro‏'});
        const s = parse({planPath: '/plan', texts: [{label: 'Name', value: '/name'}]}, body);
        assertEqual(s.plan, 'Pro');
        assertEqual(s.texts[0].value.startsWith('evil'), true);
        assertEqual(Array.from(s.texts[0].value).length, 200);
    });

    it('an unparseable body is a SchemaError', () =>
        assertEqual(schemaError(() => parse(metric({percent: '/p'}), 'not json')) !== null, true));
});

describe('validateMapping', () => {
    const valid = {metrics: [{label: 'Requests', used: '/u', limit: '/l', windowSecs: 3600}], texts: [{label: 'Region', value: '/r'}]};

    it('accepts a valid mapping', () => assertDeepEqual(validateMapping(valid), []));

    it('needs at least one metric or text', () => {
        assertEqual(validateMapping({}).length, 1);
        assertEqual(validateMapping({metrics: [], texts: []}).length, 1);
        assertEqual(validateMapping(null).length, 1);
    });

    it('rejects invalid pointers', () => {
        assertEqual(validateMapping({metrics: [{label: 'A', percent: 'p'}]}).length > 0, true);
        assertEqual(validateMapping({planPath: '', texts: [{label: 'A', value: '/v'}]}).length > 0, true);
        assertEqual(validateMapping({texts: [{label: 'A', value: ''}]}).length > 0, true);
    });

    it('percent cannot coexist with used/limit, and one of them is required', () => {
        assertEqual(validateMapping({metrics: [{label: 'A', percent: '/p', used: '/u', limit: '/l'}]}).length > 0, true);
        assertEqual(validateMapping({metrics: [{label: 'A', used: '/u'}]}).length > 0, true);
    });

    it('labels are 1–64 characters, without controls, and unique', () => {
        assertEqual(validateMapping({texts: [{label: '', value: '/v'}]}).length > 0, true);
        assertEqual(validateMapping({texts: [{label: 'x'.repeat(65), value: '/v'}]}).length > 0, true);
        assertEqual(validateMapping({texts: [{label: 'a\tb', value: '/v'}]}).length > 0, true);
        const dup = validateMapping({metrics: [{label: 'Same', percent: '/p'}], texts: [{label: 'Same', value: '/v'}]});
        assertEqual(dup.some(e => e.includes('used twice')), true);
    });

    it('windowSecs must be an integer of at least 60', () => {
        assertEqual(validateMapping({metrics: [{label: 'A', percent: '/p', windowSecs: 59}]}).length > 0, true);
        assertEqual(validateMapping({metrics: [{label: 'A', percent: '/p', windowSecs: 90.5}]}).length > 0, true);
        assertDeepEqual(validateMapping({metrics: [{label: 'A', percent: '/p', windowSecs: 60}]}), []);
    });
});

describe('placeholders / peak / severity', () => {
    const s = parse({planPath: '/account/tier', metrics: [
        {label: 'A', used: '/usage/used', limit: '/usage/limit', resetsAfterSeconds: '/usage/left'},
        {label: 'B', percent: '/usage/pct'},
        {label: 'C', percent: '/status/count'},
    ]});

    it('indexes every metric and aliases the first two', () => {
        const m = placeholders(s, NOW);
        assertEqual(m.get('custom_plan'), 'Team');
        assertEqual(m.get('custom_0_pct'), '12');
        assertEqual(m.get('custom_1_pct'), '43');
        assertEqual(m.get('custom_2_pct'), '7');
        assertEqual(m.get('custom_0_reset'), '1h 00m');
        assertEqual(m.get('session_pct'), '12');
        assertEqual(m.get('weekly_pct'), '43');
    });

    it('peak and severity follow the highest metric', () => {
        assertEqual(customPeakUsage(s).percent, 43);
        assertEqual(customSeverity(s), Severity.LOW);
        assertEqual(customPeakUsage({metrics: []}).percent, null);
    });
});

describe('formatNumber', () => {
    it('integers verbatim, fractions to at most 2 places', () => {
        assertEqual(formatNumber(100), '100');
        assertEqual(formatNumber(2.5), '2.5');
        assertEqual(formatNumber(1 / 3), '0.33');
        assertEqual(formatNumber(2.0), '2');
    });
});

system.exit(summary());
