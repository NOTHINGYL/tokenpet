# QuotaPet

A tiny desktop pet that tracks your AI tokens, quotas, and burn rate.

QuotaPet is planned as a local-first desktop companion for AI coding workflows. The pet lives on your desktop, shows a compact token counter, and opens richer usage views from the pet, menu bar, or local dashboard.

## Status

Early setup. Product design and implementation details are still being shaped.

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

This repository is intentionally minimal until the first implementation plan is finalized.

```bash
pnpm install
pnpm check
```

## License

MIT
