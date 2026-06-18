import { useCallback, useEffect, useState } from "react";
import { fallbackSettings } from "../state/fallbacks";
import type { AppSettings } from "../types";

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(fallbackSettings);

  useEffect(() => {
    let active = true;

    window.quotapet?.getAppSettings().then((nextSettings) => {
      if (active) setSettings(nextSettings);
    });

    return () => {
      active = false;
    };
  }, []);

  const setSetting = useCallback(async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const nextSettings = await window.quotapet.setAppSetting(key, value);
    setSettings(nextSettings);
  }, []);

  return { settings, setSetting };
}
