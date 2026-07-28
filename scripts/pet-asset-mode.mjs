import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const authoringSourcePath = join(repoRoot, "assets/source/pet-actors/golden-british/source.json");
export const runtimeActorPath = join(repoRoot, "apps/desktop/public/pet-actors/golden-british/actor.json");

const actionFragmentPaths = [
  "assets/source/pet-actors/golden-british/story-actions/walk-round-trip-v5/source-actions.json",
  "assets/source/pet-actors/golden-british/story-actions/feed-snack-v2/source-actions.json",
  "assets/source/pet-actors/golden-british/story-actions/toss-yarn-v2/source-actions.json",
];

function collectSourcePaths(value, paths) {
  if (Array.isArray(value)) {
    for (const item of value) collectSourcePaths(item, paths);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (key === "src" && typeof item === "string" && item.startsWith("assets/source/")) paths.add(item);
    else collectSourcePaths(item, paths);
  }
}

export function authoringAssetStatus() {
  if (process.env.TOKENPET_USE_PREBUILT_ASSETS === "1") {
    return { available: false, reason: "TOKENPET_USE_PREBUILT_ASSETS=1" };
  }
  const requiredSpecs = [authoringSourcePath, ...actionFragmentPaths.map((path) => join(repoRoot, path))];
  const missingSpecs = requiredSpecs.filter((path) => !existsSync(path));
  if (missingSpecs.length) return { available: false, reason: `missing ${missingSpecs.length} private authoring spec(s)` };

  try {
    const documents = requiredSpecs.map((path) => JSON.parse(readFileSync(path, "utf8")));
    const paths = new Set();
    collectSourcePaths(documents, paths);
    const source = documents[0];
    if (typeof source.sourceImage === "string") paths.add(source.sourceImage);
    const missingInputs = [...paths].filter((path) => !existsSync(join(repoRoot, path)));
    if (missingInputs.length) return { available: false, reason: `missing ${missingInputs.length} private raster input(s)` };
    return { available: true, reason: `${paths.size} private raster input(s) available` };
  } catch (error) {
    return { available: false, reason: `authoring metadata unreadable: ${error.message}` };
  }
}

export function hasAuthoringAssets() {
  return authoringAssetStatus().available;
}
