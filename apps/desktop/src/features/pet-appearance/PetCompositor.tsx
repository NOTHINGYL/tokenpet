import type { CSSProperties, SyntheticEvent } from "react";
import type { CatEyeColor, MoodLookId, PetAppearanceSettings, UsageSnapshot } from "../../types";
import type { AccessoryKitLayerId, AccessoryOption } from "./catalog";
import { getCatRig, type Anchor, type CatAnchorKey, type CatOcclusionMask } from "./catRigs";
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

type AccessoryRenderSlot = "behindCat" | "back" | "underChin" | "frontCat" | "highlight" | "effect" | "shadow";

type ResolvedAccessoryLayer = {
  accessory: AccessoryOption;
  asset?: string;
  slot: AccessoryRenderSlot;
  anchor: Anchor;
  width: number;
  height: number;
  rotation: number;
  offsetX: number;
  offsetY: number;
  opacity?: number;
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

const layerZIndex: Record<AccessoryRenderSlot, number> = {
  behindCat: 0,
  back: 2,
  shadow: 3,
  underChin: 4,
  frontCat: 6,
  highlight: 8,
  effect: 9,
};

const kitLayerSlot: Record<AccessoryKitLayerId, AccessoryRenderSlot> = {
  back: "back",
  underChin: "underChin",
  front: "frontCat",
  highlight: "highlight",
  shadow: "shadow",
  effect: "effect",
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getFallbackAnchor(anchorKey: CatAnchorKey): Anchor {
  if (anchorKey === "base" || anchorKey === "tokenFrame") {
    return { x: 0.5, y: 0.86, width: 0.56, height: 0.16 };
  }

  if (anchorKey === "chest") {
    return { x: 0.5, y: 0.68, width: 0.44, height: 0.18 };
  }

  if (anchorKey === "neck") {
    return { x: 0.5, y: 0.58, width: 0.24, height: 0.12 };
  }

  return { x: 0.5, y: 0.38, width: 0.32, height: 0.24 };
}

function defaultSlotForAccessory(accessory: AccessoryOption): AccessoryRenderSlot {
  if (accessory.category === "base") return "behindCat";
  if (accessory.category === "effects") return "effect";
  if (accessory.category === "neck") return "underChin";
  return "frontCat";
}

function shouldGenerateContactShadow(accessory: AccessoryOption) {
  return accessory.category === "neck" || accessory.category === "head" || accessory.category === "base";
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

    const bodyVariant = accessory.bodyTypeVariants?.[catRig.bodyType];
    const attachTo = override?.attachTo ?? bodyVariant?.attachTo ?? accessory.attachTo;
    const anchor = catRig.anchors[attachTo] ?? getFallbackAnchor(attachTo);
    const baseScale = override?.scale ?? override?.defaultScale ?? bodyVariant?.defaultScale ?? accessory.defaultScale ?? 1;
    const width = (anchor.width ?? 0.3) * baseScale * (catRig.accessoryScale ?? 1) * appearance.accessorySettings.scale;
    const height = (anchor.height ?? anchor.width ?? 0.18) * baseScale * (catRig.accessoryScale ?? 1) * appearance.accessorySettings.scale;
    const rotation = (anchor.angle ?? 0) + (override?.rotation ?? override?.defaultRotation ?? bodyVariant?.defaultRotation ?? accessory.defaultRotation ?? 0);
    const offsetX = override?.offsetX ?? bodyVariant?.offsetX ?? accessory.offsetX ?? 0;
    const offsetY = override?.offsetY ?? bodyVariant?.offsetY ?? accessory.offsetY ?? 0;
    const hiddenLayers = new Set(override?.hiddenLayers ?? []);
    const layers = {
      ...(accessory.backAsset ? { back: accessory.backAsset } : {}),
      ...(accessory.layers ?? {}),
      ...(accessory.frontAsset ? { front: accessory.frontAsset } : {}),
      ...(bodyVariant?.layers ?? {}),
    };
    const resolvedLayers: ResolvedAccessoryLayer[] = [];

    if (!Object.keys(layers).length) {
      resolvedLayers.push({
        accessory,
        asset: accessory.image,
        slot: defaultSlotForAccessory(accessory),
        anchor,
        width,
        height,
        rotation,
        offsetX,
        offsetY,
      });
    } else {
      (Object.entries(layers) as Array<[AccessoryKitLayerId, string | undefined]>).forEach(([layerId, asset]) => {
        if (!asset || hiddenLayers.has(layerId)) return;

        resolvedLayers.push({
          accessory,
          asset,
          slot: kitLayerSlot[layerId],
          anchor,
          width,
          height,
          rotation,
          offsetX,
          offsetY,
          opacity: layerId === "highlight" ? 0.22 : undefined,
        });
      });
    }

    if (shouldGenerateContactShadow(accessory) && !hiddenLayers.has("shadow")) {
      resolvedLayers.push({
        accessory,
        slot: "shadow",
        anchor,
        width: width * (accessory.category === "base" ? 1.08 : 0.74),
        height: height * (accessory.category === "head" ? 0.24 : 0.42),
        rotation,
        offsetX,
        offsetY: offsetY + (accessory.category === "head" ? 0.08 : 0.04),
        opacity: accessory.category === "base" ? 0.22 : 0.18,
      });
    }

    return resolvedLayers;
  });
}

