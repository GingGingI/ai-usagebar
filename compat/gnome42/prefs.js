/* exported init, fillPreferencesWindow */

// GNOME 42 port: loaded as a legacy script, so the ES-module preferences UI
// (prefsWindow.js) is pulled in with a dynamic import and fills the window
// once it has loaded.
const {Adw} = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

function init() {
    ExtensionUtils.initTranslations();
}

function fillPreferencesWindow(window) {
    // The shell rejects a window with no visible_page, so one stays behind our content.
    window.add(new Adw.PreferencesPage());
    window.set_default_size(860, 640);

    import(`${Me.dir.get_uri()}/prefsWindow.js`)
        .then(module => new module.default(Me).fillPreferencesWindow(window))
        .catch(e => logError(e, 'ai-usagebar: could not build the preferences'));
}
