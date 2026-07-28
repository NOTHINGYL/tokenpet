import { spawnSync } from "node:child_process";
import { authoringAssetStatus } from "./pet-asset-mode.mjs";
import { verifyPrebuiltPetAssets } from "./verify-prebuilt-pet-assets.mjs";

const status = authoringAssetStatus();
if (status.available) {
  process.stdout.write(`Pet assets: regenerating from local authoring inputs (${status.reason}).\n`);
  const result = spawnSync(process.execPath, ["tools/pet-asset-studio/src/build-golden-british.mjs"], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
} else {
  process.stdout.write(`Pet assets: private authoring inputs unavailable (${status.reason}); validating the checked-in production bundle.\n`);
  await verifyPrebuiltPetAssets();
}
