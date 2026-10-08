/* exported init, enable, disable */

// GNOME 42 port: the shell loads this file as a legacy script, so the ES
// modules that make up the extension are pulled in with a dynamic import.
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

let _enabled = false;
let _loading = null;
let _instance = null;

function init() {
    ExtensionUtils.initTranslations();
}

function enable() {
    _enabled = true;
    if (_loading === null)
        _loading = import(`${Me.dir.get_uri()}/main.js`);
    _loading.then(module => {
        // disable() may have run while the modules were still loading.
        if (!_enabled || _instance !== null)
            return;
        _instance = new module.default(Me);
        _instance.enable();
    }).catch(e => {
        _instance = null;
        logError(e, 'ai-usagebar: could not start');
    });
}

function disable() {
    _enabled = false;
    if (_instance !== null) {
        _instance.disable();
        _instance = null;
    }
}
