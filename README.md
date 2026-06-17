# QuotaPet

A tiny desktop pet that tracks your AI tokens, quotas, and burn rate.

QuotaPet is a local-first desktop companion for AI coding workflows. The pet lives on your desktop, shows a compact token counter, and opens richer usage views from the pet, menu bar, or local dashboard.

## Status

v0.1 prototype. The desktop pet and click summary are implemented with mock token data.

## v0.1 Features

- Transparent always-on-top desktop pet window
- Draggable yellow-gold cat companion
- Live token counter displayed on the pet
- Click-to-open usage summary popover
- Mock usage snapshot for Today, 7 days, All time, Top model, and provider status
- macOS-focused Electron prototype

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

Install dependencies and start the desktop app:

```bash
npm install
npm run dev
```

Build and run the production bundle locally:

```bash
npm run build
npm start
```

## License

MIT
