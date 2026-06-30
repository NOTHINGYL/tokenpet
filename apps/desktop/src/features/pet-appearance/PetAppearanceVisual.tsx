import type { CSSProperties, SyntheticEvent } from "react";
import type { MoodLookId, PetAppearanceSettings, UsageSnapshot } from "../../types";
import { getAccessory, getCatVisual, getMoodLabel, getTokenBubbleLabel, moodToneClass, shouldShowMoodBadge } from "./appearanceView";

type PetAppearanceVisualProps = {
  appearance: PetAppearanceSettings;
  usage: UsageSnapshot;
  moodId?: MoodLookId;
  surface: "preview" | "desktop";
  onBubbleClick?: (event: SyntheticEvent) => void;
};

export function PetAppearanceVisual(props: PetAppearanceVisualProps) {
  const moodId = props.moodId ?? props.appearance.moodId;
  const cat = getCatVisual(props.appearance.catTypeId);
  const tokenLabel = getTokenBubbleLabel(props.appearance.tokenBubbleId, props.usage);
  const showMoodBadge = shouldShowMoodBadge(props.appearance, moodId);

  return (
    <div
      className={`pet-appearance-visual pet-appearance-visual-${props.surface} pet-theme-${props.appearance.themeId} pet-mood-${
        moodToneClass[moodId]
      } ${props.appearance.moodBadge.colorByState ? "pet-mood-color-state" : ""} pet-bubble-${props.appearance.tokenBubbleId}`}
      style={
        {
          "--pet-visual-scale": props.appearance.size.toString(),
          "--pet-visual-opacity": props.appearance.opacity.toString(),
          "--pet-visual-shadow": props.appearance.shadow.toString(),
          "--pet-bubble-scale": props.appearance.bubbleScale.toString(),
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
