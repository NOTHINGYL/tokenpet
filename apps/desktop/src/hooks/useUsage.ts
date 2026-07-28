import { useCallback, useEffect, useState } from "react";
import { fallbackUsage } from "../state/fallbacks";
import type { UsageSnapshot } from "../types";

export function useUsage() {
  const [usage, setUsage] = useState<UsageSnapshot>(fallbackUsage);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!window.tokenpet) return usage;
      const snapshot = await window.tokenpet.refreshUsageSnapshot();
      setUsage(snapshot);
      return snapshot;
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Unable to refresh usage");
      return usage;
    } finally {
      setLoading(false);
    }
  }, [usage]);

  useEffect(() => {
    let active = true;

    function load() {
      if (!window.tokenpet) {
        setLoading(false);
        return;
      }

      window.tokenpet
        .getUsageSnapshot()
        .then((snapshot) => {
          if (active) {
            setUsage(snapshot);
            setError(null);
          }
        })
        .catch((loadError) => {
          if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load usage");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }

    load();
    // Mood stabilization ticks once per second in PetApp. Refresh provider
    // totals at the main-process cache cadence so every renderer does not
    // repeatedly invoke the same expensive local usage scan.
    const timer = window.setInterval(load, 15_000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  return { usage, refresh, loading, error };
}
