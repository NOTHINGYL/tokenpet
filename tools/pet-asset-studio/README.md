# Golden British asset studio

The studio turns the Golden British v2 source spec into the runtime bundle at `apps/desktop/public/pet-actors/golden-british`.

Inputs are 1024×1024 transparent approved raster poses under `assets/source/pet-actors/golden-british/frames`. Every pose already contains the matching cream token frame, lighting, shadows, and any state-specific prop. The studio copies those pixels without reconstructing cat anatomy, verifies every declared SHA-256 digest, and records the digest again in `actor.json`.

Generated outputs include:

- `actor.json` with same-id `action.<stable_id>` animations and capability metadata;
- PNG-only runtime frames (no CSS/SVG/canvas cat geometry);
- `qa/asset-report.json` for machine-readable checks;
- `qa/contact-sheet.html` with token and mood slot overlays for visual review.

Golden British uses `embedded-only` token-frame policy. Runtime may draw token text in the declared slot but must not draw a second bubble or emit arbitrary accessory overlays.

Commands:

```sh
npm run build:golden-british --prefix tools/pet-asset-studio
npm test --prefix tools/pet-asset-studio
```
