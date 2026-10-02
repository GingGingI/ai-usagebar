import system from 'system';

import {prefsNav, prefsNavItems} from '../../lib/prefs-nav.js';
import {VENDOR_IDS, vendorIconName} from '../../lib/vendors.js';
import {describe, it, assertEqual, assertDeepEqual, summary} from '../_assert.js';

const fake = s => `<${s}>`;

describe('prefsNav: sections', () => {
    it('lists General then Vendors', () =>
        assertDeepEqual(prefsNav().map(s => s.id), ['general', 'vendors']));
    it('titles the sections', () =>
        assertDeepEqual(prefsNav().map(s => s.title), ['General', 'Vendors']));
    it('lists the general items in order', () =>
        assertDeepEqual(prefsNav()[0].items.map(i => i.id), ['panel', 'popup', 'display', 'behavior']));
    it('lists one item per vendor, in VENDOR_IDS order', () =>
        assertDeepEqual(prefsNav()[1].items.map(i => i.id), [...VENDOR_IDS]));
});

describe('prefsNav: items', () => {
    const items = prefsNavItems(prefsNav());
    it('flattens every section', () => assertEqual(items.length, 4 + VENDOR_IDS.length));
    it('has unique ids', () => assertEqual(new Set(items.map(i => i.id)).size, items.length));
    it('gives every item a title and an icon', () =>
        assertEqual(items.every(i => i.title.length > 0 && i.icon.endsWith('-symbolic')), true));
    it('uses each vendor\'s own icon', () =>
        assertDeepEqual(prefsNav()[1].items.map(i => i.icon), VENDOR_IDS.map(vendorIconName)));
});

describe('prefsNav: translation', () => {
    const nav = prefsNav(fake);
    it('translates section titles', () =>
        assertDeepEqual(nav.map(s => s.title), ['<General>', '<Vendors>']));
    it('translates the general items', () =>
        assertDeepEqual(nav[0].items.map(i => i.title), ['<Panel>', '<Popup>', '<Display>', '<Behavior>']));
    it('keeps brand names verbatim and translates only Custom', () =>
        assertDeepEqual(
            nav[1].items.map(i => i.title),
            ['Anthropic', 'OpenAI', 'Z.AI', 'OpenRouter', 'DeepSeek', 'Kimi', 'Ollama', '<Custom>']
        ));
});

system.exit(summary());
