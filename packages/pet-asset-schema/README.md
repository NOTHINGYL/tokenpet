# Pet actor story contract

`@tokenpet/pet-asset-schema` is the source of truth for authored actor specs and generated `actor.json` bundles.

## Stable action ids

Runtime ids use the underscore names exported by `PET_ACTOR_ACTION_IDS`. UI labels may be friendly, but an actor animation is keyed as `action.<id>`; for example, Quick Play **Feed snack** resolves to `action.token_snack`. Legacy aliases such as `idle-breathe`, `desk-nap`, or `pounce-cursor` are not valid source action ids.

Authored source frames may declare individual positive `durationMs` values and manifest-safe body transforms. This lets the offline studio assemble approved multi-frame reactions such as `blink`, `token_snack`, and `run_across` without synthesizing cat anatomy at runtime. `run_across` is distinct from `play_cursor` and declares native choreography capability metadata.

## Capability status meanings

- `ready`: the manifest must contain the same-id `action.<id>` animation. A label alone is invalid.
- `fallback`: `fallbackId` must name another declared capability, the chain must be acyclic, and it must end at `ready`.
- `planned`: the feature is represented but cannot play. UI should disable it or show a gentle hint.
- `unavailable`: the feature does not apply to this actor. UI should hide it.

All nine Quick Play ids must be represented in every manifest. `resolveActorCapability()` returns the final playable id and animation without requiring the UI to invent aliases.

## Visual-fidelity guardrails

Production frame kinds are limited to PNG, WebP, or atlas entries. SVG/CSS/canvas cat anatomy is not a supported manifest frame format. Each generated frame records a source id and SHA-256 digest. Source specs must label frames as `approved-raster` and provide the expected digest.

Both `tokenSlot` and `moodBadgeSlot` are required and must fit inside the artboard. Golden British uses `tokenFramePolicy: "embedded-only"`; its cream frame is baked into every pose, so `externalToken` is forbidden. Runtime owns text only.

Run `npm test --prefix packages/pet-asset-schema` for contract regression tests.
