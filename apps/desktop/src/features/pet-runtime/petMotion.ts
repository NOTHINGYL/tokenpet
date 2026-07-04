import type { MoodLookId } from "../../types";

export type PetMotionProfile = {
  breathDuration: string;
  headDuration: string;
  effectDuration: string;
  breathAmplitude: string;
  headAmplitude: string;
  rootSway: string;
};

export const petMotionProfiles: Record<MoodLookId, PetMotionProfile> = {
  sleepy: {
    breathDuration: "5.8s",
    headDuration: "6.8s",
    effectDuration: "7.2s",
    breathAmplitude: "0.012",
    headAmplitude: "2.2px",
    rootSway: "-0.7deg",
  },
  focused: {
    breathDuration: "3.8s",
    headDuration: "4.8s",
    effectDuration: "5.2s",
    breathAmplitude: "0.008",
    headAmplitude: "1.3px",
    rootSway: "0.35deg",
  },
  hot: {
    breathDuration: "1.8s",
    headDuration: "2.2s",
    effectDuration: "2.1s",
    breathAmplitude: "0.018",
    headAmplitude: "2.4px",
    rootSway: "0.75deg",
  },
  overdrive: {
    breathDuration: "1.35s",
    headDuration: "1.55s",
    effectDuration: "1.45s",
    breathAmplitude: "0.024",
    headAmplitude: "3px",
    rootSway: "1deg",
  },
};

export function getPetMotionProfile(moodId: MoodLookId) {
  return petMotionProfiles[moodId];
}
