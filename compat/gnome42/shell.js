// GNOME 42 port: the shell's own modules are legacy scripts there, reachable
// only through the global `imports` object, never as ES modules.
export const Main = imports.ui.main;
export const MessageTray = imports.ui.messageTray;
export const PanelMenu = imports.ui.panelMenu;
export const PopupMenu = imports.ui.popupMenu;
export const ExtensionUtils = imports.misc.extensionUtils;

export {gettext, ngettext} from './gettext.js';

export function createNotificationSource(title, gicon) {
    const source = new MessageTray.Source(title, null);
    source.getIcon = () => gicon;
    return source;
}

export function showNotification(source, data, critical) {
    const notification = new MessageTray.Notification(source, data.title, data.body);
    notification.setUrgency(critical ? MessageTray.Urgency.CRITICAL : MessageTray.Urgency.NORMAL);
    source.showNotification(notification);
}
