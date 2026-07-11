# TokenPet

> TokenPet makes local AI usage visible, playful, and private.

TokenPet is a macOS-first desktop companion for local AI coding workflows. It reads local usage through the bundled `ccusage` dependency, turns token flow into a small pet mood and Journey, and keeps settings, milestones, and memories on the machine.

![TokenPet launch story: wake, token update, click, drag, drop, and milestone](docs/screenshots/pet-story/tokenpet-story-demo.gif)

![TokenPet Pet console](docs/screenshots/pet-story/console-appearance.png)

<p>
  <img src="docs/screenshots/pet-story/quick-play.png" alt="TokenPet Quick Play remote" width="405" />
  <img src="docs/screenshots/pet-story/desktop-pet.png" alt="TokenPet desktop pet" width="260" />
</p>

## Status

The current integrated release is `v0.8.1`.

- **One actor pipeline:** the desktop pet and every Console preview use the same generated Golden British actor bundle.
- **Dynamic slots:** token and mood text render only inside manifest-declared slots. The actor artwork already contains its cream token frame.
- **Pet Director:** click, drag/drop, token changes, lifecycle events, milestones, and Quick Play actions go through one priority and capability gate.
- **Real desktop choreography:** Actions includes `run_across`, a 12-step Golden British sequence built from four approved action poses that moves the real pet window safely across the active display; Lock position blocks it and Reduce Motion shortens it.
- **Ambient story loop:** non-Egg companions wake on startup/new days, blink on deterministic mode-aware intervals, rest at night or after inactivity, and wake again when local activity resumes.
- **Quick Play:** double-click the pet to open the v18 compact controller: nine stable actions, exactly three pet controls, and one Console command. Lock position gates movement actions, an active action leaves only Capture enabled, closing/reopening never cancels the session, and the 405×697 panel keeps a 32px safety gap from the pet.
- **Current-Space launch:** every app launch reveals one pet on the active macOS Space. Re-launching reuses and re-homes the existing instance instead of creating duplicate pets across desktops.
- **Five Pet pages:** Appearance, Actions, Mood & Reactions, Sound Cues, and Journey, plus Cat Type, Mood Looks, and Accessories subpages.
- **Local story state:** behavior, thresholds, sound cues, safety controls, Journey, memories, milestones, position, and appearance persist locally.

## First-minute demo

Install and launch:

```bash
npm install
npm run launch
```

Then follow this short demo path:

1. Watch the generated Golden British actor appear with its local token value.
2. Click the cat for `click_purr`.
3. Drag and release it for `drag_dangle` → `drop_bounce`.
4. Double-click it to open Quick Play.
5. Try Feed snack, Play cursor, Toss yarn, Nap here, Wake up, Summon, and Capture.
6. Choose **Open Console**, then review all five Pet pages.
7. In **Actions**, try **Run across desktop** to see the companion traverse the real work area.

Regenerate the launch GIF from the real renderer, Director, and approved actor bundle with synthetic local usage:

```bash
npm run demo:pet-story
```

The script drives `wake_up` → token update → `click_purr` → `drag_dangle` → `drop_bounce` → `milestone_celebrate`, records frame hashes, and verifies that every beat uses exactly one generated actor with its embedded token frame. GIF regeneration needs Python with Pillow; set `TOKENPET_PYTHON` if it is not available as `python3`.

Run the complete deterministic acceptance suite with synthetic data and no private user data:

```bash
npm run qa:pet-story
```

That command type-checks and builds the app, validates the actor schema and generated bundle, exercises the real Electron main process plus Pet/Quick Play/Menu Bar/Console renderers, checks crash recovery, native Capture/Summon/drag behavior, fallback/shared-state behavior, setting persistence, and layout overflow, then regenerates the screenshots and launch GIF under `docs/screenshots/pet-story`.

## Actor and capability status

Golden British is the first fully actor-ready cat. Its generated PNG states currently include the core loops and all nine Quick Play actions. The runtime never recreates cat anatomy with CSS, inline SVG, emoji, or primitive canvas shapes.

