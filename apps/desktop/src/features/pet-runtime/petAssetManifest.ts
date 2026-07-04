import type { AccessoryId, CatTypeId, PetAppearanceSettings } from "../../types";
import type {
  AccessoryAnchorKey,
  AccessoryCategoryId,
  AccessoryKitLayerId,
  AccessoryKitLayers,
  AccessoryOption,
  CatBodyType,
} from "../pet-appearance/catalog";
import { getAccessory, getCatType, getCatVisual } from "../pet-appearance/appearanceView";
import type { CatRig } from "../pet-appearance/catRigs";

export type AccessoryPerspective = "flat" | "slight-top" | "front";

export type AccessoryFitProfile = {
  attachTo: AccessoryAnchorKey;
  scale: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
  perspective: AccessoryPerspective;
  hiddenLayers: AccessoryKitLayerId[];
};

export type AccessoryKit = {
  id: AccessoryId;
  category: AccessoryCategoryId;
  label: string;
  compatibleBodyTypes: CatBodyType[];
  layers: AccessoryKitLayers;
  fitProfile: AccessoryFitProfile;
  tintable?: boolean;
  incompatibleFallback?: "hide" | "badge-only" | "base-only";
};

const allBodyTypes: CatBodyType[] = ["paw-frame", "round-sitting", "fluffy-sitting", "slim-sitting"];

function getDefaultPerspective(category: AccessoryCategoryId): AccessoryPerspective {
  if (category === "base" || category === "tokenFrame") return "slight-top";
  if (category === "effects") return "flat";
  return "front";
}

function getDefaultLayers(accessory: AccessoryOption): AccessoryKitLayers {
  const layers: AccessoryKitLayers = {
    ...(accessory.backAsset ? { back: accessory.backAsset } : {}),
    ...(accessory.layers ?? {}),
    ...(accessory.frontAsset ? { front: accessory.frontAsset } : {}),
  };

  if (Object.keys(layers).length) return layers;
  if (accessory.category === "effects") return { effect: accessory.image };
  if (accessory.category === "base") return { back: accessory.image };
  if (accessory.category === "neck") return { underChin: accessory.image };
  return { front: accessory.image };
}

export function getPetCatAsset(catTypeId: CatTypeId) {
  const cat = getCatVisual(catTypeId);
  const baseCat = getCatType(catTypeId);

  return {
    id: cat.id,
    image: cat.image,
    baseEyeColor: baseCat.eyeColor,
    visualScale: cat.visualScale,
  };
}

export function getAccessoryKit(accessoryId: AccessoryId, appearance: PetAppearanceSettings, rig: CatRig): AccessoryKit | null {
  const accessory = getAccessory(accessoryId);
  if (!accessory || accessory.locked || rig.builtInAccessoryIds?.includes(accessory.id)) return null;

  const perCatOverride = accessory.perCatOverrides?.[appearance.catTypeId];
  if (perCatOverride?.hidden) return null;

  const bodyVariant = accessory.bodyTypeVariants?.[rig.bodyType];
  const layers = {
    ...getDefaultLayers(accessory),
    ...(bodyVariant?.layers ?? {}),
  };
  const hiddenLayers = perCatOverride?.hiddenLayers ?? [];
  const attachTo = perCatOverride?.attachTo ?? bodyVariant?.attachTo ?? accessory.attachTo;
  const scale = perCatOverride?.scale ?? perCatOverride?.defaultScale ?? bodyVariant?.defaultScale ?? accessory.defaultScale ?? 1;
  const rotation = perCatOverride?.rotation ?? perCatOverride?.defaultRotation ?? bodyVariant?.defaultRotation ?? accessory.defaultRotation ?? 0;

  return {
    id: accessory.id,
    category: accessory.category,
    label: accessory.label,
    compatibleBodyTypes: allBodyTypes,
    layers,
    tintable: accessory.tintable,
    incompatibleFallback: "hide",
    fitProfile: {
      attachTo,
      scale,
      offsetX: perCatOverride?.offsetX ?? bodyVariant?.offsetX ?? accessory.offsetX ?? 0,
      offsetY: perCatOverride?.offsetY ?? bodyVariant?.offsetY ?? accessory.offsetY ?? 0,
      rotation,
      perspective: getDefaultPerspective(accessory.category),
      hiddenLayers,
    },
  };
}
