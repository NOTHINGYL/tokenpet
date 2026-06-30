import type { CSSProperties } from "react";
import { useState } from "react";
import { PetAppearanceVisual } from "../features/pet-appearance/PetAppearanceVisual";
import { normalizePetAppearance } from "../features/pet-appearance/appearanceState";
import { useAppSettings } from "../hooks/useAppSettings";
import { useUsage } from "../hooks/useUsage";

export function PetApp() {
  const { usage } = useUsage();
  const { settings } = useAppSettings();
  const [dragging, setDragging] = useState(false);
  const [summoning, setSummoning] = useState(false);
  const appearance = normalizePetAppearance(settings);

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
    "--pet-scale": appearance.size.toString(),
    "--pet-opacity": appearance.opacity.toString(),
    "--pet-shadow-opacity": appearance.shadow.toString(),
  } as CSSProperties;

  return (
    <main
      className={`pet-stage pet-theme-${appearance.themeId} pet-state-${appearance.moodId} ${dragging ? "is-dragging" : ""} ${
        summoning ? "is-summoning" : ""
      }`}
      style={stageStyle}
      onDoubleClick={openSummary}
      onPointerDown={startDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="pet-drag-region" aria-label="Drag TokenPet">
        <PetAppearanceVisual appearance={appearance} usage={usage} moodId={appearance.moodId} surface="desktop" onBubbleClick={openSummary} />
      </div>
      <button className="pet-close" type="button" aria-label="Close TokenPet" onPointerDown={close} onClick={close}>
        x
      </button>
    </main>
  );
}
