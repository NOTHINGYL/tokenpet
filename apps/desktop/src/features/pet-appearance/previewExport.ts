import type { AccessoryId, PetAppearanceSettings, UsageSnapshot } from "../../types";
import { exportGeneratedPetActorCanvas, hasGeneratedActor } from "../pet-generated-actor/GeneratedPetActorCanvas";
import { createPetActorFrame } from "../pet-actor/actorFrame";
import { exportPetActorCanvas } from "../pet-actor/actorCanvasRenderer";
import { getAccessory } from "./appearanceView";
import { countPetNameGraphemes } from "./petIdentity";

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

function loadPreviewAsset(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load preview accessory: ${src}`));
    image.src = src;
  });
}

async function composeAppearanceAccessories(canvas: HTMLCanvasElement, appearance: PetAppearanceSettings) {
  const { baseId, headId, effectId } = appearance.accessorySettings;
  const ground = ["desk-mat", "round-rug", "star-blanket"].includes(baseId) ? getAccessory(baseId as AccessoryId) : null;
  const head = ["focus-crown", "halo"].includes(headId) ? getAccessory(headId as AccessoryId) : null;
  const effect = ["sparkle-aura", "leaf-drift", "hot-sparks"].includes(effectId) ? getAccessory(effectId as AccessoryId) : null;
  const showName = appearance.identity.showNameOnHover && appearance.identity.name.trim().length > 0;
  if (!ground && !head && !effect && !showName) return canvas;

  const [groundImage, headImage, effectImage] = await Promise.all([
    ground ? loadPreviewAsset(ground.image) : Promise.resolve(null),
    head ? loadPreviewAsset(head.image) : Promise.resolve(null),
    effect ? loadPreviewAsset(effect.image) : Promise.resolve(null),
  ]);
  const output = document.createElement("canvas");
  output.width = canvas.width;
  output.height = canvas.height;
  const context = output.getContext("2d");
  if (!context) return canvas;

  if (groundImage) {
    const groundWidth = output.width * 1.07;
    const groundHeight = output.height * .275;
    context.drawImage(groundImage, (output.width - groundWidth) / 2, output.height * .635, groundWidth, groundHeight);
  }
  context.save();
  if (appearance.shadow > 0) {
    context.shadowColor = `rgba(30, 41, 59, ${(.24 * appearance.shadow).toFixed(3)})`;
    context.shadowBlur = output.width * .018 * appearance.shadow;
    context.shadowOffsetY = output.width * .014 * appearance.shadow;
  }
  context.drawImage(canvas, 0, 0);
  context.restore();
  if (effectImage) {
    const effectWidth = output.width * (effectId === "hot-sparks" ? .62 : .75);
    const effectHeight = output.height * (effectId === "hot-sparks" ? .3 : .56);
    const effectY = output.height * (effectId === "hot-sparks" ? .52 : .2);
    context.globalAlpha = .84;
    context.drawImage(effectImage, (output.width - effectWidth) / 2, effectY, effectWidth, effectHeight);
    context.globalAlpha = 1;
  }
  if (headImage) {
    const headWidth = output.width * (headId === "halo" ? .42 : .35);
    const headHeight = output.height * (headId === "halo" ? .16 : .255);
    const headY = output.height * (headId === "halo" ? .25 : .285);
    context.drawImage(headImage, (output.width - headWidth) / 2, headY, headWidth, headHeight);
  }
  if (showName) {
    const name = appearance.identity.name.trim();
    const graphemeCount = countPetNameGraphemes(name);
    const diameter = output.width * Math.min(.225, .155 + Math.max(0, graphemeCount - 3) * .01);
    const centerX = output.width * .18;
    const centerY = output.height * .3;
    const dotLarge = diameter * .18;
    const dotSmall = diameter * .11;
    context.save();
    context.shadowColor = "rgba(49, 42, 31, .14)";
    context.shadowBlur = output.width * .016;
    context.shadowOffsetY = output.width * .007;
    context.fillStyle = "#fffaf0";
    context.strokeStyle = "rgba(208, 185, 145, .45)";
    context.lineWidth = Math.max(2, output.width * .002);
    context.beginPath();
    context.arc(centerX, centerY, diameter / 2, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.shadowColor = "transparent";
    context.beginPath();
    context.arc(centerX + diameter * .55, centerY + diameter * .33, dotLarge / 2, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.beginPath();
    context.arc(centerX + diameter * .68, centerY + diameter * .47, dotSmall / 2, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    const fontSize = diameter * Math.max(.15, .22 - Math.max(0, graphemeCount - 3) * .009);
    context.fillStyle = "#13284d";
    context.font = `760 ${fontSize}px Inter, ui-sans-serif, system-ui, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(name, centerX, centerY, diameter * .76);
    context.restore();
  }
  return output;
}

export async function exportPetPreview(appearance: PetAppearanceSettings, usage: UsageSnapshot) {
  if (hasGeneratedActor(appearance.catTypeId)) {
    const canvas = await exportGeneratedPetActorCanvas({
      appearance,
      usage,
      moodId: appearance.moodId,
      surface: "preview",
    });
    await downloadCanvas(await composeAppearanceAccessories(canvas, appearance));
    return;
  }

  const frame = createPetActorFrame({
    appearance,
    usage,
    moodId: appearance.moodId,
    surface: "preview",
  });
  const canvas = await exportPetActorCanvas(frame);
  await downloadCanvas(await composeAppearanceAccessories(canvas, appearance));
}
