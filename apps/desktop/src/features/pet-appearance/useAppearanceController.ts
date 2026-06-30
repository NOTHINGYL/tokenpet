import { useCallback, useMemo, useRef } from "react";
import type { AppSettings, PetAppearanceSettings } from "../../types";
import { appearanceEquals, defaultPetAppearance, normalizePetAppearance } from "./appearanceState";

type SetSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;

export function useAppearanceController(settings: AppSettings, setSetting: SetSetting) {
  const historyRef = useRef<PetAppearanceSettings[]>([]);
  const appearance = useMemo(() => normalizePetAppearance(settings), [settings]);

  const commitAppearance = useCallback(
    (nextAppearance: PetAppearanceSettings, options: { remember?: boolean } = {}) => {
      const normalizedAppearance = normalizePetAppearance({
        ...settings,
        petAppearance: nextAppearance,
      });

      if (appearanceEquals(appearance, normalizedAppearance)) return;

      if (options.remember !== false) {
        historyRef.current = [...historyRef.current.slice(-24), appearance];
      }

      setSetting("petAppearance", normalizedAppearance);
    },
    [appearance, setSetting, settings],
  );

  const patchAppearance = useCallback(
    (patch: Partial<PetAppearanceSettings>, options?: { remember?: boolean }) => {
      commitAppearance(
        {
          ...appearance,
          ...patch,
          moodBadge: {
            ...appearance.moodBadge,
            ...(patch.moodBadge ?? {}),
          },
        },
        options,
      );
    },
    [appearance, commitAppearance],
  );

  const resetAppearance = useCallback(() => {
    commitAppearance(defaultPetAppearance);
  }, [commitAppearance]);

  const undoAppearance = useCallback(() => {
    const previousAppearance = historyRef.current.at(-1);
    if (!previousAppearance) return;

    historyRef.current = historyRef.current.slice(0, -1);
    commitAppearance(previousAppearance, { remember: false });
  }, [commitAppearance]);

  return {
    appearance,
    canUndo: historyRef.current.length > 0,
    patchAppearance,
    resetAppearance,
    undoAppearance,
  };
}
