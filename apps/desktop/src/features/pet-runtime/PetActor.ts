import type { MoodLookId, PetAppearanceSettings, UsageSnapshot } from "../../types";
import { createPetScene } from "./petScene";
import type { PetScene, PetSurface } from "./petRigTypes";

export type PetActorInput = {
  appearance: PetAppearanceSettings;
  usage: UsageSnapshot;
  moodId?: MoodLookId;
  surface: PetSurface;
};

export function createPetActor(input: PetActorInput): PetScene {
  return createPetScene({
    appearance: input.appearance,
    usage: input.usage,
    moodId: input.moodId ?? input.appearance.moodId,
    surface: input.surface,
  });
}
