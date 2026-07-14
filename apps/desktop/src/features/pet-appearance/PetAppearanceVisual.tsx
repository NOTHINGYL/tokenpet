import type { SyntheticEvent } from "react";
import type { CursorTrackingVisual, MoodLookId, MotionActionId, PetActionId, PetAppearanceSettings, UsageSnapshot } from "../../types";
import { PetCompositor } from "./PetCompositor";

type PetAppearanceVisualProps = {
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
  animationNonce?: number;
  previewTimeMs?: number;
  animationStartedAtMs?: number;
  animationCycleDurationMs?: number;
  surface: "preview" | "desktop";
  onBubbleClick?: (event: SyntheticEvent) => void;
};

export function PetAppearanceVisual(props: PetAppearanceVisualProps) {
  return <PetCompositor {...props} />;
}
