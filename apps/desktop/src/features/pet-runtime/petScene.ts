import type { CatEyeColor, MoodLookId, PetAppearanceSettings, TokenBubbleId, UsageSnapshot } from "../../types";
import type { AccessoryKitLayerId, AccessoryCategoryId } from "../pet-appearance/catalog";
import { getCatType, getEffectiveTokenBubbleId, getMoodLabel, getTokenBubbleLabel, getTokenFrameOption, moodToneClass, shouldShowMoodBadge } from "../pet-appearance/appearanceView";
import { getCatRig, type Anchor, type CatAnchorKey, type CatOcclusionKey, type CatOcclusionMask } from "../pet-appearance/catRigs";
import { getAccessoryKit, getPetCatAsset, type AccessoryKit } from "./petAssetManifest";
import { clamp, getPetRenderScale, getTokenRenderScale } from "./petPhysics";
import { getPetMotionProfile } from "./petMotion";
import { petSceneLayers, type PetScene, type PetSceneMotionBinding, type PetSceneNode, type PetSurface, type PetTokenPlacement } from "./petRigTypes";

const eyeTintColors: Record<CatEyeColor, string> = {
  gold: "rgba(224, 157, 24, 0.9)",
  green: "rgba(47, 148, 97, 0.9)",
  blue: "rgba(45, 135, 214, 0.9)",
  slate: "rgba(119, 129, 148, 0.9)",
};

const accessoryLayerDepth: Record<AccessoryKitLayerId, number> = {
  back: petSceneLayers.backAccessory,
  underChin: petSceneLayers.underChinAccessory,
  front: petSceneLayers.frontAccessory,
  highlight: petSceneLayers.highlight,
  shadow: petSceneLayers.contactShadow,
  effect: petSceneLayers.effect,
};

function getFallbackAnchor(anchorKey: CatAnchorKey): Anchor {
  if (anchorKey === "base" || anchorKey === "tokenFrame") return { x: 0.5, y: 0.86, width: 0.56, height: 0.16 };
  if (anchorKey === "shadow") return { x: 0.5, y: 0.9, width: 0.62, height: 0.12 };
  if (anchorKey === "paws") return { x: 0.5, y: 0.76, width: 0.5, height: 0.14 };
  if (anchorKey === "chest") return { x: 0.5, y: 0.68, width: 0.44, height: 0.18 };
  if (anchorKey === "neck") return { x: 0.5, y: 0.58, width: 0.24, height: 0.12 };
  return { x: 0.5, y: 0.38, width: 0.32, height: 0.24 };
}

function flattenMasks(masks: ReturnType<typeof getCatRig>["depthZones"], fallbackMasks: ReturnType<typeof getCatRig>["occlusionMasks"]) {
  const source = masks && Object.keys(masks).length ? masks : fallbackMasks;
  if (!source) return [];

  return Object.entries(source).flatMap(([key, value]) => {
    if (!value) return [];
    return (Array.isArray(value) ? value : [value]).map((mask, index) => ({
      key: `${key}-${index}`,
      maskKey: key as CatOcclusionKey,
      mask,
    }));
  });
}

function getLayerMotion(category: AccessoryCategoryId, layerId: AccessoryKitLayerId): PetSceneMotionBinding {
  if (category === "effects" || layerId === "effect") return "effect";
  if (category === "base") return "base";
  if (category === "head") return "head";
  if (category === "neck") return "neck";
  return "body";
}

function shouldGenerateContactShadow(category: AccessoryCategoryId) {
  return category === "neck" || category === "head" || category === "base";
}

function getAccessoryLayerClass(layerId: AccessoryKitLayerId, kit: AccessoryKit) {
  return `pet-scene-accessory pet-scene-accessory-${kit.id} pet-scene-kit-${layerId} pet-scene-category-${kit.category}`;
}

