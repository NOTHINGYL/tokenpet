import { useMemo, useState } from "react";
import type { PetActionId, PetBehaviorMode, PetStorySettings, QuickPlayActionId } from "../types";
import { useAppSettings } from "../hooks/useAppSettings";
import { useUsage } from "../hooks/useUsage";
import { capabilityFor, defaultPetStory, moodFromUsage } from "../features/pet-story/PetDirector";

const actions: Array<{ label: string; id: QuickPlayActionId; mark: string }> = [
  { label: "Pet", id: "click_purr", mark: "🐾" },
  { label: "Feed snack", id: "token_snack", mark: "🦴" },
  { label: "Play cursor", id: "play_cursor", mark: "🖱️" },
  { label: "Dangle toy", id: "drag_dangle", mark: "🎣" },
  { label: "Toss yarn", id: "toss_yarn", mark: "🧶" },
  { label: "Nap here", id: "nap_here", mark: "😴" },
  { label: "Wake up", id: "wake_up", mark: "☀️" },
  { label: "Summon", id: "summon_to_screen", mark: "🌀" },
  { label: "Capture", id: "capture_moment", mark: "📷" },
];

const miniToys: Array<{ label: string; id: QuickPlayActionId; mark: string }> = [
  { label: "Laser dot", id: "play_cursor", mark: "🔴" },
  { label: "Feather", id: "drag_dangle", mark: "🪶" },
  { label: "Yarn ball", id: "toss_yarn", mark: "🧶" },
  { label: "Snack", id: "token_snack", mark: "🍪" },
];

const modeOptions: Array<{ id: PetBehaviorMode; label: string; mark: string }> = [
  { id: "gentle", label: "Gentle", mark: "◒" },
  { id: "balanced", label: "Balanced", mark: "⚖" },
  { id: "playful", label: "Playful", mark: "✦" },
  { id: "focusFriendly", label: "Focus", mark: "◎" },
];

export function PopoverApp() {
  const { settings, setSetting } = useAppSettings();
  const { usage } = useUsage();
  const story = settings.petStory ?? defaultPetStory;
  const [lastInteraction, setLastInteraction] = useState("Ready");
  const mood = moodFromUsage(usage, story.moodThresholds);
  const actorId = settings.petAppearance.catTypeId;
  const loop = actorId === "golden-british"
    ? `${mood === "sleepy" ? "sleep" : mood === "focused" ? "focus" : mood}_loop`
    : "Static fallback";
  const patch = (next: Partial<PetStorySettings>) => void setSetting("petStory", { ...story, ...next });
  const trigger = (id: QuickPlayActionId) => {
    setLastInteraction(actions.find((action) => action.id === id)?.label ?? id);
    if (window.tokenpet?.dispatchPetAction) {
      void window.tokenpet.dispatchPetAction(id);
      return;
    }
    patch({ lastAction: { id: id as PetActionId, nonce: Date.now() } });
  };
  const visibleActions = useMemo(() => actions.filter((action) => capabilityFor(actorId, action.id).uiBehavior !== "hide"), [actorId]);

  return (
    <main className="popover quick-play" data-testid="quick-play-panel" data-view="quick-play">
      <header className="quick-header">
        <div><strong>TokenPet</strong><span>v0.8.0</span></div>
        <div className="quick-header-actions"><i className="live-dot">All good</i><button type="button" aria-label="Close Quick Play" onClick={() => window.tokenpet?.closePopover()}>×</button></div>
      </header>

      <div className="quick-status" aria-label="Current pet status">
        <span><small>Mood</small><strong>{mood}</strong></span>
        <span><small>Loop</small><strong>{loop}</strong></span>
        <span><small>Mode</small><strong>{story.behaviorMode === "focusFriendly" ? "Focus" : story.behaviorMode}</strong></span>
        <span><small>Sound</small><strong>{story.quietMode || !story.soundEnabled ? "quiet" : story.soundStyle}</strong></span>
      </div>

      <section className="quick-actions-card">
        <h2>Quick Play</h2>
        <div className="quick-action-grid">
          {visibleActions.map((action) => {
            const capability = capabilityFor(actorId, action.id);
            const disabled = capability.status === "planned" || capability.status === "unavailable" || capability.uiBehavior === "disable";
            return (
              <button key={action.id} type="button" data-action-id={action.id} aria-label={`${action.label} (${action.id})`} disabled={disabled} title={capability.reason} onClick={() => trigger(action.id)}>
                <b>{action.mark}</b><span>{action.label}</span>{capability.status === "fallback" ? <small>fallback</small> : null}
              </button>
            );
          })}
        </div>
      </section>

      <div className="quick-lower-grid">
        <div className="quick-left-column">
          <section className="quick-mode-card">
            <h2>Play Mode</h2>
            <div className="quick-modes">{modeOptions.map((mode) => <button className={story.behaviorMode === mode.id ? "active" : ""} type="button" data-play-mode={mode.id} aria-pressed={story.behaviorMode === mode.id} onClick={() => patch({ behaviorMode: mode.id })} key={mode.id}><b>{mode.mark}</b><span>{mode.label}</span></button>)}</div>
          </section>
          <section className="quick-toys-card">
            <h2>Mini Toys</h2>
            <div className="quick-toys">{miniToys.map((toy) => { const cap = capabilityFor(actorId, toy.id); return <button key={toy.label} type="button" disabled={cap.status === "planned" || cap.status === "unavailable"} onClick={() => trigger(toy.id)}><b>{toy.mark}</b><span>{toy.label}</span></button>; })}</div>
          </section>
        </div>

        <section className="quick-controls-card">
          <h2>Pet Controls</h2>
          <div className="quick-controls">
            <label><span>Follow cursor</span><input type="checkbox" checked={story.followCursor} onChange={(event) => patch({ followCursor: event.target.checked })} /></label>
            <label><span>Always on top</span><input type="checkbox" checked={settings.alwaysOnTop} onChange={(event) => void setSetting("alwaysOnTop", event.target.checked)} /></label>
            <label><span>Lock position</span><input type="checkbox" checked={story.lockPosition} onChange={(event) => patch({ lockPosition: event.target.checked })} /></label>
            <label><span>Quiet mode</span><input type="checkbox" checked={story.quietMode} onChange={(event) => patch({ quietMode: event.target.checked })} /></label>
            <label><span>Reduce motion</span><input type="checkbox" checked={story.reduceMotion} onChange={(event) => patch({ reduceMotion: event.target.checked })} /></label>
          </div>
        </section>
      </div>

      <footer className="quick-footer"><span>Last interaction <strong>{lastInteraction}</strong></span><button className="open-console" type="button" onClick={() => window.tokenpet?.openConsole("pet")}>Open Console <span>→</span></button></footer>
    </main>
  );
}
