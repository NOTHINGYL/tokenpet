import type { CSSProperties, SyntheticEvent } from "react";
import type { CatEyeColor, MoodLookId, PetAppearanceSettings, UsageSnapshot } from "../../types";
import { getAccessory, getCatType, getCatVisual, getMoodLabel, getTokenBubbleLabel, moodToneClass, shouldShowMoodBadge } from "./appearanceView";

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
  const tokenLabel = getTokenBubbleLabel(props.appearance.tokenBubbleId, props.usage);
  const showMoodBadge = shouldShowMoodBadge(props.appearance, moodId);
  const furLength = props.appearance.catDetails.furLength / 100;
  const patternIntensity = props.appearance.catDetails.patternIntensity / 100;
  const eyeColorChanged = props.appearance.catDetails.eyeColor !== baseCat.eyeColor;
  const effectiveCatScale = props.appearance.size * (cat.visualScale ?? 1);
  const previewRelief = props.surface === "preview" ? Math.max(0, props.appearance.size - 1) * 80 : 0;

  return (
    <div
      className={`pet-appearance-visual pet-appearance-visual-${props.surface} pet-theme-${props.appearance.themeId} pet-mood-${
        moodToneClass[moodId]
      } ${props.appearance.moodBadge.colorByState ? "pet-mood-color-state" : ""} pet-bubble-${props.appearance.tokenBubbleId}`}
      style={
        {
          "--pet-visual-scale": effectiveCatScale.toString(),
          "--pet-visual-opacity": props.appearance.opacity.toString(),
          "--pet-visual-shadow": props.appearance.shadow.toString(),
          "--pet-bubble-scale": props.appearance.bubbleScale.toString(),
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
        {props.appearance.accessoryIds.map((accessoryId) => {
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
        })}
      </span>
      {tokenLabel ? (
        <button className="pet-visual-token" type="button" onClick={props.onBubbleClick} aria-label="Open TokenPet summary">
          {tokenLabel}
        </button>
      ) : null}
    </div>
  );
}
