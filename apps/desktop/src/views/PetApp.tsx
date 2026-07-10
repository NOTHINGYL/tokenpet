import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { PetAppearanceVisual } from "../features/pet-appearance/PetAppearanceVisual";
import { normalizePetAppearance } from "../features/pet-appearance/appearanceState";
import { useAppSettings } from "../hooks/useAppSettings";
import { useUsage } from "../hooks/useUsage";
import type { MotionActionId } from "../types";
import { defaultPetStory, resolveAction, rendererAction } from "../features/pet-story/PetDirector";

export function PetApp() {
  const { usage } = useUsage();
  const { settings, setSetting } = useAppSettings();
  const [dragging, setDragging] = useState(false);
  const [summoning, setSummoning] = useState(false);
  const [directorAction, setDirectorAction] = useState<MotionActionId | undefined>();
  const appearance = normalizePetAppearance(settings);
  const story = settings.petStory ?? defaultPetStory;

  useEffect(() => {
    const request = story.lastAction;
    if (!request) return;
    const result = resolveAction(appearance.catTypeId, request.id, story.reduceMotion);
    if (!result) return;
    if (request.id === "capture_moment") window.setTimeout(() => window.print(), 220);
    setDirectorAction(rendererAction(result.resolved));
    const timer = window.setTimeout(() => setDirectorAction(undefined), request.id === "nap_here" ? 6000 : 1800);
    return () => window.clearTimeout(timer);
  }, [story.lastAction?.nonce]);

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
    if (story.lockPosition) return;

    const target = event.target as HTMLElement;
    if (target.closest("button")) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    await window.tokenpet.startDrag();
  }

  function petClick(event: React.MouseEvent<HTMLElement>) {
    if (dragging || (event.target as HTMLElement).closest("button")) return;
    void setSetting("petStory", { ...story, lastAction: { id: "click_purr", nonce: Date.now() } });
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
      onClick={petClick}
    >
      <div className="pet-drag-region" aria-label="Drag TokenPet">
        <PetAppearanceVisual appearance={appearance} usage={usage} moodId={appearance.moodId} motionActionId={directorAction} surface="desktop" onBubbleClick={openSummary} />
      </div>
      <button className="pet-close" type="button" aria-label="Close TokenPet" onPointerDown={close} onClick={close}>
        x
      </button>
    </main>
  );
}
