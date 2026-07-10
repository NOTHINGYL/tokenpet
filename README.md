# TokenPet

> TokenPet makes local AI usage visible, playful, and private.

TokenPet turns local token flow into a tiny desktop companion. The Golden British actor wakes, breathes, reacts to clicks and drag/drop, reflects usage moods, and keeps a gentle local Journey without chores, punishment, accounts, or cloud telemetry.

## Pet story

- **Manifest-driven actor:** the desktop pet, console preview, and Quick Play use the same generated actor bundle and dynamic token/mood slots.
- **Pet Director:** stable action ids flow through a capability gate before playback. Missing dedicated frames use declared fallbacks; unsupported features are not presented as ready.
- **Quick Play:** double-click the pet for a compact remote with Pet, Feed snack, Play cursor, Dangle toy, Toss yarn, Nap, Wake, Summon, and Capture actions.
- **Gentle Journey:** lifecycle progress and local memories derive from local use. Switching cat type never resets shared behavior or progress.
- **Local first:** usage, settings, thresholds, journey state, and memories remain on the machine.

Golden British is the first actor-ready cat. Other cat types intentionally use approved static fallback images until an actor bundle is available.

A tiny desktop pet that tracks your AI tokens, quotas, and burn rate.

TokenPet is a local-first desktop companion for AI coding workflows. The pet lives on your desktop, shows a compact token counter, and opens richer usage views from the pet, menu bar, or local dashboard.

## Status

v0.6.1 prototype. The desktop pet now has a frame-based action system, matching cat animation assets, burn-rate-aware mood states, adjustable size/opacity, persistent settings, and real local token usage through the bundled `ccusage` dependency.

## Preview

The screenshots below use bundled demo data for documentation only. The app itself reads local usage metadata from your machine.

![TokenPet console](docs/screenshots/console-v05.png)

<p>
  <img src="docs/screenshots/menubar-v05.png" alt="TokenPet menu bar panel" width="360" />
  <img src="docs/screenshots/pet-v05.png" alt="TokenPet desktop pet" width="260" />
</p>

## v0.6.1 Features

- Transparent always-on-top desktop pet window
- Draggable yellow-gold cat companion with frame-based idle breathing, blink/look, and wave actions
- Reproducible action-frame assets generated from the current cat artwork
- Live token counter displayed on the pet
- Click or double-click to open the usage summary popover, with a feedback animation
- Burn-rate-aware pet mood states: sleepy, focused, and hot
- macOS menu bar icon with a richer status panel
- Refresh, open console, and quit controls from the menu bar panel
- Persistent settings for launch at login, pet visibility, always-on-top mode, pet theme, pet size, and pet opacity
- Tabbed console with Overview, Breakdown, Cost & Efficiency, Pet, and Settings views
- Daily trend, forecast, model breakdown, session breakdown, cost structure, and activity heatmap charts
- Polished card styling, status badges, empty states, and loading/error handling
- Basic pet color theme switching
- Real local usage snapshot from `ccusage` for Codex and Claude Code
- Source status rows for Codex, Claude Code, Cursor, and ccusage
- Today, 7 days, Local all time, Top model, burn rate, and provider status
- macOS-focused Electron prototype

TokenPet uses the local `node_modules/.bin/ccusage` installed with this project. It reads local usage metadata only; no prompts, code, paths, or session content are sent anywhere.

## Planned Scope

- Desktop pet with a live token/quota display
- Clickable pet popover with key usage numbers
- Menu bar/tray companion with detailed status and settings
- Local dashboard for full token analytics and pet customization
- Provider adapters for tools such as Codex, Claude Code, Cursor, and ccusage-compatible sources
- macOS first, with Windows and Linux planned later

## Repository Layout

```text
apps/desktop/electron/main.ts       Electron window, tray, IPC, and app lifecycle
apps/desktop/electron/usage.ts      Local ccusage/provider loading and aggregation
apps/desktop/electron/types.ts      Main-process data contracts
apps/desktop/src/App.tsx            Renderer view router
apps/desktop/src/views              Pet, popover, menu bar, and console screens
apps/desktop/src/components         Shared UI, charts, and pet components
apps/desktop/src/hooks              Renderer data/settings hooks
apps/desktop/src/state              Fallback renderer state
apps/desktop/src/styles             Split CSS by base, pet, panels, and console
apps/desktop/src/types.ts           Renderer data contracts
```

Future shared packages such as `packages/providers`, `packages/pet-engine`, and
`packages/ui` can be introduced once the desktop app has more repeated logic to
extract.

## Development

Requires Node.js 20.19+ or 22.12+.

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

Launch TokenPet in the background so it keeps running after the terminal closes:

```bash
npm run launch
```

Regenerate README screenshots with deterministic demo data:

```bash
npm run screenshots
```

## License

MIT
