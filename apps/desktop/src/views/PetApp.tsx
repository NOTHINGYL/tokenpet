import type { CSSProperties } from "react";
import { useState } from "react";
import { GoldCat } from "../components/GoldCat";
import { useAppSettings } from "../hooks/useAppSettings";
import { useUsage } from "../hooks/useUsage";
import { compactNumber } from "../utils/format";
import type { UsageSnapshot } from "../types";

type PetMood = "sleepy" | "focused" | "hot";

const moodLabels: Record<PetMood, string> = {
  sleepy: "sleepy",
  focused: "focus",
  hot: "hot",
};

function getPetMood(usage: UsageSnapshot): PetMood {
  const burnRate = usage.burnRate.toLowerCase();
  const dailyAverage = usage.sevenDayTokens > 0 ? usage.sevenDayTokens / 7 : usage.analysis.dailyAverageTokens;

  if (burnRate.includes("hot") || usage.todayTokens > Math.max(8_000_000, dailyAverage * 1.45)) {
    return "hot";
  }

  if (usage.todayTokens <= 0 || burnRate.includes("idle") || burnRate.includes("sleep")) {
    return "sleepy";
  }

  return "focused";
}

export function PetApp() {
  const { usage } = useUsage();
  const { settings } = useAppSettings();
  const [dragging, setDragging] = useState(false);
  const [summoning, setSummoning] = useState(false);
  const mood = getPetMood(usage);

  function close(event: React.SyntheticEvent) {
    event.preventDefault();
    event.stopPropagation();
    window.tokenpet.close();
  }

  function openSummary(event?: React.SyntheticEvent) {
    event?.preventDefault();
    event?.stopPropagation();
    setSummoning(true);
    window.setTimeout(() => setSummoning(false), 560);
    window.tokenpet.togglePopover();
  }

  async function startDrag(event: React.PointerEvent<HTMLElement>) {
    if (event.button !== 0) return;

    const target = event.target as HTMLElement;
    if (target.closest("button")) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    await window.tokenpet.startDrag();
  }

  async function endDrag() {
    if (!dragging) return;

    setDragging(false);
    await window.tokenpet.endDrag();
  }

  const stageStyle = {
    "--pet-scale": settings.petScale.toString(),
    "--pet-opacity": settings.petOpacity.toString(),
  } as CSSProperties;

  return (
    <main
      className={`pet-stage pet-theme-${settings.petTheme} pet-state-${mood} ${dragging ? "is-dragging" : ""} ${
        summoning ? "is-summoning" : ""
      }`}
      style={stageStyle}
      onDoubleClick={openSummary}
      onPointerDown={startDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="pet-drag-region" aria-label="Drag TokenPet">
        <div className="pet-motion-shell">
          <GoldCat />
          <span className="pet-eye-lid pet-eye-left" aria-hidden="true" />
          <span className="pet-eye-lid pet-eye-right" aria-hidden="true" />
          <span className="pet-tail-wag" aria-hidden="true" />
          <span className="pet-mood-chip" aria-hidden="true">
            {moodLabels[mood]}
          </span>
        </div>
        <button
          className="token-pill"
          type="button"
          aria-label="Open TokenPet summary"
          onClick={openSummary}
        >
          {compactNumber(usage.todayTokens)}
        </button>
      </div>
      <button className="pet-close" type="button" aria-label="Close TokenPet" onPointerDown={close} onClick={close}>
        x
      </button>
    </main>
  );
}
