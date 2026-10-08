import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

export {gettext, ngettext} from 'resource:///org/gnome/shell/extensions/extension.js';
export * as Main from 'resource:///org/gnome/shell/ui/main.js';
export * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
export * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

export function createNotificationSource(title, icon) {
    return new MessageTray.Source({title, icon});
}

export function showNotification(source, data, critical) {
    source.addNotification(new MessageTray.Notification({
        source,
        title: data.title,
        body: data.body,
        urgency: critical ? MessageTray.Urgency.CRITICAL : MessageTray.Urgency.NORMAL,
    }));
}
