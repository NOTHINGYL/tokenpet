import type { SyntheticEvent } from "react";
import type { CursorTrackingVisual, MoodLookId, MotionActionId, PetActionId, PetAppearanceSettings, UsageSnapshot } from "../../types";
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
  surface: "preview" | "desktop";
  onBubbleClick?: (event: SyntheticEvent) => void;
};

export function PetCompositor(props: PetCompositorProps) {
  return <PetRenderer {...props} />;
}
