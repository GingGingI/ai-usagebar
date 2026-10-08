import system from 'system';

import {remainingPercent, substitute} from '../lib/format.js';
import {fakeSnapshot as anthropicFake, parseUsage as anthropicParseUsage, placeholders as anthropicPlaceholders} from '../lib/vendors/anthropic/parser.js';
import {fakeSnapshot as openaiFake, placeholders as openaiPlaceholders} from '../lib/vendors/openai/parser.js';
import {fakeSnapshot as zaiFake, placeholders as zaiPlaceholders} from '../lib/vendors/zai/parser.js';
import {fakeSnapshot as openrouterFake, placeholders as openrouterPlaceholders} from '../lib/vendors/openrouter/parser.js';
import {fakeSnapshot as deepseekFake, placeholders as deepseekPlaceholders} from '../lib/vendors/deepseek/parser.js';
import {fakeSnapshot as kimiFake, placeholders as kimiPlaceholders} from '../lib/vendors/kimi/parser.js';
import {fakeSnapshot as ollamaFake, placeholders as ollamaPlaceholders} from '../lib/vendors/ollama/parser.js';
import {placeholders as customPlaceholders} from '../lib/vendors/custom/parser.js';
import {describe, it, assertEqual, summary} from './_assert.js';

const NOW = new Date('2026-06-05T00:00:00Z');

describe('remainingPercent', () => {
    it('complements the displayed usage percentage', () => {
        assertEqual(remainingPercent(42), '58');
        assertEqual(remainingPercent('0'), '100');
        assertEqual(remainingPercent(100), '0');
    });

    it('leaves missing values empty and clamps unexpected values', () => {
        assertEqual(remainingPercent(''), '');
        assertEqual(remainingPercent(null), '');
        assertEqual(remainingPercent('unknown'), '');
        assertEqual(remainingPercent(-5), '100');
        assertEqual(remainingPercent(105), '0');
    });
});

describe('remaining percentage placeholders', () => {
    const quotaVendors = [
        ['Anthropic', anthropicFake, anthropicPlaceholders],
        ['OpenAI', openaiFake, openaiPlaceholders],
        ['Z.AI', zaiFake, zaiPlaceholders],
        ['OpenRouter', openrouterFake, openrouterPlaceholders],
        ['Kimi', kimiFake, kimiPlaceholders],
        ['Ollama', ollamaFake, ollamaPlaceholders],
    ];
    for (const [name, fake, placeholders] of quotaVendors) {
        it(`${name} shows 59% remaining when 41% is used`, () => {
            const values = placeholders(fake(41, NOW), NOW);
            assertEqual(values.get('session_rem'), '59');
            assertEqual(values.get('weekly_rem'), '59');
            assertEqual(values.get('session_remain'), '59');
            assertEqual(values.get('weekly_remain'), '59');
            assertEqual(substitute('{session_rem}% / {weekly_rem}%', values), '59% / 59%');
        });
    }

    it('does not invent a percentage for DeepSeek balance', () => {
        const values = deepseekPlaceholders(deepseekFake(41), NOW);
        assertEqual(values.get('session_rem'), '');
        assertEqual(values.get('weekly_rem'), '');
        assertEqual(values.get('session_remain'), '');
        assertEqual(values.get('weekly_remain'), '');
    });

    it('maps custom metrics to remaining percentages', () => {
        const values = customPlaceholders({name: 'Custom', plan: '', metrics: [
            {pct: 12, resetsAt: null, windowMs: null},
            {pct: 43, resetsAt: null, windowMs: null},
        ]}, NOW);
        assertEqual(values.get('session_rem'), '88');
        assertEqual(values.get('weekly_rem'), '57');
        assertEqual(values.get('session_remain'), '88');
        assertEqual(values.get('weekly_remain'), '57');
        assertEqual(customPlaceholders({name: 'Custom', metrics: []}, NOW).get('weekly_remain'), '');
        assertEqual(customPlaceholders({name: 'Custom', metrics: []}, NOW).get('weekly_rem'), '');
    });

    it('leaves an unreported weekly window empty', () => {
        assertEqual(anthropicPlaceholders(anthropicParseUsage('{}', 'Pro'), NOW).get('weekly_remain'), '');
        assertEqual(anthropicPlaceholders(anthropicParseUsage('{}', 'Pro'), NOW).get('weekly_rem'), '');
        const openai = openaiFake(41, NOW);
        assertEqual(openaiPlaceholders({...openai, weekly: null}, NOW).get('weekly_rem'), '');
        const kimi = kimiFake(41, NOW);
        assertEqual(kimiPlaceholders({...kimi, weekly: null}, NOW).get('weekly_rem'), '');
        const zai = zaiFake(41, NOW);
        assertEqual(zaiPlaceholders({...zai, weekly: null}, NOW).get('weekly_rem'), '');
    });
});

system.exit(summary());
