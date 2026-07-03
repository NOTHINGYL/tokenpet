import type { CSSProperties, SyntheticEvent } from "react";
import type { CatEyeColor, MoodLookId, PetAppearanceSettings, UsageSnapshot } from "../../types";
import type { AccessoryLayer, AccessoryOption } from "./catalog";
import { getCatRig, type Anchor, type CatAnchorKey } from "./catRigs";
import {
  getAccessory,
  getCatType,
  getCatVisual,
  getEffectiveTokenBubbleId,
  getMoodLabel,
  getTokenBubbleLabel,
  getTokenFrameOption,
  moodToneClass,
  shouldShowMoodBadge,
} from "./appearanceView";

type PetCompositorProps = {
  appearance: PetAppearanceSettings;
  usage: UsageSnapshot;
  moodId?: MoodLookId;
  surface: "preview" | "desktop";
  onBubbleClick?: (event: SyntheticEvent) => void;
};

type AccessoryRenderLayer = Exclude<AccessoryLayer, "tokenText">;

type ResolvedAccessoryLayer = {
  accessory: AccessoryOption;
  asset: string;
  layer: AccessoryRenderLayer;
  anchor: Anchor;
  width: number;
  rotation: number;
  offsetX: number;
  offsetY: number;
};

type TokenPlacement = {
  mode: "embedded" | "below" | "floating";
  textOnly: boolean;
  anchor: Anchor;
  width: number;
  height: number;
  fontSize: number;
};

const eyeTintColors: Record<CatEyeColor, string> = {
  gold: "rgba(224, 157, 24, 0.9)",
  green: "rgba(47, 148, 97, 0.9)",
  blue: "rgba(45, 135, 214, 0.9)",
  slate: "rgba(119, 129, 148, 0.9)",
};