function getAdjustedFit(kit: AccessoryKit) {
  const fit = { ...kit.fitProfile };

  if (kit.category === "effects") {
    if (kit.id === "leaf-drift") {
      fit.scale *= 0.72;
      fit.offsetX += 0.22;
      fit.offsetY -= 0.17;
    } else if (kit.id === "sparkle-aura") {
      fit.scale *= 0.86;
      fit.offsetY -= 0.07;
    } else if (kit.id === "star-trail") {
      fit.scale *= 0.84;
      fit.offsetX += 0.05;
      fit.offsetY -= 0.03;
    }
  }

  return fit;
}

function buildAccessoryNodes(appearance: PetAppearanceSettings, moodId: MoodLookId): PetSceneNode[] {
  if (!appearance.accessorySettings.moodVisibility[moodId]) return [];

  const rig = getCatRig(appearance.catTypeId);

  return appearance.accessoryIds.flatMap((accessoryId) => {
    const kit = getAccessoryKit(accessoryId, appearance, rig);
    if (!kit) return [];

    const fit = getAdjustedFit(kit);
    if (!kit.compatibleBodyTypes.includes(rig.bodyType)) {
      return kit.incompatibleFallback === "hide" ? [] : [];
    }

    const anchor = rig.anchors[fit.attachTo] ?? getFallbackAnchor(fit.attachTo);
    const scale = fit.scale * (rig.accessoryScale ?? 1) * appearance.accessorySettings.scale;
    const width = (anchor.width ?? 0.3) * scale;
    const height = (anchor.height ?? anchor.width ?? 0.18) * scale;
    const hiddenLayers = new Set(fit.hiddenLayers);
    const nodes: PetSceneNode[] = [];

    (Object.entries(kit.layers) as Array<[AccessoryKitLayerId, string | undefined]>).forEach(([layerId, asset]) => {
      if (!asset || hiddenLayers.has(layerId)) return;

      nodes.push({
        id: `accessory-${kit.id}-${layerId}`,
        kind: kit.category === "effects" || layerId === "effect" ? "effect" : "accessory",
        asset,
        label: kit.label,
        className: getAccessoryLayerClass(layerId, kit),
        layer: accessoryLayerDepth[layerId],
        anchor,
        accessoryCategory: kit.category,
        motion: getLayerMotion(kit.category, layerId),
        transform: {
          x: clamp(anchor.x + fit.offsetX, -0.2, 1.2),
          y: clamp(anchor.y + fit.offsetY, -0.2, 1.2),
          width,
          height,
          scale: 1,
          rotation: (anchor.angle ?? 0) + fit.rotation,
          opacity: layerId === "highlight" ? 0.22 : 1,
        },
      });
    });

    if (shouldGenerateContactShadow(kit.category) && !hiddenLayers.has("shadow")) {
      const shadowWidth = width * (kit.category === "base" ? 1.08 : kit.category === "head" ? 0.68 : 0.78);
      const shadowHeight = height * (kit.category === "head" ? 0.22 : 0.42);

      nodes.push({
        id: `accessory-${kit.id}-contact-shadow`,
        kind: "shadow",
        label: `${kit.label} contact shadow`,
        className: `pet-scene-contact-shadow pet-scene-accessory-${kit.id}`,
        layer: petSceneLayers.contactShadow,
        anchor,
        accessoryCategory: kit.category,
        motion: getLayerMotion(kit.category, "shadow"),
        transform: {
          x: clamp(anchor.x + fit.offsetX, -0.2, 1.2),
          y: clamp(anchor.y + fit.offsetY + (kit.category === "head" ? 0.08 : 0.045), -0.2, 1.2),
          width: shadowWidth,
          height: shadowHeight,
          scale: 1,
          rotation: (anchor.angle ?? 0) + fit.rotation,
          opacity: kit.category === "base" ? 0.22 : 0.18,
        },
      });
    }

    return nodes;
  });
}

