import { useEffect, useMemo, useState } from "react";
import type { PetStorySettings, QuickPlayActionId, QuickPlaySession } from "../types";
import { useAppSettings } from "../hooks/useAppSettings";
import { capabilityFor, defaultPetStory } from "../features/pet-story/PetDirector";

type QuickPlayAction = {
  label: string;
  id: QuickPlayActionId;
  closesPanel: boolean;
  movesPet?: boolean;
  helper?: string;
};

const actions: QuickPlayAction[] = [
  { label: "Pet", id: "walk_round_trip", closesPanel: true, movesPet: true },
  { label: "Feed snack", id: "token_snack", closesPanel: true, movesPet: true },
  { label: "Play cursor", id: "play_cursor", closesPanel: true, helper: "30 sec" },
  { label: "Dangle toy", id: "drag_dangle", closesPanel: true, movesPet: true },
  { label: "Toss yarn", id: "toss_yarn", closesPanel: true, movesPet: true },
  { label: "Nap here", id: "nap_here", closesPanel: false },
  { label: "Wake up", id: "wake_up", closesPanel: false },
  { label: "Summon", id: "summon_to_pointer", closesPanel: true, movesPet: true },
  { label: "Capture", id: "capture_moment", closesPanel: false },
];

const emptySession: QuickPlaySession = {
  activeAction: null,
  startedAt: null,
  phase: "idle",
  phaseStartedAt: null,
  startBounds: null,
  startDirectorState: null,
  targetPoint: null,
  pointerMode: "none",
  resting: false,
  failure: null,
};

function ActionIcon({ id }: { id: QuickPlayActionId }) {
  const asset = id.replaceAll("_", "-");
  return <img src={`./quick-play-v18/${asset}.png`} alt="" aria-hidden="true" data-action-icon={id} />;
}

function LockMark() {
  return <span className="quick-lock-mark" data-lock-mark aria-hidden="true"><svg viewBox="0 0 16 18"><rect x="2" y="7" width="12" height="9" rx="2"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/></svg></span>;
}

function QuickPlayToggle({ label, checked, onChange, detail, icon }: { label: string; checked: boolean; onChange: (checked: boolean) => void; detail?: string; icon: "pin" | "lock" | "mute" }) {
  return (
    <label className="quick-control-row">
      <img className="quick-control-icon" src={`./quick-play-v18/control-${icon}.png`} alt="" aria-hidden="true" />
      <span className="quick-control-copy"><strong>{label}</strong>{detail ? <small>{detail}</small> : null}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="quick-switch" aria-hidden="true"><i /></span>
    </label>
  );
}

export function PopoverApp() {
  const { settings, setSetting } = useAppSettings();
  const story = settings.petStory ?? defaultPetStory;
  const actorId = settings.petAppearance.catTypeId;
  const [session, setSession] = useState<QuickPlaySession>(emptySession);

  useEffect(() => {
    let disposed = false;
    void window.tokenpet?.getQuickPlaySession?.().then((next) => {
      if (!disposed) setSession(next);
    });
    const unsubscribe = window.tokenpet?.onQuickPlaySessionChanged?.((next) => setSession(next));
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, []);

  const visibleActions = useMemo(
    () => actions.filter((action) => capabilityFor(actorId, action.id).uiBehavior !== "hide"),
    [actorId],
  );
  const patchStory = (next: Partial<PetStorySettings>) => void setSetting("petStory", { ...story, ...next });

  async function trigger(action: QuickPlayAction) {
    const result = await window.tokenpet?.dispatchPetAction?.(action.id);
    if (!result?.accepted) return;
    if (action.closesPanel) window.tokenpet?.closePopover();
  }

  return (
    <main className="popover quick-play" data-testid="quick-play-panel" data-view="quick-play">
      <header className="quick-play-header">
        <img className="quick-play-title-mark" src="./quick-play-v18/header-paw.png" alt="" aria-hidden="true" />
        <div className="quick-play-heading">
          <h1>Quick Play</h1>
          <p>{session.activeAction ? `Playing: ${actions.find((action) => action.id === session.activeAction)?.label ?? session.activeAction}…` : "Play, rest, or move your companion."}</p>
        </div>
        <button className="quick-play-close" type="button" aria-label="Close Quick Play" onClick={() => window.tokenpet?.closePopover()}>×</button>
      </header>

      <section className="quick-action-grid" aria-label="Quick Play actions">
        {visibleActions.map((action) => {
          const capability = capabilityFor(actorId, action.id);
          const capabilityDisabled = capability.status === "planned" || capability.status === "unavailable" || capability.uiBehavior === "disable";
          const activeDisabled = session.activeAction !== null && action.id !== "capture_moment";
          const positionDisabled = story.lockPosition && Boolean(action.movesPet);
          const restingDisabled = action.id === "nap_here" && session.resting;
          const disabled = capabilityDisabled || activeDisabled || positionDisabled || restingDisabled;
          const locked = positionDisabled;
          const reason = activeDisabled
            ? `${actions.find((item) => item.id === session.activeAction)?.label ?? "Another action"} is still playing.`
              : positionDisabled
                ? "Unlock the pet position to use this action."
                : restingDisabled
                  ? "Your pet is already asleep."
                : capability.reason;
          return (
            <button
              className="quick-action"
              key={action.id}
              type="button"
              data-action-id={action.id}
              aria-label={action.id === "play_cursor" ? `${action.label}. Tracks your cursor for 30 seconds.` : action.label}
              disabled={disabled}
              title={reason}
              onClick={() => void trigger(action)}
            >
              {locked ? <LockMark /> : null}
              <ActionIcon id={action.id} />
              <span className="quick-action-label">{action.label}</span>
              {action.helper ? <small>{action.helper}</small> : null}
            </button>
          );
        })}
      </section>

      <section className="quick-controls-card" aria-labelledby="quick-controls-title">
        <h2 id="quick-controls-title">Pet Controls</h2>
        <div className="quick-controls">
          <QuickPlayToggle label="Always on top" icon="pin" checked={settings.alwaysOnTop} onChange={(checked) => void setSetting("alwaysOnTop", checked)} />
          <QuickPlayToggle label="Lock position" icon="lock" checked={story.lockPosition} detail={story.lockPosition ? "Movement actions are locked" : undefined} onChange={(checked) => patchStory({ lockPosition: checked })} />
          <QuickPlayToggle label="Mute pet sounds" icon="mute" checked={story.quietMode} onChange={(checked) => patchStory({ quietMode: checked })} />
        </div>
      </section>

      <footer className="quick-footer">
        <button className="open-console" type="button" onClick={() => window.tokenpet?.openConsole("pet")}>
          <span>Open Pet Console</span><b aria-hidden="true">→</b>
        </button>
      </footer>
    </main>
  );
}
