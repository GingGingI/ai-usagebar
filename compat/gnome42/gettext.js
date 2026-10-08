// Shared by the shell and the preferences process; the domain is bound to the
// extension's locale directory by ExtensionUtils.initTranslations() in init().
const domain = imports.gettext.domain('ai-usagebar@wilfison');

export const gettext = domain.gettext;
export const ngettext = domain.ngettext;
