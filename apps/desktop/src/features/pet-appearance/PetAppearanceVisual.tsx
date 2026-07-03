import type { CSSProperties, SyntheticEvent } from "react";
import type { CatEyeColor, MoodLookId, PetAppearanceSettings, UsageSnapshot } from "../../types";
import {
  getAccessory,
  getCatType,
  getCatVisual,
  getEffectiveTokenBubbleId,
  getMoodLabel,
  getResolvedTokenBubbleLayout,
  getTokenBubbleLabel,
  getTokenFrameOption,
  moodToneClass,
  shouldShowMoodBadge,
} from "./appearanceView";

type PetAppearanceVisualProps = {
  appearance: PetAppearanceSettings;
  usage: UsageSnapshot;
  moodId?: MoodLookId;
  surface: "preview" | "desktop";
  onBubbleClick?: (event: SyntheticEvent) => void;
};

const eyeTintColors: Record<CatEyeColor, string> = {
  gold: "rgba(224, 157, 24, 0.9)",
  green: "rgba(47, 148, 97, 0.9)",
  blue: "rgba(45, 135, 214, 0.9)",
  slate: "rgba(119, 129, 148, 0.9)",
};

export function PetAppearanceVisual(props: PetAppearanceVisualProps) {
  const moodId = props.moodId ?? props.appearance.moodId;
  const cat = getCatVisual(props.appearance.catTypeId);
  const baseCat = getCatType(props.appearance.catTypeId);
  const tokenBubbleId = getEffectiveTokenBubbleId(props.appearance);
  const tokenLayout = getResolvedTokenBubbleLayout(props.appearance);
  const tokenFrame = getTokenFrameOption(props.appearance);
  const tokenLabel = tokenLayout ? getTokenBubbleLabel(tokenBubbleId, props.usage) : null;
  const showMoodBadge = shouldShowMoodBadge(props.appearance, moodId);
  const showAccessories = props.appearance.accessorySettings.moodVisibility[moodId];
  const furLength = props.appearance.catDetails.furLength / 100;
  const patternIntensity = props.appearance.catDetails.patternIntensity / 100;
  const eyeColorChanged = props.appearance.catDetails.eyeColor !== baseCat.eyeColor;
  const effectiveCatScale = props.appearance.size * (cat.visualScale ?? 1);
  const previewRelief = props.surface === "preview" ? Math.max(0, props.appearance.size - 1) * 80 : 0;
  const tokenSurfaceScale = props.surface === "desktop" ? 0.68 : 1;
  const tokenRenderScale =
    tokenLayout?.mode === "embedded" ? props.appearance.bubbleScale : props.appearance.bubbleScale / Math.max(effectiveCatScale, 0.1);
  const tokenFontSize = tokenBubbleId === "cost" ? 14 : tokenBubbleId === "compact" ? 17 : 24;
  const tokenClassName = tokenLayout
    ? `pet-token-${tokenLayout.mode} pet-token-frame-${tokenFrame.id} ${tokenLayout.textOnly ? "pet-token-text-only" : ""}`
    : "";

  return (
    <div
      className={`pet-appearance-visual pet-appearance-visual-${props.surface} pet-theme-${props.appearance.themeId} pet-mood-${
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
          "--pet-token-anchor-x": `${((tokenLayout?.anchorX ?? 0.5) * 100).toFixed(1)}%`,
          "--pet-token-anchor-y": `${((tokenLayout?.anchorY ?? 0.84) * 100).toFixed(1)}%`,
          "--pet-token-width": `${Math.round((tokenLayout?.width ?? 118) * tokenSurfaceScale)}px`,
          "--pet-token-height": `${Math.round((tokenLayout?.height ?? 48) * tokenSurfaceScale)}px`,
          "--pet-token-font-size": `${Math.max(10, tokenFontSize * tokenSurfaceScale).toFixed(1)}px`,
          "--pet-size-y-relief": `${previewRelief.toFixed(1)}px`,
          "--cat-fur-softness": `${Math.max(0, (furLength - 0.25) * 3.6).toFixed(2)}px`,
          "--cat-pattern-contrast": (0.94 + patternIntensity * 0.18).toFixed(3),
          "--cat-pattern-saturation": (0.96 + patternIntensity * 0.18).toFixed(3),
          "--cat-eye-opacity": eyeColorChanged ? "0.24" : "0",
          "--cat-eye-tint": eyeTintColors[props.appearance.catDetails.eyeColor],
        } as CSSProperties
      }
    >
      {showMoodBadge ? <span className="pet-visual-mood">{getMoodLabel(moodId)}</span> : null}
      <span className="pet-visual-cat-wrap">
        <img className="pet-visual-cat" src={cat.image} alt="" draggable={false} aria-hidden="true" />
        {showAccessories
          ? props.appearance.accessoryIds.map((accessoryId) => {
              const accessory = getAccessory(accessoryId);
              if (!accessory || accessory.locked) return null;

              return (
                <img
                  className={`pet-visual-accessory pet-visual-accessory-${accessory.id}`}
                  key={accessory.id}
                  src={accessory.image}
                  alt=""
                  draggable={false}
                  aria-hidden="true"
                />
              );
            })
          : null}
        {tokenLabel ? (
          <button className="pet-visual-token" type="button" onClick={props.onBubbleClick} aria-label="Open TokenPet summary">
            {tokenLabel}
          </button>
        ) : null}
      </span>
    </div>
  );
}
