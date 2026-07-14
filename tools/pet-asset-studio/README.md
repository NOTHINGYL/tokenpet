# Golden British asset studio

The studio turns the Golden British source spec into the runtime bundle at `apps/desktop/public/pet-actors/golden-british`.

Inputs are 1024×1024 transparent approved raster poses under `assets/source/pet-actors/golden-british/frames`. Every pose already contains the matching cream token frame, lighting, shadows, and any state-specific prop. The studio copies those pixels without reconstructing cat anatomy, verifies every declared SHA-256 digest, and records the digest again in `actor.json`. Approved poses can be sequenced with per-step timing; the current bundle uses multi-pose reactions and a 12-step `run_across` sequence assembled from four approved action poses and coordinated with native desktop traversal.

Generated outputs include:

- `actor.json` with same-id `action.<stable_id>` animations and capability metadata;
- PNG-only runtime frames (no CSS/SVG/canvas cat geometry);
- `qa/asset-report.json` for machine-readable checks;
- `qa/contact-sheet.html` with token and mood slot overlays for visual review.

`action.walk_round_trip` is an authored-root-motion clip. Its eight v4 frames are prepared from one coherent source sheet in cell order `1, 5, 2, 6, 3, 7, 4, 8`, registered to a common body anchor and ground line, then paired with manifest-owned paw phases and root-step boundaries. `scripts/prepare-walk-round-trip-frames.py` emits the deterministic frames, `locomotion-report.json`, a frame loop, a 1× root-motion GIF, and an eight-boundary contact sheet. Runtime must consume that profile for both actor frames and native window displacement; it must not tune window speed independently from fps.

Golden British uses `embedded-only` token-frame policy. Runtime may draw token text in the declared slot but must not draw a second bubble or emit arbitrary accessory overlays.

Commands:

```sh
npm run build:golden-british --prefix tools/pet-asset-studio
npm test --prefix tools/pet-asset-studio
```
