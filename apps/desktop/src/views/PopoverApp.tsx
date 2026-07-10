import type { PetActionId, PetStorySettings } from "../types";
import { useAppSettings } from "../hooks/useAppSettings";
import { capabilityFor, defaultPetStory } from "../features/pet-story/PetDirector";

const actions: Array<{ label: string; id: PetActionId; mark: string }> = [
  { label: "Pet", id: "click_purr", mark: "♡" }, { label: "Feed snack", id: "token_snack", mark: "◈" }, { label: "Play cursor", id: "play_cursor", mark: "↗" },
  { label: "Dangle toy", id: "drag_dangle", mark: "⌁" }, { label: "Toss yarn", id: "toss_yarn", mark: "●" }, { label: "Nap here", id: "nap_here", mark: "Zz" },
  { label: "Wake up", id: "wake_up", mark: "☼" }, { label: "Summon", id: "summon_to_screen", mark: "◎" }, { label: "Capture", id: "capture_moment", mark: "□" },
];

export function PopoverApp() {
  const { settings, setSetting } = useAppSettings();
  const story = settings.petStory ?? defaultPetStory;
  const patch = (next: Partial<PetStorySettings>) => void setSetting("petStory", { ...story, ...next });
  const trigger = (id: PetActionId) => patch({ lastAction: { id, nonce: Date.now() } });
  return <main className="popover quick-play">
    <header className="quick-header"><div><span>QUICK PLAY</span><strong>Pet Remote</strong></div><i className="live-dot">Pet is nearby</i></header>
    <div className="quick-status"><span>{story.quietMode ? "Quiet mode" : "Ready to play"}</span><small>Actions return to the current mood loop</small></div>
    <section><h2>Play together</h2><div className="quick-action-grid">{actions.map(action=>{const cap=capabilityFor(settings.petAppearance.catTypeId,action.id);return <button key={action.id} disabled={cap.status==="planned"||cap.status==="unavailable"} title={cap.reason}><b>{action.mark}</b><span>{action.label}</span>{cap.status==="fallback"?<small>fallback</small>:null}</button>})}</div></section>
    <section><h2>Play mode</h2><div className="quick-modes">{(["gentle","balanced","playful","focusFriendly"] as const).map(id=><button className={story.behaviorMode===id?"active":""} onClick={()=>patch({behaviorMode:id})} key={id}>{id==="focusFriendly"?"Focus":id}</button>)}</div></section>
    <section><h2>Pet controls</h2><div className="quick-controls"><label><span>Always on top</span><input type="checkbox" checked={settings.alwaysOnTop} onChange={e=>void setSetting("alwaysOnTop",e.target.checked)}/></label>{[["quietMode","Quiet mode"],["followCursor","Follow cursor"],["lockPosition","Lock position"],["reduceMotion","Reduce motion"]].map(([key,label])=><label key={key}><span>{label}</span><input type="checkbox" checked={Boolean(story[key as keyof PetStorySettings])} onChange={e=>patch({[key]:e.target.checked})}/></label>)}</div></section>
    <button className="open-console" onClick={()=>window.tokenpet.openConsole()}>Open Console <span>→</span></button>
  </main>;
}