function resolveTokenPlacement(appearance: PetAppearanceSettings): TokenPlacement | null {
  const tokenFrame = getTokenFrameOption(appearance);
  const tokenBubbleId = getEffectiveTokenBubbleId(appearance);
  if (tokenBubbleId === "hidden" || tokenFrame.mode === "hidden") return null;

  const catRig = getCatRig(appearance.catTypeId);
  const tokenAnchor = catRig.anchors.tokenFrame ?? getFallbackAnchor("tokenFrame");
  let mode: TokenPlacement["mode"] = "below";

  if (tokenFrame.mode === "floating") {
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
        x: clamp(tokenAnchor.x + 0.32, 0.18, 0.88),
        y: clamp(tokenAnchor.y - 0.2, 0.34, 0.78),
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
    behindCat: accessories.filter((accessory) => accessory.slot === "behindCat"),
    back: accessories.filter((accessory) => accessory.slot === "back"),
    shadow: accessories.filter((accessory) => accessory.slot === "shadow"),
    underChin: accessories.filter((accessory) => accessory.slot === "underChin"),
    frontCat: accessories.filter((accessory) => accessory.slot === "frontCat"),
    highlight: accessories.filter((accessory) => accessory.slot === "highlight"),
    effect: accessories.filter((accessory) => accessory.slot === "effect"),
  };
}

function AccessoryLayerView(props: { layer: ResolvedAccessoryLayer }) {
  const x = clamp(props.layer.anchor.x + props.layer.offsetX, -0.2, 1.2);
  const y = clamp(props.layer.anchor.y + props.layer.offsetY, -0.2, 1.2);
  const style = {
    "--pet-layer-x": `${(x * 100).toFixed(2)}%`,
    "--pet-layer-y": `${(y * 100).toFixed(2)}%`,
    "--pet-layer-width": `${(props.layer.width * 100).toFixed(2)}%`,
    "--pet-layer-height": `${(props.layer.height * 100).toFixed(2)}%`,
    "--pet-layer-rotation": `${props.layer.rotation.toFixed(2)}deg`,
    "--pet-layer-z": layerZIndex[props.layer.slot],
    "--pet-layer-opacity": props.layer.opacity?.toString() ?? "1",
  } as CSSProperties;

  if (props.layer.slot === "shadow" || !props.layer.asset) {
    return (
      <span
        className={`pet-wearable-shadow pet-rig-layer pet-rig-layer-${props.layer.slot} pet-visual-accessory-${props.layer.accessory.id}`}
        aria-hidden="true"
        style={style}
      />
    );
  }

  return (
    <img
      className={`pet-visual-accessory pet-rig-layer pet-rig-layer-${props.layer.slot} pet-visual-accessory-${props.layer.accessory.id}`}
      src={props.layer.asset}
      alt=""
      draggable={false}
      aria-hidden="true"
      style={style}
    />
  );
}

function flattenOcclusionMasks(masks: ReturnType<typeof getCatRig>["occlusionMasks"]) {
  if (!masks) return [];

  return Object.entries(masks).flatMap(([key, value]) => {
    if (key === "bodyFront") return [];
    if (!value) return [];
    return (Array.isArray(value) ? value : [value]).map((mask, index) => ({
      key: `${key}-${index}`,
      mask,
    }));
  });
}

