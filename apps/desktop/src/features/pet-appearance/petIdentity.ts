export const MAX_PET_NAME_GRAPHEMES = 10;
export const DEFAULT_PET_NAME = "Mochi";

export function splitPetNameGraphemes(value: string) {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return [...segmenter.segment(value)].map((entry) => entry.segment);
  }
  return Array.from(value);
}

export function countPetNameGraphemes(value: string) {
  return splitPetNameGraphemes(value).length;
}

export function truncatePetName(value: string) {
  return splitPetNameGraphemes(value).slice(0, MAX_PET_NAME_GRAPHEMES).join("");
}
