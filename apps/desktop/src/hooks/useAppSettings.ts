import { useCallback, useEffect, useState } from "react";
import { normalizePetAppearance, syncLegacyAppearanceFields } from "../features/pet-appearance/appearanceState";
import { defaultJourneyState, defaultPetStory } from "../features/pet-story/PetDirector";
import { fallbackSettings } from "../state/fallbacks";
import type { AppSettings } from "../types";

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(fallbackSettings);

  const normalizeSettings = useCallback((value: Partial<AppSettings>): AppSettings => {
    const merged = {
      ...fallbackSettings,
      ...value,
      petStory: {
        ...defaultPetStory,
        ...(value.petStory ?? {}),
        moodThresholds: {
          ...defaultPetStory.moodThresholds,
          ...(value.petStory?.moodThresholds ?? {}),
        },
        cueVolumes: {
          ...defaultPetStory.cueVolumes,
          ...(value.petStory?.cueVolumes ?? {}),
        },
        interactionRules: {
          ...defaultPetStory.interactionRules,
          ...(value.petStory?.interactionRules ?? {}),
        },
        safety: {
          ...defaultPetStory.safety,
          ...(value.petStory?.safety ?? {}),
        },
        reactionRules: {
          ...defaultPetStory.reactionRules,
          ...(value.petStory?.reactionRules ?? {}),
        },
        companionSettings: {
          ...defaultPetStory.companionSettings,
          ...(value.petStory?.companionSettings ?? {}),
        },
        journey: {
          ...defaultJourneyState,
          ...(value.petStory?.journey ?? {}),
        },
      },
    } as AppSettings;
    const appearance = normalizePetAppearance(merged);
    return syncLegacyAppearanceFields(merged, appearance) as AppSettings;
  }, []);

  useEffect(() => {
    let active = true;

    window.tokenpet?.getAppSettings().then((nextSettings) => {
      if (active) setSettings(normalizeSettings(nextSettings));
    }).catch(() => undefined);

    const unsubscribe = window.tokenpet?.onAppSettingsChanged((nextSettings) => {
      if (active) setSettings(normalizeSettings(nextSettings));
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [normalizeSettings]);

  const setSetting = useCallback(async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    if (!window.tokenpet) {
      setSettings((currentSettings) => {
        const nextSettings = {
          ...currentSettings,
          [key]: value,
        } as AppSettings;
        const appearance = normalizePetAppearance(nextSettings);
        return syncLegacyAppearanceFields(nextSettings, appearance) as AppSettings;
      });
      return;
    }

    const nextSettings = await window.tokenpet.setAppSetting(key, value);
    setSettings(normalizeSettings(nextSettings));
  }, [normalizeSettings]);

  return { settings, setSetting };
}
