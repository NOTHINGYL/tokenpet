import { useCallback, useEffect, useState } from "react";
import { normalizePetAppearance, syncLegacyAppearanceFields } from "../features/pet-appearance/appearanceState";
import {
  defaultJourneyState,
  defaultMoodControls,
  defaultMoodPreviewValues,
  defaultMoodThresholdProfiles,
  defaultPetStory,
  moodSignalWindows,
  moodThresholdSpan,
  normalizeMoodPresentation,
  normalizeMoodControls,
  normalizeMoodThresholdProfile,
} from "../features/pet-story/PetDirector";
import { fallbackSettings } from "../state/fallbacks";
import type { AppSettings } from "../types";

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(fallbackSettings);

  const normalizeSettings = useCallback((value: Partial<AppSettings>): AppSettings => {
    const storySource = value.petStory;
    const moodSignalWindow = moodSignalWindows.includes(storySource?.moodSignalWindow ?? "live")
      ? storySource?.moodSignalWindow ?? "live"
      : "live";
    const oldThresholds = storySource?.moodThresholds;
    const knownOldDefaults = (
      oldThresholds?.focused === 1_000
        && oldThresholds.hot === 10_000
        && oldThresholds.overdrive === 50_000
    ) || (
      oldThresholds?.focused === 50_000
        && oldThresholds.hot === 1_000_000
        && oldThresholds.overdrive === 1_000_000_000
    );
    const moodThresholdProfiles = Object.fromEntries(moodSignalWindows.map((window) => [
      window,
      normalizeMoodThresholdProfile(
        storySource?.moodThresholdProfiles?.[window]
          ?? (window === "live" && oldThresholds && !knownOldDefaults ? oldThresholds : defaultMoodThresholdProfiles[window]),
        window,
      ),
    ])) as AppSettings["petStory"]["moodThresholdProfiles"];
    const moodPreviewValues = Object.fromEntries(moodSignalWindows.map((window) => {
      const candidate = Number(storySource?.moodPreviewValues?.[window] ?? defaultMoodPreviewValues[window]);
      const { max } = moodThresholdSpan(window);
      return [window, Number.isFinite(candidate) ? Math.min(Math.max(candidate, 0), max) : defaultMoodPreviewValues[window]];
    })) as AppSettings["petStory"]["moodPreviewValues"];
    const merged = {
      ...fallbackSettings,
      ...value,
      petStory: {
        ...defaultPetStory,
        ...(storySource ?? {}),
        moodSignalWindow,
        moodThresholdProfiles,
        moodPreviewValues,
        moodPresentation: normalizeMoodPresentation(storySource?.moodPresentation),
        moodControls: normalizeMoodControls(storySource?.moodControls ?? defaultMoodControls),
        moodThresholds: moodThresholdProfiles[moodSignalWindow],
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