const layerZIndex: Record<AccessoryRenderLayer, number> = {
  behindCat: 0,
  frontCat: 4,
  effect: 8,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function isRenderLayer(layer: AccessoryLayer): layer is AccessoryRenderLayer {
  return layer !== "tokenText";
}

function getFallbackAnchor(anchorKey: CatAnchorKey): Anchor {
  if (anchorKey === "base" || anchorKey === "tokenFrame") {
    return { x: 0.5, y: 0.86, width: 0.56, height: 0.16 };
  }

  if (anchorKey === "neck") {
    return { x: 0.5, y: 0.58, width: 0.24, height: 0.12 };
  }

  return { x: 0.5, y: 0.38, width: 0.32, height: 0.24 };
}

function resolveAccessoryLayers(appearance: PetAppearanceSettings, moodId: MoodLookId): ResolvedAccessoryLayer[] {
  if (!appearance.accessorySettings.moodVisibility[moodId]) return [];

  const catRig = getCatRig(appearance.catTypeId);
  const builtInAccessoryIds = new Set(catRig.builtInAccessoryIds ?? []);

  return appearance.accessoryIds.flatMap((accessoryId) => {
    const accessory = getAccessory(accessoryId);
    if (!accessory || accessory.locked || builtInAccessoryIds.has(accessory.id)) return [];

    const override = accessory.perCatOverrides?.[appearance.catTypeId];
    if (override?.hidden) return [];

    const attachTo = override?.attachTo ?? accessory.attachTo;
    const anchor = catRig.anchors[attachTo] ?? getFallbackAnchor(attachTo);
    const layer = override?.layer ?? accessory.layer;
    if (!isRenderLayer(layer)) return [];

    const defaultScale = override?.defaultScale ?? accessory.defaultScale ?? 1;
    const width = (anchor.width ?? 0.3) * defaultScale * (catRig.accessoryScale ?? 1) * appearance.accessorySettings.scale;
    const rotation = (anchor.angle ?? 0) + (override?.defaultRotation ?? accessory.defaultRotation ?? 0);
    const offsetX = override?.offsetX ?? accessory.offsetX ?? 0;
    const offsetY = override?.offsetY ?? accessory.offsetY ?? 0;
    const assets: ResolvedAccessoryLayer[] = [];

    if (accessory.backAsset) {
      assets.push({
        accessory,
        asset: accessory.backAsset,
        layer: "behindCat",
        anchor,
        width,
        rotation,
        offsetX,
        offsetY,
      });
    }

    assets.push({
      accessory,
      asset: accessory.image,
      layer,
      anchor,
      width,
      rotation,
      offsetX,
      offsetY,
    });

    if (accessory.frontAsset) {
      assets.push({
        accessory,
        asset: accessory.frontAsset,
        layer: "frontCat",
        anchor,
        width,
        rotation,
        offsetX,
        offsetY,
      });
    }

    return assets;
  });
}

function resolveTokenPlacement(appearance: PetAppearanceSettings): TokenPlacement | null {
  const tokenFrame = getTokenFrameOption(appearance);
  const tokenBubbleId = getEffectiveTokenBubbleId(appearance);
  if (tokenBubbleId === "hidden" || tokenFrame.mode === "hidden") return null;

  const catRig = getCatRig(appearance.catTypeId);
  const tokenAnchor = catRig.anchors.tokenFrame ?? getFallbackAnchor("tokenFrame");
  let mode: TokenPlacement["mode"] = "below";

  if (tokenFrame.mode === "floating" || appearance.accessorySettings.position === "floating") {
    mode = "floating";
  } else if (
    tokenFrame.mode === "embedded" &&
    catRig.tokenFrameMode === "embedded" &&
    appearance.accessorySettings.textOnlyFrame
  ) {
    mode = "embedded";
  }

  const compact = tokenBubbleId === "compact";
  const cost = tokenBubbleId === "cost";
  const baseWidth = cost ? 138 : compact ? 92 : 118;
  const baseHeight = compact ? 40 : 48;
  const fontSize = cost ? 14 : compact ? 17 : 24;

  if (mode === "embedded") {
    return {
      mode,
      textOnly: true,
      anchor: tokenAnchor,
      width: Math.round((tokenAnchor.width ?? 0.45) * 220),
      height: Math.round((tokenAnchor.height ?? 0.18) * 220),
      fontSize,
    };
  }

  if (mode === "floating") {
    return {
      mode,
      textOnly: false,
      anchor: {
        ...tokenAnchor,
        x: clamp(tokenAnchor.x + 0.36, 0.18, 0.92),
        y: clamp(tokenAnchor.y - 0.31, 0.22, 0.72),
      },
      width: cost ? 138 : 112,
      height: 42,
      fontSize: cost ? 13 : compact ? 16 : 21,
    };
  }

  return {
    mode,
    textOnly: false,
    anchor: tokenAnchor,
    width: baseWidth,
    height: baseHeight,
    fontSize,
  };
}

function splitAccessoryLayers(accessories: ResolvedAccessoryLayer[]) {
  return {
    behindCat: accessories.filter((accessory) => accessory.layer === "behindCat"),
    frontCat: accessories.filter((accessory) => accessory.layer === "frontCat"),
    effect: accessories.filter((accessory) => accessory.layer === "effect"),
  };
}

function AccessoryLayerImage(props: { layer: ResolvedAccessoryLayer }) {
  const x = clamp(props.layer.anchor.x + props.layer.offsetX, -0.2, 1.2);
  const y = clamp(props.layer.anchor.y + props.layer.offsetY, -0.2, 1.2);

  return (
    <img
      className={`pet-visual-accessory pet-rig-layer pet-rig-layer-${props.layer.layer} pet-visual-accessory-${props.layer.accessory.id}`}
      src={props.layer.asset}
      alt=""
      draggable={false}
      aria-hidden="true"
      style={
        {
          "--pet-layer-x": `${(x * 100).toFixed(2)}%`,
          "--pet-layer-y": `${(y * 100).toFixed(2)}%`,
          "--pet-layer-width": `${(props.layer.width * 100).toFixed(2)}%`,
          "--pet-layer-rotation": `${props.layer.rotation.toFixed(2)}deg`,
          "--pet-layer-z": layerZIndex[props.layer.layer],
        } as CSSProperties
      }
    />
  );
}

export function PetCompositor(props: PetCompositorProps) {
  const moodId = props.moodId ?? props.appearance.moodId;
  const cat = getCatVisual(props.appearance.catTypeId);
  const baseCat = getCatType(props.appearance.catTypeId);
  const tokenFrame = getTokenFrameOption(props.appearance);
  const tokenBubbleId = getEffectiveTokenBubbleId(props.appearance);
  const tokenPlacement = resolveTokenPlacement(props.appearance);
  const tokenLabel = tokenPlacement ? getTokenBubbleLabel(tokenBubbleId, props.usage) : null;
  const showMoodBadge = shouldShowMoodBadge(props.appearance, moodId);
  const accessoryLayers = splitAccessoryLayers(resolveAccessoryLayers(props.appearance, moodId));
  const furLength = props.appearance.catDetails.furLength / 100;
  const patternIntensity = props.appearance.catDetails.patternIntensity / 100;
  const eyeColorChanged = props.appearance.catDetails.eyeColor !== baseCat.eyeColor;
  const effectiveCatScale = props.appearance.size * (cat.visualScale ?? 1);
  const previewRelief = props.surface === "preview" ? Math.max(0, props.appearance.size - 1) * 80 : 0;
  const tokenSurfaceScale = props.surface === "desktop" ? 0.68 : 1;
  const tokenRenderScale =
    tokenPlacement?.mode === "embedded" ? props.appearance.bubbleScale : props.appearance.bubbleScale / Math.max(effectiveCatScale, 0.1);
  const tokenClassName = tokenPlacement
    ? `pet-token-${tokenPlacement.mode} pet-token-frame-${tokenFrame.id} ${tokenPlacement.textOnly ? "pet-token-text-only" : ""}`
    : "pet-token-hidden";

  return (
    <div
      className={`pet-appearance-visual pet-compositor pet-appearance-visual-${props.surface} pet-theme-${props.appearance.themeId} pet-mood-${
        moodToneClass[moodId]
      } ${props.appearance.moodBadge.colorByState ? "pet-mood-color-state" : ""} pet-cat-${cat.id} pet-bubble-${tokenBubbleId} ${tokenClassName} pet-accessory-position-${
        props.appearance.accessorySettings.position
      }`}
      style={
        {
          "--pet-visual-scale": effectiveCatScale.toString(),
          "--pet-visual-opacity": props.appearance.opacity.toString(),
          "--pet-visual-shadow": props.appearance.shadow.toString(),
          "--pet-bubble-scale": props.appearance.bubbleScale.toString(),
          "--pet-token-render-scale": tokenRenderScale.toString(),
          "--pet-accessory-scale": props.appearance.accessorySettings.scale.toString(),
          "--pet-token-anchor-x": `${((tokenPlacement?.anchor.x ?? 0.5) * 100).toFixed(1)}%`,
          "--pet-token-anchor-y": `${((tokenPlacement?.anchor.y ?? 0.84) * 100).toFixed(1)}%`,
          "--pet-token-width": `${Math.round((tokenPlacement?.width ?? 118) * tokenSurfaceScale)}px`,
          "--pet-token-height": `${Math.round((tokenPlacement?.height ?? 48) * tokenSurfaceScale)}px`,
          "--pet-token-font-size": `${Math.max(10, (tokenPlacement?.fontSize ?? 24) * tokenSurfaceScale).toFixed(1)}px`,
          "--pet-size-y-relief": `${previewRelief.toFixed(1)}px`,
          "--cat-fur-softness": `${Math.max(0, (furLength - 0.25) * 3.6).toFixed(2)}px`,
          "--cat-pattern-contrast": (0.94 + patternIntensity * 0.18).toFixed(3),
          "--cat-pattern-saturation": (0.96 + patternIntensity * 0.18).toFixed(3),
          "--cat-eye-opacity": eyeColorChanged ? "0.24" : "0",
          "--cat-eye-tint": eyeTintColors[props.appearance.catDetails.eyeColor],
        } as CSSProperties
      }
    >
      <span className="pet-visual-cat-wrap">
        {accessoryLayers.behindCat.map((layer) => (
          <AccessoryLayerImage key={`${layer.accessory.id}-${layer.layer}-${layer.asset}`} layer={layer} />
        ))}
        <img className="pet-visual-cat" src={cat.image} alt="" draggable={false} aria-hidden="true" />
        {tokenPlacement?.mode === "embedded" && tokenLabel ? (
          <button
            className="pet-visual-token pet-rig-token pet-rig-token-embedded"
            type="button"
            onClick={props.onBubbleClick}
            aria-label="Open TokenPet summary"
          >
            {tokenLabel}
          </button>
        ) : null}
        {accessoryLayers.frontCat.map((layer) => (
          <AccessoryLayerImage key={`${layer.accessory.id}-${layer.layer}-${layer.asset}`} layer={layer} />
        ))}
        {tokenPlacement && tokenPlacement.mode !== "embedded" && tokenLabel ? (
          <button
            className="pet-visual-token pet-rig-token pet-rig-token-external"
            type="button"
            onClick={props.onBubbleClick}
            aria-label="Open TokenPet summary"
          >
            {tokenLabel}
          </button>
        ) : null}
        {accessoryLayers.effect.map((layer) => (
          <AccessoryLayerImage key={`${layer.accessory.id}-${layer.layer}-${layer.asset}`} layer={layer} />
        ))}
      </span>
      {showMoodBadge ? <span className="pet-visual-mood">{getMoodLabel(moodId)}</span> : null}
    </div>
  );
}