function CatOcclusionOverlay(props: { catImage: string; mask: CatOcclusionMask; maskKey: string }) {
  const style = {
    "--pet-mask-x": `${(props.mask.x * 100).toFixed(2)}%`,
    "--pet-mask-y": `${(props.mask.y * 100).toFixed(2)}%`,
    "--pet-mask-w": `${((props.mask.width ?? 0.3) * 100).toFixed(2)}%`,
    "--pet-mask-h": `${((props.mask.height ?? 0.12) * 100).toFixed(2)}%`,
    "--pet-mask-opacity": props.mask.opacity?.toString() ?? "1",
  } as CSSProperties;

  return <img className={`pet-cat-occlusion pet-cat-occlusion-${props.maskKey}`} src={props.catImage} alt="" aria-hidden="true" style={style} />;
}

function getSurfaceScale(appearance: PetAppearanceSettings, catVisualScale: number | undefined, surface: PetCompositorProps["surface"]) {
  const rawScale = appearance.size * (catVisualScale ?? 1);
  if (surface === "desktop") return rawScale;

  const previewMax = catVisualScale ? 1.28 : 0.92;
  return Math.min(rawScale, previewMax);
}

export function PetCompositor(props: PetCompositorProps) {
  const moodId = props.moodId ?? props.appearance.moodId;
  const cat = getCatVisual(props.appearance.catTypeId);
  const baseCat = getCatType(props.appearance.catTypeId);
  const catRig = getCatRig(props.appearance.catTypeId);
  const tokenFrame = getTokenFrameOption(props.appearance);
  const tokenBubbleId = getEffectiveTokenBubbleId(props.appearance);
  const tokenPlacement = resolveTokenPlacement(props.appearance);
  const tokenLabel = tokenPlacement ? getTokenBubbleLabel(tokenBubbleId, props.usage) : null;
  const showMoodBadge = shouldShowMoodBadge(props.appearance, moodId);
  const accessoryLayers = splitAccessoryLayers(resolveAccessoryLayers(props.appearance, moodId));
  const occlusionMasks = flattenOcclusionMasks(catRig.occlusionMasks);
  const furLength = props.appearance.catDetails.furLength / 100;
  const patternIntensity = props.appearance.catDetails.patternIntensity / 100;
  const eyeColorChanged = props.appearance.catDetails.eyeColor !== baseCat.eyeColor;
  const effectiveCatScale = getSurfaceScale(props.appearance, cat.visualScale, props.surface);
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
      } ${props.appearance.moodBadge.colorByState ? "pet-mood-color-state" : ""} pet-cat-${cat.id} pet-body-${catRig.bodyType} pet-bubble-${tokenBubbleId} ${tokenClassName} pet-accessory-position-${
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
          "--pet-size-y-relief": "0px",
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
          <AccessoryLayerView key={`${layer.accessory.id}-${layer.slot}-${layer.asset ?? "shadow"}`} layer={layer} />
        ))}
        {accessoryLayers.back.map((layer) => (
          <AccessoryLayerView key={`${layer.accessory.id}-${layer.slot}-${layer.asset ?? "shadow"}`} layer={layer} />
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
        {accessoryLayers.shadow.map((layer) => (
          <AccessoryLayerView key={`${layer.accessory.id}-${layer.slot}-${layer.asset ?? "shadow"}`} layer={layer} />
        ))}
        {accessoryLayers.underChin.map((layer) => (
          <AccessoryLayerView key={`${layer.accessory.id}-${layer.slot}-${layer.asset ?? "shadow"}`} layer={layer} />
        ))}
        {occlusionMasks.map(({ key, mask }) => (
          <CatOcclusionOverlay key={key} catImage={cat.image} mask={mask} maskKey={key} />
        ))}
        {accessoryLayers.frontCat.map((layer) => (
          <AccessoryLayerView key={`${layer.accessory.id}-${layer.slot}-${layer.asset ?? "shadow"}`} layer={layer} />
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
        {accessoryLayers.highlight.map((layer) => (
          <AccessoryLayerView key={`${layer.accessory.id}-${layer.slot}-${layer.asset ?? "shadow"}`} layer={layer} />
        ))}
        {accessoryLayers.effect.map((layer) => (
          <AccessoryLayerView key={`${layer.accessory.id}-${layer.slot}-${layer.asset ?? "shadow"}`} layer={layer} />
        ))}
      </span>
      {showMoodBadge ? <span className="pet-visual-mood">{getMoodLabel(moodId)}</span> : null}
    </div>
  );
}
