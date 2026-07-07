import type { PetAppearanceSettings, UsageSnapshot } from "../../types";
import { exportGeneratedPetActorCanvas, hasGeneratedActor } from "../pet-generated-actor/GeneratedPetActorCanvas";
import { createPetActorFrame } from "../pet-actor/actorFrame";
import { exportPetActorCanvas } from "../pet-actor/actorCanvasRenderer";

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Unable to export preview image"));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}

async function downloadCanvas(canvas: HTMLCanvasElement) {
  const blob = await canvasToBlob(canvas);
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = `tokenpet-preview-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
  link.href = objectUrl;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export async function exportPetPreview(appearance: PetAppearanceSettings, usage: UsageSnapshot) {
  if (hasGeneratedActor(appearance.catTypeId)) {
    const canvas = await exportGeneratedPetActorCanvas({
      appearance,
      usage,
      moodId: appearance.moodId,
      surface: "preview",
    });
    await downloadCanvas(canvas);
    return;
  }

  const frame = createPetActorFrame({
    appearance,
    usage,
    moodId: appearance.moodId,
    surface: "preview",
  });
  const canvas = await exportPetActorCanvas(frame);
  await downloadCanvas(canvas);
}
