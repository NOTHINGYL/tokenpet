import { useEffect, useMemo, useState } from "react";
import type { PetStorySettings, QuickPlayActionId, QuickPlaySession } from "../types";
import { useAppSettings } from "../hooks/useAppSettings";
import { capabilityFor, defaultPetStory } from "../features/pet-story/PetDirector";

type ActionTone = "green" | "blue" | "gold" | "violet";

type QuickPlayAction = {
  label: string;
  id: QuickPlayActionId;
  tone: ActionTone;
  closesPanel: boolean;
  movesPet?: boolean;
  helper?: string;
};

const actions: QuickPlayAction[] = [
  { label: "Pet", id: "walk_round_trip", tone: "green", closesPanel: true, movesPet: true },
  { label: "Feed snack", id: "token_snack", tone: "gold", closesPanel: true, movesPet: true },
  { label: "Play cursor", id: "play_cursor", tone: "blue", closesPanel: true, helper: "Tracks your cursor for 30 seconds." },
  { label: "Dangle toy", id: "drag_dangle", tone: "violet", closesPanel: true, movesPet: true },
  { label: "Toss yarn", id: "toss_yarn", tone: "blue", closesPanel: true, movesPet: true },
  { label: "Nap here", id: "nap_here", tone: "violet", closesPanel: false },
  { label: "Wake up", id: "wake_up", tone: "gold", closesPanel: false },
  { label: "Summon", id: "summon_to_pointer", tone: "green", closesPanel: true, movesPet: true },
  { label: "Capture", id: "capture_moment", tone: "blue", closesPanel: false },
];

const emptySession: QuickPlaySession = {
  activeAction: null,
  startedAt: null,
  startBounds: null,
  startDirectorState: null,
  pointerMode: "none",
};

function ActionIcon({ id }: { id: QuickPlayActionId }) {
  const common = {
    viewBox: "0 0 48 48",
    role: "presentation",
    "aria-hidden": true,
    "data-action-icon": id,
  } as const;

  if (id === "walk_round_trip") return <svg {...common}><path d="M9 33c5-7 8-11 14-11 7 0 8 8 15 8"/><path d="m34 25 5 5-5 5"/><circle cx="15" cy="15" r="3"/><circle cx="23" cy="11" r="3"/><circle cx="31" cy="15" r="3"/><path d="M18 18c-5 2-7 8-3 11 3 3 6 0 9 0s6 3 9 0c4-3 2-9-3-11-4-2-8-2-12 0Z"/></svg>;
  if (id === "token_snack") return <svg {...common}><path d="M10 34c5-1 9-5 13-10"/><path d="M14 36c5-1 9-5 12-9"/><path d="M22 20c-3-3-2-7 1-9s7 0 8 3c3-2 7 0 7 4s-4 6-7 5c-1 4-6 6-9 3s-2-5 0-6Z"/><path d="m28 17 4 2"/></svg>;
  if (id === "play_cursor") return <svg {...common}><path d="M9 7v27l7-7 5 11 6-3-5-10h10L9 7Z"/><circle cx="36" cy="15" r="7"/><circle cx="36" cy="15" r="2"/><path d="M36 5V2M36 28v-3M26 15h-3M49 15h-3"/></svg>;
  if (id === "drag_dangle") return <svg {...common}><path d="M10 8c8 3 15 7 22 12"/><path d="M31 19v13"/><path d="M29 33c-5-4-10-1-10 3 0 5 6 7 10 3 3 0 6-2 7-5-3 1-5 0-7-1Z"/><circle cx="26" cy="35" r="1"/></svg>;
  if (id === "toss_yarn") return <svg {...common}><circle cx="25" cy="25" r="13"/><path d="M15 20c7 1 14 5 20 11M16 31c6-8 13-13 20-14M23 12c-1 8 3 17 12 22M35 37c5 0 7 2 8 5"/></svg>;
  if (id === "nap_here") return <svg {...common}><path d="M11 29c3 8 20 10 27 2-2 8-10 12-18 10-8-2-13-10-11-18 1-4 4-8 8-10-5 5-7 10-6 16Z"/><path d="m28 12 8-7h-8l8-7M35 19l6-5h-6l6-5"/></svg>;
  if (id === "wake_up") return <svg {...common}><circle cx="24" cy="24" r="9"/><path d="M24 4v7M24 37v7M4 24h7M37 24h7M10 10l5 5M33 33l5 5M38 10l-5 5M15 33l-5 5"/></svg>;
  if (id === "summon_to_pointer") return <svg {...common}><path d="M9 7v27l7-7 5 11 6-3-5-10h10L9 7Z"/><path d="M35 9a12 12 0 0 1 7 12M33 15a6 6 0 0 1 3 6"/></svg>;
  return <svg {...common}><rect x="8" y="14" width="32" height="24" rx="5"/><circle cx="24" cy="26" r="8"/><path d="m16 14 3-5h10l3 5M5 21h3M40 21h3"/></svg>;
}

function LockMark() {
  return <span className="quick-lock-mark" data-lock-mark aria-hidden="true"><svg viewBox="0 0 16 18"><rect x="2" y="7" width="12" height="9" rx="2"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/></svg></span>;
}

function QuickPlayToggle({ label, checked, onChange, detail, icon }: { label: string; checked: boolean; onChange: (checked: boolean) => void; detail?: string; icon: "pin" | "lock" | "mute" }) {
  return (
    <label className="quick-control-row">
      <span className={`quick-control-icon is-${icon}`} aria-hidden="true" />
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
        <div className="quick-play-title-mark" aria-hidden="true"><span /><span /><span /><span /><i /></div>
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
          const disabled = capabilityDisabled || activeDisabled || positionDisabled;
          const locked = positionDisabled || activeDisabled;
          const reason = activeDisabled
            ? `${actions.find((item) => item.id === session.activeAction)?.label ?? "Another action"} is still playing.`
            : positionDisabled
              ? "Unlock the pet position to use this action."
              : capability.reason;
          return (
            <button
              className={`quick-action is-${action.tone}`}
              key={action.id}
              type="button"
              data-action-id={action.id}
              aria-label={action.label}
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
