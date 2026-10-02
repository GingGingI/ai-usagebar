import {VENDOR_IDS, vendorIconName, vendorLabel} from './vendors.js';

// The prefs sidebar: ordered sections of {id, title, icon} items, one page each.
export function prefsNav(_ = s => s) {
    return [
        {
            id: 'general',
            title: _('General'),
            items: [
                {id: 'panel', title: _('Panel'), icon: 'focus-top-bar-symbolic'},
                {id: 'popup', title: _('Popup'), icon: 'view-list-symbolic'},
                {id: 'display', title: _('Display'), icon: 'preferences-desktop-appearance-symbolic'},
                {id: 'behavior', title: _('Behavior'), icon: 'preferences-system-symbolic'},
            ],
        },
        {
            id: 'vendors',
            title: _('Vendors'),
            items: VENDOR_IDS.map(id => ({
                id,
                // Brand names stay verbatim; only the custom provider's label is prose.
                title: id === 'custom' ? _('Custom') : vendorLabel(id),
                icon: vendorIconName(id),
            })),
        },
    ];
}

export function prefsNavItems(nav) {
    return nav.flatMap(section => section.items);
}
