import type { SyntheticEvent } from "react";
import type { CursorTrackingVisual, MoodBadgeStyle, MoodLookId, MotionActionId, PetActionId, PetAppearanceSettings, UsageSnapshot } from "../../types";
import { PetCompositor } from "./PetCompositor";

type PetAppearanceVisualProps = {
  appearance: PetAppearanceSettings;
  usage: UsageSnapshot;
  tokenValue?: number;
  moodId?: MoodLookId;
  moodBadgeVisible?: boolean;
  moodBadgeColor?: string;
  moodBadgeStyle?: MoodBadgeStyle;
  moodBadgePulse?: boolean;
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

export function PetAppearanceVisual(props: PetAppearanceVisualProps) {
  return <PetCompositor {...props} />;
}
