# AI Usage Bar

A GNOME Shell extension that shows your AI plan usage in the top panel for seven
vendors — **Anthropic (Claude)**, **OpenAI (Codex)**, **Z.AI / GLM**,
**OpenRouter**, **DeepSeek**, **Kimi**, and **Ollama Cloud** — plus one
**custom provider** you map yourself.

## Overview

The panel shows a compact label for the **active** vendor — e.g.
`Claude 42% · 3h12m` — colored by severity as you near a limit. Click it to open
a popup with a collapsible section per enabled vendor, and **scroll** the panel
button to cycle between them.

![AI Usage Bar screenshot](https://raw.githubusercontent.com/wilfison/ai-usagebar/main/screenshot.png)

## Supported vendors

| Vendor                 | What is shown                                    | Auth model                                                           |
| ---------------------- | ------------------------------------------------ | -------------------------------------------------------------------- |
| **Anthropic (Claude)** | Session + weekly usage %, reset countdowns, plan | OAuth credentials from `~/.claude/.credentials.json`, auto-refreshed |
| **OpenAI (Codex)**     | Plan usage and reset windows                     | OAuth from `~/.codex/auth.json`; optional admin key for org usage    |
| **Z.AI / GLM**         | Plan usage and reset windows                     | API key (env var or prefs entry)                                     |
| **OpenRouter**         | Credit balance and usage                         | API key (env var or prefs entry)                                     |
| **DeepSeek**           | Balance / credits                                | API key (env var or prefs entry)                                     |
| **Kimi**               | Weekly quota + 5h window usage %, reset countdowns, plan | API key (env var or prefs entry)                             |
| **Ollama Cloud**       | Session + weekly (or monthly) usage %, top 5 models per window, cost | API key (env var or prefs entry)                   |
| **Custom provider**    | Any metrics and texts you map from a JSON endpoint | Optional key in a header you choose (see [Custom provider](#custom-provider)) |

Only the **active** vendor is polled on the refresh timer; other enabled vendors
render from the last fetched result and are refreshed lazily on scroll-cycle or
via the popup's "Refresh all" button.

## Install

This extension targets **GNOME Shell 50**. There is no build step — it is plain
GJS / ES modules.

> [!NOTE]
> **Not on extensions.gnome.org.** This extension is distributed **only** through
> GitHub releases, not the official [extensions.gnome.org](https://extensions.gnome.org)

### From a packed zip

1. Download `ai-usagebar@wilfison.shell-extension.zip` from the
   [latest release](https://github.com/wilfison/ai-usagebar/releases/latest),
   or build it from a checkout with `make pack`.
2. Install it:

   ```bash
   gnome-extensions install --force ai-usagebar@wilfison.shell-extension.zip
   ```

   Or unzip it manually into
   `~/.local/share/gnome-shell/extensions/ai-usagebar@wilfison/`.

3. **Log out and back in** (on Wayland a full relog is required to load a new
   extension), then enable it:

   ```bash
   gnome-extensions enable ai-usagebar@wilfison
   ```

## Authentication

Credentials are read **locally** from disk or the environment — they are never
sent anywhere except the vendor's own usage endpoint.

- **Anthropic (Claude).** Reads OAuth credentials from
  `~/.claude/.credentials.json` (the same file the Claude CLI writes). The
  access token is refreshed automatically when it expires, and the refreshed
  token is written back to that file. The credentials path is configurable in
  preferences.
- **OpenAI (Codex).** Reads OAuth credentials from `~/.codex/auth.json`. An
  optional admin API key (default env var `OPENAI_ADMIN_KEY`) can be set for
  organization-level usage. The auth path is configurable in preferences.
- **Z.AI / GLM, OpenRouter, DeepSeek, Kimi, Ollama Cloud.** Use an API key. The
  key is resolved in this order:
  1. the named **environment variable** (defaults `ZAI_API_KEY`,
     `OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY`, `KIMI_API_KEY`,
     `OLLAMA_API_KEY`) if it is set;
  2. otherwise the **inline key** entered in preferences;
  3. otherwise the vendor reports a configuration error in its popup section.

  Ollama Cloud's key comes from <https://ollama.com/settings/keys>; the local
  `~/.ollama/id_ed25519` signing key is never read. Its usage route reports no
  plan name, so set one in preferences if you want it in the popup title.

## Custom provider

One extra slot turns any endpoint that answers a `GET` with JSON into a vendor.
Enable it on the **Custom** preferences page and fill in:

- **Name** — shown in the popup and notifications; its first three letters
  become the panel badge (`Team API` → `TEA`).
- **URL** — must be `https://`, unless **Allow plain HTTP** is on (for a local
  service). A URL with a user name or password is refused. Redirects are
  followed only within the same scheme, host and port; a redirect to another
  origin stops and shows as an HTTP error, so the key never leaves that origin.
- **API key** (env var or inline), **auth header** (default `Authorization`) and
  **auth scheme** (default `Bearer`; empty sends the key bare). With no key, no
  auth header is sent.
- **Extra headers** — a JSON object of string values, e.g. `{"X-Team": "core"}`;
  it must not repeat the auth header.
- **Mapping** — which fields of the response to show, each addressed by a
  [JSON Pointer](https://www.rfc-editor.org/rfc/rfc6901).

Given a response like

```json
{
  "account": {"tier": "Team"},
  "requests": {"used": 420, "limit": 1000, "resets_at": "2026-10-01T00:00:00Z"},
  "tokens": {"percent": 91.5, "seconds_left": 5400},
  "status": {"region": "sa-east-1", "healthy": true}
}
```

this mapping shows two usage rows and two text rows:

```json
{
  "planPath": "/account/tier",
  "metrics": [
    {"label": "Requests", "used": "/requests/used", "limit": "/requests/limit",
     "resetsAt": "/requests/resets_at", "windowSecs": 86400},
    {"label": "Tokens", "percent": "/tokens/percent", "resetsAfterSeconds": "/tokens/seconds_left"}
  ],
  "texts": [
    {"label": "Region", "value": "/status/region"},
    {"label": "Healthy", "value": "/status/healthy"}
  ]
}
```

- A **metric** has either `used` + `limit` (shown as `420 of 1000`) or a single
  `percent`, never both. Numbers may be JSON numbers or plain numeric strings.
- `resetsAt` takes an RFC 3339 timestamp or a Unix epoch in seconds or
  milliseconds; `resetsAfterSeconds` takes the seconds left instead. With
  `windowSecs` (at least 60) and a reset, the row gets the pace marker.
- A **text** shows a string, number or boolean as `label: value`.
- `plan` sets a fixed title; `planPath` reads it from the response instead.
- Labels are 1–64 characters and unique. The preferences check the mapping when
  the editor loses focus and keep the last valid one.
- A pointer that does not resolve, or resolves to the wrong type, fails the
  refresh; the last good figures stay on screen, marked stale.

In `bar-format`, the first two metrics are `{session_pct}`/`{session_reset}` and
`{weekly_pct}`/`{weekly_reset}`; every metric is also `{custom_<i>_pct}` and
`{custom_<i>_reset}` (from 0), and the plan is `{custom_plan}`.

## Configuration

Open preferences with `gnome-extensions prefs ai-usagebar@wilfison` (or the
gear button in the popup footer). The prefs window exposes:

- **Primary vendor** — the default active vendor on startup.
- **Refresh interval** — seconds between polls (minimum 300; the vendor
  endpoints rate-limit below that).
- **Per-vendor enable** — toggle each of the seven vendors on or off; only enabled
  vendors appear in the popup and the scroll cycle.
- **Panel label format** (`bar-format`) — a template with `{token}` placeholders,
  e.g. the default `{session_pct}% · {session_reset}`. The active vendor's
  identity is shown as an SVG icon before the text; add the `{vendor_short}`
  token if you also want the textual short code (`cld`, `gpt`, …).
- **Tooltip / extra rows format** (`tooltip-format`) — optional additive rows
  prepended to a vendor's popup section.
- **Severity colors** — the green / orange / red / critical threshold colors.
- **Pace marker** — show an on-/off-pace indicator comparing usage against
  elapsed time in the window.
- **Per-vendor auth** — credentials path (Anthropic/OpenAI), API-key env-var name
  and inline key (Z.AI/OpenRouter/DeepSeek/Kimi/Ollama), Z.AI plan tier, and
  Ollama plan name.

## Privacy & security

- The extension reads your **local** credential files
  (`~/.claude/.credentials.json`, `~/.codex/auth.json`) and any API keys you
  configure, only to authenticate requests to each vendor's usage endpoint.
- It contacts **only** the vendor usage APIs, over HTTPS, to fetch your plan
  status.
- There is **no telemetry** and no third-party analytics. Nothing is sent
  anywhere other than the vendor whose usage you are viewing.
- Credential files such as `*.credentials.json` and `auth.json` are never copied
  or logged; refreshed Anthropic tokens are written back only to the same local
  file they came from.

## Development

There is no build step; GNOME Shell loads the JS directly.

### Dependencies

- `gjs` — runs the pure-JS unit suite (`make test`) and the extension itself.
- `glib2` — provides `glib-compile-schemas` (`make schemas`) and the
  `gnome-extensions` packing tool (`make pack`).
- `gettext` — `msgfmt` / `msgmerge` / `xgettext` for the i18n targets.
- `libsoup3` — the libsoup3 typelib, so `gi://Soup` resolves in tests.
- `mutter-dev` — to launch a nested Wayland session with `make run`

**On Ubuntu**

```bash
sudo apt install gjs libglib2.0-bin gettext gir1.2-soup-3.0 mutter-dev-bin
```

**On Arch**

```bash
sudo pacman -S gjs glib2-devel gnome-shell gettext libsoup3 mutter
```

ESLint (`make eslint`) additionally needs Node and the dev deps: `npm ci`.

The `Makefile` is the canonical dev loop — run `make` to list all targets. The
common ones:

```bash
make test      # gjs pure-JS unit suite
make lint      # hygiene lint
make eslint    # GNOME Shell flat eslint config (needs npm ci)
make validate  # metadata.json + schema --strict
make run       # launch a throwaway nested gnome-shell (Wayland) to test live
make logs      # follow the gnome-shell journal
make pack      # build the installable zip (with compiled locales)
```

Contributions and bug reports are welcome at the project repository:
<https://github.com/wilfison/ai-usagebar>.

## Credits

This extension is an independent GNOME Shell port inspired by the
[`akitaonrails/ai-usagebar`](https://github.com/akitaonrails/ai-usagebar) Waybar
widget. Vendor names (Claude, OpenAI, Z.AI/GLM, OpenRouter, DeepSeek, Kimi, Ollama) are
used nominatively to identify each provider; no affiliation or endorsement is
implied.

## Trademarks & logos

This extension bundles **no vendor logos**. It ships a single generic symbolic
mark ([`icons/ai-symbolic.svg`](icons/ai-symbolic.svg)) and identifies each
provider by name only —
Claude, OpenAI, Z.AI/GLM, OpenRouter, DeepSeek, Kimi, Ollama — used nominatively to say
which service a panel entry refers to. No affiliation with, sponsorship by, or
endorsement from those companies is implied; this project is not affiliated with
any of them. The short codes shown in the panel (CLD, GPT, ZAI, OPR, DSK, KMI)
are plain abbreviations, not brand marks.

## License

MIT — see [`LICENSE`](LICENSE). The MIT license is GPL-compatible, so the
extension can be freely used and redistributed alongside GPL-licensed GNOME
components.
