import type { SyntheticEvent } from "react";
import type { MoodLookId, PetAppearanceSettings, UsageSnapshot } from "../../types";
import { PetCompositor } from "./PetCompositor";

type PetAppearanceVisualProps = {
  appearance: PetAppearanceSettings;
  usage: UsageSnapshot;
  moodId?: MoodLookId;
  surface: "preview" | "desktop";
  onBubbleClick?: (event: SyntheticEvent) => void;
};

export function PetAppearanceVisual(props: PetAppearanceVisualProps) {
  return <PetCompositor {...props} />;
}
