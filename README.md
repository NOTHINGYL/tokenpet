# QuotaPet

A tiny desktop pet that tracks your AI tokens, quotas, and burn rate.

QuotaPet is a local-first desktop companion for AI coding workflows. The pet lives on your desktop, shows a compact token counter, and opens richer usage views from the pet, menu bar, or local dashboard.

## Status

v0.2 prototype. The desktop pet now reads local token usage through the bundled `ccusage` dependency.

## v0.2 Features

- Transparent always-on-top desktop pet window
- Draggable yellow-gold cat companion
- Live token counter displayed on the pet
- Click-to-open usage summary popover
- Real local usage snapshot from `ccusage` for Codex and Claude Code
- Today, 7 days, Local all time, Top model, burn rate, and provider status
- macOS-focused Electron prototype

QuotaPet uses the local `node_modules/.bin/ccusage` installed with this project. It reads local usage metadata only; no prompts, code, paths, or session content are sent anywhere.

## Planned Scope

- Desktop pet with a live token/quota display
- Clickable pet popover with key usage numbers
- Menu bar/tray companion with detailed status and settings
- Local dashboard for full token analytics and pet customization
- Provider adapters for tools such as Codex, Claude Code, Cursor, and ccusage-compatible sources
- macOS first, with Windows and Linux planned later

## Repository Layout

```text
apps/desktop        Desktop app shell
packages/core       Token, quota, pricing, and aggregation models
packages/providers  Tool-specific usage data adapters
packages/pet-engine Pet states, animations, skins, and effects
packages/ui         Shared UI for popovers and dashboard views
assets/pets         Pet art and animation assets
docs                Product and technical notes
```

## Development

Requires Node.js 18 or newer.

Install dependencies and start the desktop app for development:

```bash
npm install
npm run dev
```

Build and run the production bundle in the foreground:

```bash
npm run build
npm start
```

Launch QuotaPet in the background so it keeps running after the terminal closes:

```bash
npm run launch
```

## License

MIT
