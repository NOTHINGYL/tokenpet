import type { SyntheticEvent } from "react";
import type { CursorTrackingVisual, MoodLookId, MotionActionId, PetActionId, PetAppearanceSettings, UsageSnapshot } from "../../types";
import { getAccessory, getTokenBubbleLabel } from "./appearanceView";
import { PetNameBubble } from "./PetNameBubble";
import { PetRenderer } from "../pet-runtime/PetRenderer";

type PetCompositorProps = {
  appearance: PetAppearanceSettings;
  usage: UsageSnapshot;
  moodId?: MoodLookId;
  actionId?: PetActionId;
  storyActionId?: PetActionId;
  motionActionId?: MotionActionId;
  reduceMotion?: boolean;
  pointerOffset?: { x: number; y: number };
  cursorTracking?: CursorTrackingVisual;
  facing?: "left" | "right";
  actorVariant?: string;
  animationNonce?: number;
  previewTimeMs?: number;
  animationStartedAtMs?: number;
  animationCycleDurationMs?: number;
  showAccessories?: boolean;
  surface: "preview" | "desktop";
  onBubbleClick?: (event: SyntheticEvent) => void;
};

export function PetCompositor(props: PetCompositorProps) {
  const moodId = props.moodId ?? props.appearance.moodId;
  const showAccessories = props.showAccessories !== false;
  const displayedAction = props.storyActionId ?? props.actionId;
  const isSleepVisual = displayedAction === "sleep_loop" || displayedAction === "nap_here" || (!displayedAction && moodId === "sleepy");
  const { headId, baseId, effectId } = props.appearance.accessorySettings;
  const headAccessory = showAccessories && (headId === "focus-crown" || headId === "halo") ? getAccessory(headId) : null;
  const groundAccessory = showAccessories && (baseId === "desk-mat" || baseId === "round-rug" || baseId === "star-blanket") ? getAccessory(baseId) : null;
  const effectAccessory = showAccessories && (effectId === "sparkle-aura" || effectId === "leaf-drift" || effectId === "hot-sparks")
    ? getAccessory(effectId)
    : null;

  return (
    <div
      className={`pet-accessory-compositor pet-accessory-compositor-${props.surface} ${props.reduceMotion ? "reduce-motion" : ""}`.trim()}
      data-accessory-head={headAccessory?.id ?? "none"}
      data-accessory-ground={groundAccessory?.id ?? "none"}
      data-accessory-effect={effectAccessory?.id ?? "none"}
      data-accessory-effect-source="selected"
      data-accessories-visible={showAccessories ? "true" : "false"}
      data-sleep-visual={isSleepVisual ? "true" : "false"}
    >
      {groundAccessory ? <img className={`pet-accessory-overlay pet-accessory-overlay-ground pet-accessory-overlay-${groundAccessory.id}`} src={groundAccessory.image} alt="" draggable={false} aria-hidden="true" /> : null}
      <PetRenderer {...props} />
      {effectAccessory ? <img className={`pet-accessory-overlay pet-accessory-overlay-effect pet-accessory-overlay-${effectAccessory.id}`} src={effectAccessory.image} alt="" draggable={false} aria-hidden="true" /> : null}
      {headAccessory ? <img className={`pet-accessory-overlay pet-accessory-overlay-head pet-accessory-overlay-${headAccessory.id}`} src={headAccessory.image} alt="" draggable={false} aria-hidden="true" /> : null}
      {isSleepVisual && props.surface === "preview" ? (
        <PetNameBubble
          name={props.appearance.identity.name}
          content={getTokenBubbleLabel("pill", props.usage) ?? "0"}
          contentMode="token"
          visible
          surface="preview"
          reduceMotion={props.reduceMotion}
        />
      ) : null}
    </div>
  );
}
