import { useCallback, useEffect, useState } from "react";
import { fallbackUsage } from "../state/fallbacks";
import type { UsageSnapshot } from "../types";

export function useUsage() {
  const [usage, setUsage] = useState<UsageSnapshot>(fallbackUsage);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const snapshot = await window.quotapet.refreshUsageSnapshot();
      setUsage(snapshot);
      return snapshot;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    function load() {
      window.quotapet?.getUsageSnapshot().then((snapshot) => {
        if (active) setUsage(snapshot);
      });
    }

    load();
    const timer = window.setInterval(load, 60_000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  return { usage, refresh, loading };
}
