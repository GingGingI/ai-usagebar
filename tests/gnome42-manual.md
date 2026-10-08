# GNOME 42 integration check

Build first with `make build-gnome42`. To test the staged extension without
changing the current desktop's settings, create an isolated profile and launch
a nested Shell. Set the XDG variables **before** starting `dbus-run-session` so
the D-Bus-activated dconf service uses that same profile.

```bash
test_root=$(mktemp -d)
mkdir -p "$test_root/data/gnome-shell/extensions" "$test_root/config" "$test_root/cache"
ln -s "$PWD/build/gnome42/ai-usagebar@wilfison" \
    "$test_root/data/gnome-shell/extensions/ai-usagebar@wilfison"
XDG_DATA_HOME="$test_root/data" XDG_CONFIG_HOME="$test_root/config" \
XDG_CACHE_HOME="$test_root/cache" GDK_BACKEND=wayland \
GNOME_SHELL_SESSION_MODE=user AI_USAGEBAR_FAKE_PCT=23 \
dbus-run-session -- bash -c '
    gsettings set org.gnome.shell enabled-extensions "[\"ai-usagebar@wilfison\"]"
    gsettings --schemadir build/gnome42/ai-usagebar@wilfison/schemas \
        set org.gnome.shell.extensions.ai-usagebar update-check-enabled false
    gsettings --schemadir build/gnome42/ai-usagebar@wilfison/schemas \
        set org.gnome.shell.extensions.ai-usagebar notify-enabled false
    gnome-shell --wayland --nested --sm-disable
'
```

Check the following inside the test Shell:

- Four panel labels appear for the default enabled vendors. Each has its own
  logo and synthetic 23% usage.
- Clicking a vendor opens the popup with that vendor's section expanded.
- Scrolling selects another section while all panel labels remain visible.
- Preferences > Panel lists all vendors. Deselecting one removes only that
  vendor from the panel; selecting a disabled one also enables it.
- Preferences > Panel label shows a default label and a field for each selected
  vendor. Empty fields inherit the default; a custom template changes only its
  vendor's panel label.
- Preferences > Display > Show vendor logos replaces logos with short codes.
- Deselecting all vendors shows "No panel vendors selected" and does not fetch.
- Closing the popup leaves the panel countdowns updating once a minute.
- Disabling and re-enabling the extension does not leave timers or actors behind.

## Recorded validation (2026-10-08)

On GNOME Shell 42.9 / Ubuntu 22.04, the staged extension was launched with the
isolated XDG profile above, synthetic usage, and
`gnome-shell --headless --wayland --no-x11 --virtual-monitor=1600x900 --sm-disable`.
A temporary test extension allowed D-Bus `org.gnome.Shell.Eval` only in that
isolated Shell. Shell screenshots confirmed four logos and separate usage labels.
A virtual pointer click on OpenRouter opened the popup and expanded OpenRouter.
The previous single-vendor mode, vendor disabling, short-code display, an injected error,
all-disabled configuration and disable/re-enable were checked in the Shell.
The injected Anthropic error displayed a warning only for Anthropic; the other
labels retained their usage. Preferences were rendered with GTK 4.6 and
libadwaita 1.1. The per-vendor fetch guard also completed the unit suite with
libsoup 2.4.

`NO_COLOR=1 make test` and `NO_COLOR=1 make test-gnome42` each passed 1,219 tests
across 57 files. `make lint`, ESLint with Node 22, `make validate`,
`make i18n-check`, `make pack` and `make pack-gnome42` were run.
Modern GNOME 47–51 Shell UI was not available for a live rendering check.
Synthetic snapshots were used for Shell rendering, so these checks do not
verify real vendor credentials or network quotas.

The panel selection and custom-label follow-up was checked in the same isolated
GNOME 42 Shell. Selecting Anthropic and OpenAI showed only those two panel
items, with OpenAI's custom label (`{weekly_pct}% weekly`) and Anthropic's
default label (`{session_pct}%`) rendered from synthetic usage. Selecting only
OpenAI removed Anthropic, and selecting none displayed the empty-panel text.
In the actual GTK preferences window, deselecting OpenAI removed it from the
panel; selecting disabled DeepSeek enabled it and added its panel item. The
Panel label group displayed the default field and only Anthropic and DeepSeek
custom fields after that selection. Both test suites passed 1,232 tests across
58 files for this follow-up.
