import { useState } from "react";
import { GoldCat } from "../components/GoldCat";
import { useAppSettings } from "../hooks/useAppSettings";
import { useUsage } from "../hooks/useUsage";
import { compactNumber } from "../utils/format";

export function PetApp() {
  const { usage } = useUsage();
  const { settings } = useAppSettings();
  const [dragging, setDragging] = useState(false);

  function close(event: React.SyntheticEvent) {
    event.preventDefault();
    event.stopPropagation();
    window.tokenpet.close();
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

  return (
    <main
      className={`pet-stage pet-theme-${settings.petTheme} ${dragging ? "is-dragging" : ""}`}
      onDoubleClick={() => window.tokenpet.togglePopover()}
      onPointerDown={startDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="pet-drag-region" aria-label="Drag TokenPet">
        <GoldCat />
        <button
          className="token-pill"
          type="button"
          aria-label="Open TokenPet summary"
          onClick={() => window.tokenpet.togglePopover()}
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