function resolveTokenPlacement(appearance: PetAppearanceSettings): PetTokenPlacement | null {
  const tokenFrame = getTokenFrameOption(appearance);
  const tokenBubbleId = getEffectiveTokenBubbleId(appearance);
  if (tokenBubbleId === "hidden" || tokenFrame.mode === "hidden") return null;

  const rig = getCatRig(appearance.catTypeId);
  const tokenAnchor = rig.anchors.tokenFrame ?? getFallbackAnchor("tokenFrame");
  let mode: PetTokenPlacement["mode"] = "below";

  if (tokenFrame.mode === "floating") {
    mode = "floating";
  } else if (tokenFrame.mode === "embedded" && rig.tokenFrameMode === "embedded" && appearance.accessorySettings.textOnlyFrame) {
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
        x: clamp(tokenAnchor.x + 0.3, 0.2, 0.86),
        y: clamp(tokenAnchor.y - 0.18, 0.36, 0.78),
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

function createTokenNode(tokenPlacement: PetTokenPlacement, tokenLabel: string | null): PetSceneNode {
  return {
    id: `token-${tokenPlacement.mode}`,
    kind: "token",
    text: tokenLabel,
    interactive: true,
    className: `pet-rig-token pet-rig-token-${tokenPlacement.mode === "embedded" ? "embedded" : "external"}`,
    layer: tokenPlacement.mode === "embedded" ? petSceneLayers.embeddedToken : petSceneLayers.belowToken,
    anchor: tokenPlacement.anchor,
    motion: "token",
    transform: {
      x: tokenPlacement.anchor.x,
      y: tokenPlacement.anchor.y,
      width: tokenPlacement.width,
      height: tokenPlacement.height,
      scale: 1,
      rotation: 0,
      opacity: 1,
    },
  };
}

function createOcclusionNodes(catImage: string, appearance: PetAppearanceSettings): PetSceneNode[] {
  const rig = getCatRig(appearance.catTypeId);
  const masks = flattenMasks(rig.depthZones, rig.occlusionMasks);

  return masks.map(({ key, maskKey, mask }) => {
    const maxOpacityByMask: Partial<Record<CatOcclusionKey, number>> = {
      bodyFront: 0.12,
      chinFront: 0.24,
      pawsFront: 0.2,
      headFront: 0.16,
      earsFront: 0.18,
    };
    const opacity = Math.min(mask.opacity ?? 1, maxOpacityByMask[maskKey] ?? 0.18);

    return {
      id: `occlusion-${key}`,
      kind: "occlusion",
      asset: catImage,
      className: `pet-cat-occlusion pet-cat-occlusion-${key}`,
      layer: petSceneLayers.occlusion,
      mask,
      maskKey,
      motion: "body",
      transform: {
        x: mask.x,
        y: mask.y,
        width: mask.width ?? 0.3,
        height: mask.height ?? 0.12,
        scale: 1,
        rotation: mask.angle ?? 0,
        opacity,
      },
    };
  });
}

function getTokenClassName(tokenPlacement: PetTokenPlacement | null, tokenBubbleId: TokenBubbleId, appearance: PetAppearanceSettings) {
  const tokenFrame = getTokenFrameOption(appearance);
  if (!tokenPlacement) return "pet-token-hidden";
  return `pet-token-${tokenPlacement.mode} pet-token-frame-${tokenFrame.id} ${tokenPlacement.textOnly ? "pet-token-text-only" : ""} pet-bubble-${tokenBubbleId}`;
}

export function createPetScene(props: {
  appearance: PetAppearanceSettings;
  usage: UsageSnapshot;
  moodId: MoodLookId;
  surface: PetSurface;
}): PetScene {
  const cat = getPetCatAsset(props.appearance.catTypeId);
  const rig = getCatRig(props.appearance.catTypeId);
  const baseCat = getCatType(props.appearance.catTypeId);
  const tokenBubbleId = getEffectiveTokenBubbleId(props.appearance);
  const tokenPlacement = resolveTokenPlacement(props.appearance);
  const tokenLabel = tokenPlacement ? getTokenBubbleLabel(tokenBubbleId, props.usage) : null;
  const showMood = shouldShowMoodBadge(props.appearance, props.moodId);
  const motion = getPetMotionProfile(props.moodId);
  const renderScale = getPetRenderScale(props.surface, props.appearance.size, cat.visualScale);
  const tokenRenderScale = tokenPlacement ? getTokenRenderScale(props.surface, props.appearance.bubbleScale, renderScale, tokenPlacement.mode) : 1;
  const furLength = props.appearance.catDetails.furLength / 100;
  const patternIntensity = props.appearance.catDetails.patternIntensity / 100;
  const eyeColorChanged = props.appearance.catDetails.eyeColor !== baseCat.eyeColor;
  const shadowAnchor = rig.anchors.shadow ?? getFallbackAnchor("shadow");
  const nodes: PetSceneNode[] = [
    {
      id: "ground-shadow",
      kind: "shadow",
      className: "pet-scene-ground-shadow",
      layer: petSceneLayers.groundShadow,
      anchor: shadowAnchor,
      motion: "base",
      transform: {
        x: shadowAnchor.x,
        y: shadowAnchor.y,
        width: shadowAnchor.width ?? 0.64,
        height: shadowAnchor.height ?? 0.12,
        scale: 1,
        rotation: 0,
        opacity: 0.22 + props.appearance.shadow * 0.28,
      },
    },
    ...buildAccessoryNodes(props.appearance, props.moodId),
    {
      id: "cat-body",
      kind: "cat",
      asset: cat.image,
      className: "pet-visual-cat pet-scene-cat",
      layer: petSceneLayers.catBody,
      motion: "body",
      transform: {
        x: 0.5,
        y: 0.5,
        width: 1,
        scale: 1,
        rotation: 0,
        opacity: 1,
      },
    },
    ...createOcclusionNodes(cat.image, props.appearance),
  ];

  if (tokenPlacement) {
    nodes.push(createTokenNode(tokenPlacement, tokenLabel));
  }

  if (showMood) {
    const hasHeadAccessory = nodes.some((node) => node.accessoryCategory === "head");

    nodes.push({
      id: "mood-badge",
      kind: "badge",
      text: getMoodLabel(props.moodId),
      className: "pet-scene-mood",
      layer: petSceneLayers.moodBadge,
      motion: "badge",
      transform: {
        x: 0.5,
        y: hasHeadAccessory ? -0.02 : 0.09,
        width: 0.32,
        scale: 1,
        rotation: 0,
        opacity: 1,
      },
    });
  }

  const sortedNodes = nodes.sort((left, right) => left.layer - right.layer);
  const tokenSurfaceScale = props.surface === "desktop" ? 0.68 : 1;

  return {
    id: `${props.appearance.catTypeId}-${props.moodId}-${props.surface}`,
    surface: props.surface,
    bodyType: rig.bodyType,
    cat,
    rig,
    moodId: props.moodId,
    tokenPlacement,
    tokenLabel,
    nodes: sortedNodes,
    className: `pet-appearance-visual pet-compositor pet-actor pet-appearance-visual-${props.surface} pet-theme-${props.appearance.themeId} pet-mood-${
      moodToneClass[props.moodId]
    } ${props.appearance.moodBadge.colorByState ? "pet-mood-color-state" : ""} pet-cat-${cat.id} pet-body-${rig.bodyType} ${getTokenClassName(
      tokenPlacement,
      tokenBubbleId,
      props.appearance,
    )} pet-accessory-position-${props.appearance.accessorySettings.position}`,
    styleVars: {
      "--pet-visual-scale": renderScale.toString(),
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
      "--pet-motion-breath-duration": motion.breathDuration,
      "--pet-motion-head-duration": motion.headDuration,
      "--pet-motion-effect-duration": motion.effectDuration,
      "--pet-motion-breath-amplitude": motion.breathAmplitude,
      "--pet-motion-head-amplitude": motion.headAmplitude,
      "--pet-motion-root-sway": motion.rootSway,
      "--cat-fur-softness": `${Math.max(0, (furLength - 0.25) * 3.6).toFixed(2)}px`,
      "--cat-pattern-contrast": (0.94 + patternIntensity * 0.18).toFixed(3),
      "--cat-pattern-saturation": (0.96 + patternIntensity * 0.18).toFixed(3),
      "--cat-eye-opacity": eyeColorChanged ? "0.24" : "0",
      "--cat-eye-tint": eyeTintColors[props.appearance.catDetails.eyeColor],
    },
  };
}
