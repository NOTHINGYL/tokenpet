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
      if (!window.quotapet) return usage;
      const snapshot = await window.quotapet.refreshUsageSnapshot();
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
      if (!window.quotapet) {
        setLoading(false);
        return;
      }

      window.quotapet
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
    const timer = window.setInterval(load, 60_000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  return { usage, refresh, loading, error };
}