Other cat types use approved static fallback images as complete compositions. They remain selectable as appearance choices, but actor-only motion, dynamic token frames, mood loops, and runtime wearables are suppressed until a generated bundle declares them compatible; TokenPet does not draw a guessed canvas pill over the fallback. The approved mood-badge UI overlay may remain available because it does not alter cat anatomy. Cat type changes appearance only; it never resets behavior, thresholds, sound, Journey, milestones, or memories.

Capability-gated work that is intentionally not presented as fully shipped:

- `hatch` currently resolves to `milestone_celebrate`.
- `level_up` currently resolves to `milestone_celebrate`.
- `daily_digest` is a local data-model milestone; its final visual card is planned.
- Rich memory-shelf and lifecycle-room art is planned.
- Lifecycle thresholds are fixed in this release at 1M/50M/500M tokens plus 7/30 active days; user-customizable lifecycle thresholds are target-design work for a later release.
- The target-design alternative “first completed focus session” path to Desk Buddy is planned; this release does not claim a reliable focus-session completion signal.
- Additional actor-ready cat bundles are planned; static fallbacks remain in place.
- Arbitrary runtime wearables are not supported for the generated actor. Only baked/manifest-compatible looks may be presented as usable.

The generated manifest is the source of truth: `ready` plays a same-id animation, `fallback` resolves through a declared chain, `planned` is disabled, and `unavailable` is hidden.

## Pet surfaces

### Appearance

Select the cat image, actor-safe token display, mood badge, Mood Looks, and compatible appearance options. Changes apply immediately. Cat Type is visual-only; thresholds belong in Mood & Reactions.

### Actions

Configure behavior mode, inspect implementation ids, test multi-frame actor states, play `run_across` on the real desktop, and adjust interaction and motion-safety rules. Direct manipulation has higher priority than reactions, milestones, mood loops, and lifecycle idle.

### Mood & Reactions

Configure ordered local token thresholds and map Sleepy, Focused, Hot, and Overdrive to `sleep_loop`, `focus_loop`, `hot_loop`, and `overdrive_loop`.

### Sound Cues

Optional local WebAudio cues support wake, purr, drag/drop, snack, milestone, hot, and rest moments. Master/cue volume, quiet hours, and focus muting are persisted. Audio always goes through the operating-system mixer. Automatic screen-sharing detection is planned and its UI control remains disabled; it is not presented as shipped.

### Journey

Lifecycle progress follows local sources, all-time tokens, and active days. Milestones and memories are gentle local records—not chores, hunger bars, missions, stores, or punishment loops.

## Local-first privacy

TokenPet reads local usage metadata only. It does not need an account or cloud telemetry, and it does not send prompts, code, paths, or session content anywhere. Capture exports are created locally.

## Verification

```bash
npm run typecheck
npm run build
npm run test:pet-story
npm run demo:pet-story
npm run qa:pet-story
```

See the full plan-to-implementation acceptance matrix in [docs/pet-story/verification.md](docs/pet-story/verification.md) and implementation notes in [docs/pet-story/implementation.md](docs/pet-story/implementation.md).

## Repository layout

```text
apps/desktop/electron                 Electron windows, IPC, persistence, local usage
apps/desktop/public/pet-actors        Generated runtime actor bundles
apps/desktop/src/features/pet-story   Pet Director, capability gate, story pages, sound cues
apps/desktop/src/features/pet-*       Actor rendering and Appearance surfaces
assets/source/pet-actors              Approved source actor specs and raster poses
packages/pet-asset-schema             Actor/source contracts and validators
tools/pet-asset-studio                Deterministic actor-bundle generator and QA artifacts
scripts                               Build, launch, static QA, interaction QA, screenshots
docs/pet-story                        Product plan, implementation, and verification evidence
```

## Development

Requires Node.js 18.20+.

```bash
npm install
npm run dev
```

Build and run the production app in the foreground:

```bash
npm start
```

## License

MIT
