import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type {
  AppSettings,
  MoodLookId,
  PetActionId,
  PetAppearanceSettings,
  PetBehaviorMode,
  PetLifeStage,
  PetStorySettings,
  QuickPlayActionId,
  UsageSnapshot,
} from "../../types";
import { compactNumber } from "../../utils/format";
import { getCatTypeOption, moodLooks } from "../pet-appearance/catalog";
import { PetAppearanceVisual } from "../pet-appearance/PetAppearanceVisual";
import { PetIcon } from "../pet-appearance/icons";
import { normalizePetAppearance } from "../pet-appearance/appearanceState";
import { capabilityFor, defaultPetStory, lifecycleFromUsage, moodFromUsage } from "./PetDirector";
import { playPetSoundCue, type PetSoundCueId } from "./soundCueEngine";

type Section = "actions" | "mood" | "sound" | "journey";
type Props = {
  section: Section;
  settings: AppSettings;
  usage: UsageSnapshot;
  setStory: (story: PetStorySettings) => void;
  setAppearance: (patch: Partial<PetAppearanceSettings>) => void;
};

const quickPlayActionIds = new Set<PetActionId>([
  "click_purr", "token_snack", "play_cursor", "drag_dangle", "toss_yarn", "nap_here", "wake_up", "summon_to_screen", "capture_moment",
]);

const coreActionIds: PetActionId[] = [
  "idle_breathe", "blink", "sleep_loop", "focus_loop", "hot_loop", "overdrive_loop",
  "click_purr", "drag_dangle", "drop_bounce", "token_snack", "play_cursor", "milestone_celebrate",
];

const labels: Partial<Record<PetActionId, string>> = {
  idle_breathe: "Living idle", blink: "Blink", sleep_loop: "Sleep loop", focus_loop: "Focus loop",
  hot_loop: "Hot loop", overdrive_loop: "Overdrive", hatch: "Hatch", click_purr: "Click purr",
  drag_dangle: "Drag dangle", drop_bounce: "Drop bounce", token_snack: "Token snack",
  play_cursor: "Play cursor", milestone_celebrate: "Milestone celebrate", level_up: "Level up",
  daily_digest: "Daily digest", toss_yarn: "Toss yarn", nap_here: "Nap here", wake_up: "Wake up",
  settle_down: "Settle down", focus_start: "Focus start", cool_down: "Cool down",
  summon_to_screen: "Summon", capture_moment: "Capture moment",
};

const actionThumbnails: Partial<Record<PetActionId, string>> = {
  idle_breathe: "pet-actors/golden-british/frames/idle_breathe.png",
  blink: "pet-actors/golden-british/frames/blink.png",
  sleep_loop: "pet-actors/golden-british/frames/sleep_loop.png",
  focus_loop: "pet-actors/golden-british/frames/focus_loop.png",
  hot_loop: "pet-actors/golden-british/frames/hot_loop.png",
  overdrive_loop: "pet-actors/golden-british/frames/overdrive_loop.png",
  click_purr: "pet-actors/golden-british/frames/click_purr.png",
  drag_dangle: "pet-actors/golden-british/frames/drag_dangle.png",
  drop_bounce: "pet-actors/golden-british/frames/drop_bounce.png",
  token_snack: "pet-actors/golden-british/frames/token_snack.png",
  play_cursor: "pet-actors/golden-british/frames/play_cursor.png",
  milestone_celebrate: "pet-actors/golden-british/frames/milestone_celebrate.png",
};

const moodMeta: Array<{ id: MoodLookId; label: string; loop: PetActionId; dot: string }> = [
  { id: "sleepy", label: "Sleepy", loop: "sleep_loop", dot: "blue" },
  { id: "focused", label: "Focused", loop: "focus_loop", dot: "green" },
  { id: "hot", label: "Hot", loop: "hot_loop", dot: "gold" },
  { id: "overdrive", label: "Overdrive", loop: "overdrive_loop", dot: "red" },
];

const stageMeta: Array<{ id: PetLifeStage; label: string; unlock: string }> = [
  { id: "egg", label: "Token Egg", unlock: "Hatch" },
  { id: "newKitten", label: "New Kitten", unlock: "Click purr" },
  { id: "deskBuddy", label: "Desk Buddy", unlock: "Focus loop" },
  { id: "flowCompanion", label: "Flow Companion", unlock: "Hot loop" },
  { id: "guardianCompanion", label: "Guardian Companion", unlock: "Memory shelf" },
];

function Toggle(props: { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode; detail?: string; disabled?: boolean }) {
  return (
    <button className="story-switch-row" type="button" role="switch" aria-checked={props.checked} disabled={props.disabled} onClick={() => props.onChange(!props.checked)}>
      <span><strong>{props.children}</strong>{props.detail ? <small>{props.detail}</small> : null}</span>
      <i className={`pet-switch ${props.checked ? "on" : ""}`} aria-hidden="true" />
    </button>
  );
}

function ActionPanel(props: Props & { story: PetStorySettings; appearance: PetAppearanceSettings; patch: (patch: Partial<PetStorySettings>) => void; trigger: (id: PetActionId) => void }) {
  const [selectedAction, setSelectedAction] = useState<PetActionId>("focus_loop");
  const selectedCapability = capabilityFor(props.appearance.catTypeId, selectedAction);
  const actionAvailable = (action: PetActionId) => {
    const capability = capabilityFor(props.appearance.catTypeId, action);
    return capability.status === "ready" || capability.status === "fallback";
  };
  const actorPreviewAppearance = { ...props.appearance, moodBadge: { ...props.appearance.moodBadge, showMood: false } };
  return (
    <div className="story-page actions-director-page" data-pet-page="actions">
      <div className="actions-layout">
        <section className="story-card live-actor-card">
          <div className="story-card-title"><h2>Live Actor Preview</h2><PetIcon name="info" /></div>
          <div className="live-actor-stage">
            <span className="actor-loop-badge">{selectedAction}</span>
            <PetAppearanceVisual appearance={actorPreviewAppearance} usage={props.usage} storyActionId={selectedAction} reduceMotion={props.story.reduceMotion} surface="preview" />
          </div>
          <div className="live-actor-controls">
            <button type="button" onClick={() => props.trigger(selectedAction)} disabled={selectedCapability.status === "planned" || selectedCapability.status === "unavailable"}>▶ Play selected state</button>
            <button type="button" disabled={!actionAvailable("click_purr")} title={actionAvailable("click_purr") ? undefined : "Planned for this static fallback cat."} onClick={() => props.trigger("click_purr")}>Trigger click_purr</button>
            <button type="button" disabled={!actionAvailable("drag_dangle")} title={actionAvailable("drag_dangle") ? undefined : "Planned for this static fallback cat."} onClick={() => props.trigger("drag_dangle")}>Trigger drag_dangle</button>
            <button type="button" disabled={!actionAvailable("milestone_celebrate")} title={actionAvailable("milestone_celebrate") ? undefined : "Planned for this static fallback cat."} onClick={() => props.trigger("milestone_celebrate")}>Trigger milestone_celebrate</button>
          </div>
        </section>

        <div className="actions-center-column">
          <section className="story-card behavior-card">
            <div className="story-card-heading"><h2>Behavior Mode</h2><p>Choose how the actor behaves by default.</p></div>
            <div className="behavior-mode-grid">
              {(["gentle", "balanced", "playful", "focusFriendly"] as PetBehaviorMode[]).map((id) => (
                <button key={id} className={props.story.behaviorMode === id ? "active" : ""} type="button" data-behavior-mode={id} onClick={() => props.patch({ behaviorMode: id })}>
                  <span aria-hidden="true">{id === "gentle" ? "♡" : id === "balanced" ? "⚖" : id === "playful" ? "✦" : "◎"}</span>
                  <strong>{id === "focusFriendly" ? "Focus-friendly" : `${id[0].toUpperCase()}${id.slice(1)}`}</strong>
                </button>
              ))}
            </div>
          </section>

          <section className="story-card actor-library-card">
            <div className="story-card-heading"><h2>Actor States</h2><p>Stable implementation ids requested through Pet Director.</p></div>
            <div className="actor-state-grid">
              {coreActionIds.map((id) => {
                const capability = capabilityFor(props.appearance.catTypeId, id);
                const disabled = capability.status === "planned" || capability.status === "unavailable";
                return (
                  <button key={id} className={selectedAction === id ? "selected" : ""} type="button" data-actor-state={id} disabled={disabled} title={capability.reason ?? id} onClick={() => { setSelectedAction(id); props.trigger(id); }}>
                    <img src={props.appearance.catTypeId === "golden-british" ? (actionThumbnails[id] ?? actionThumbnails.idle_breathe) : getCatTypeOption(props.appearance.catTypeId).image} alt="" draggable={false} aria-hidden="true" />
                    <code>{id}</code>
                    <small className={`cap-${capability.status}`}>{capability.status}{capability.fallbackId ? ` → ${capability.fallbackId}` : ""}</small>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="actions-side-column">
          <section className="story-card interaction-rules-card">
            <div className="story-card-heading"><h2>Interaction Rules</h2><p>Map user actions to actor states.</p></div>
            {([
              ["click", "Click → click_purr"], ["drag", "Drag → drag_dangle"], ["drop", "Drop → drop_bounce"], ["feed", "Feed → token_snack"], ["cursor", "Cursor → play_cursor"],
            ] as const).map(([key, label]) => <Toggle key={key} checked={props.story.interactionRules[key]} onChange={(checked) => props.patch({ interactionRules: { ...props.story.interactionRules, [key]: checked } })}>{label}</Toggle>)}
          </section>
          <section className="story-card director-priority-card">
            <div className="story-card-heading"><h2>Director Priority</h2><p>Order of precedence for selecting states.</p></div>
            <ol><li>Direct manipulation</li><li>User reaction</li><li>Milestone</li><li>Mood loop</li><li>Lifecycle idle</li></ol>
          </section>
        </aside>
      </div>

      <section className="story-card actions-safety-card">
        <div className="story-card-heading"><h2>Safety</h2><p>Keep the companion comfortable and unobtrusive.</p></div>
        <div className="safety-grid">
          <Toggle checked={props.story.reduceMotion} onChange={(reduceMotion) => props.patch({ reduceMotion })} detail="Limit background movement">Reduce motion</Toggle>
          <Toggle checked={props.story.safety.muteDuringFocus} onChange={(muteDuringFocus) => props.patch({ safety: { ...props.story.safety, muteDuringFocus } })} detail="Mute non-essential sounds in Focus-friendly mode">Quiet during focus</Toggle>
          <Toggle checked={props.story.safety.screenSharingStillness} disabled onChange={() => undefined} detail="Planned · screen-sharing detection is not available yet">Still during screen sharing</Toggle>
          <Toggle checked={props.story.safety.batteryLowPause} onChange={(batteryLowPause) => props.patch({ safety: { ...props.story.safety, batteryLowPause } })} detail="Conserve system resources">Pause when battery low</Toggle>
        </div>
      </section>
    </div>
  );
}

function MoodPanel(props: Props & { story: PetStorySettings; appearance: PetAppearanceSettings; patch: (patch: Partial<PetStorySettings>) => void; trigger: (id: PetActionId) => void }) {
  const actorReady = props.appearance.catTypeId === "golden-british";
  const liveMood = moodFromUsage(props.usage, props.story.moodThresholds);
  const [previewMood, setPreviewMood] = useState<MoodLookId>(liveMood);
  const previewLook = moodLooks.find((look) => look.id === previewMood) ?? moodLooks[0];
  const previewAppearance = { ...props.appearance, moodId: previewMood, moodBadge: { ...props.appearance.moodBadge, showMood: false } };
  const setThreshold = (key: keyof PetStorySettings["moodThresholds"], value: number) => props.patch({ moodThresholds: { ...props.story.moodThresholds, [key]: Math.max(0, value) } });
  const previewScenario = (mood: MoodLookId, loop: PetActionId) => { setPreviewMood(mood); props.trigger(loop); };

  return (
    <div className="story-page mood-reactions-page" data-pet-page="mood">
      <div className="mood-story-grid">
        <section className="story-card reaction-preview-card">
          <div className="story-card-title"><h2>Live Reaction Preview</h2><PetIcon name="info" /></div>
          <span className={`reaction-mood-badge ${previewMood}`}><i className={`mood-dot ${previewLook.dotClassName}`} />{previewLook.label}</span>
          <div className="reaction-preview-stage"><PetAppearanceVisual appearance={previewAppearance} usage={props.usage} storyActionId={moodMeta.find((item) => item.id === previewMood)?.loop} reduceMotion={props.story.reduceMotion} surface="preview" /></div>
          <p>This is how your pet reacts right now based on local token flow.</p>
        </section>

        <section className="story-card mood-threshold-card">
          <div className="story-card-title"><div><h2>Mood Thresholds</h2><p>Define token ranges that drive actor loops.</p></div><PetIcon name="info" /></div>
          <div className="threshold-list">
            <div><span><i className="mood-dot blue" /><strong>Sleepy</strong><small>idle below {compactNumber(props.story.moodThresholds.focused)}</small></span><em>automatic</em></div>
            <label><span><i className="mood-dot green" /><strong>Focused</strong><small>steady local flow</small></span><input type="number" min="0" value={props.story.moodThresholds.focused} onChange={(event) => setThreshold("focused", Number(event.target.value))} /></label>
            <label><span><i className="mood-dot gold" /><strong>Hot</strong><small>high local flow</small></span><input type="number" min="0" value={props.story.moodThresholds.hot} onChange={(event) => setThreshold("hot", Number(event.target.value))} /></label>
            <label><span><i className="mood-dot red" /><strong>Overdrive</strong><small>short intense burst</small></span><input type="number" min="0" value={props.story.moodThresholds.overdrive} onChange={(event) => setThreshold("overdrive", Number(event.target.value))} /></label>
          </div>
          <small className="threshold-note">Ranges are evaluated in order. Inactivity always becomes gentle rest, never punishment.</small>
        </section>

        <section className="story-card mood-loop-map-card">
          <div className="story-card-title"><div><h2>Mood to Actor Loop</h2><p>One shared loop mapping across cat types.</p></div><PetIcon name="info" /></div>
          <div className="mood-loop-map">{moodMeta.map((mood) => <div key={mood.id}><span><i className={`mood-dot ${mood.dot}`} />{mood.label}</span><code>{mood.loop}</code></div>)}</div>
          <p>These loops continue while a mood is active, subject to actor capability fallbacks.</p>
        </section>

        <section className="story-card reaction-rules-card">
          <div className="story-card-title"><div><h2>Reaction Rules</h2><p>Control shared mood behavior.</p></div><PetIcon name="info" /></div>
          <Toggle checked={props.appearance.moodBadge.showMood} onChange={(showMood) => props.setAppearance({ moodBadge: { ...props.appearance.moodBadge, showMood } })} detail="Display mood above the pet">Show mood badge</Toggle>
          <Toggle checked={props.appearance.moodBadge.colorByState} onChange={(colorByState) => props.setAppearance({ moodBadge: { ...props.appearance.moodBadge, colorByState } })} detail="Use the approved mood color on the badge">Color mood badge by state</Toggle>
          <Toggle checked={props.story.reactionRules.oneShotOnThreshold} onChange={(oneShotOnThreshold) => props.patch({ reactionRules: { ...props.story.reactionRules, oneShotOnThreshold } })} detail="Play one visible reaction once when mood changes">One-shot on threshold crossing</Toggle>
          <Toggle checked={props.story.reactionRules.coolDownAfterOverdrive} onChange={(coolDownAfterOverdrive) => props.patch({ reactionRules: { ...props.story.reactionRules, coolDownAfterOverdrive } })} detail="Require time before re-entry">Cool down after overdrive</Toggle>
          <Toggle checked={props.story.safety.muteDuringFocus} onChange={(muteDuringFocus) => props.patch({ safety: { ...props.story.safety, muteDuringFocus } })} detail="Reduce non-essential sounds in Focus-friendly mode">Quiet in focus mode</Toggle>
        </section>
      </div>

      <section className="story-card scenario-card">
        <div className="story-card-heading"><h2>Preview Scenarios</h2><p>{actorReady ? "Test the same actor loops used by live token flow." : "This cat uses an approved static fallback; actor-loop previews are planned."}</p></div>
        <div className="scenario-grid">
          {moodMeta.map((mood, index) => {
            const look = moodLooks.find((entry) => entry.id === mood.id)!;
            const samples = ["0 tokens", "750K tokens", "5M tokens", "2B tokens"];
            return <button key={mood.id} className={previewMood === mood.id ? "selected" : ""} type="button" data-preview-mood={mood.id} disabled={!actorReady} title={actorReady ? `${mood.loop} preview` : "Actor loop planned for this static fallback cat."} onClick={() => previewScenario(mood.id, mood.loop)}><strong>Test {mood.label.toLowerCase()}</strong><small>{actorReady ? samples[index] : "Static fallback"}</small><img src={look.image} alt="" draggable={false} aria-hidden="true" /><code>{actorReady ? mood.loop : `${mood.loop} · planned`}</code></button>;
          })}
          <button className="reset-thresholds" type="button" onClick={() => props.patch({ moodThresholds: defaultPetStory.moodThresholds })}><strong>Reset thresholds</strong><small>Restore default ranges</small><span aria-hidden="true">↻</span></button>
        </div>
      </section>
      <footer className="story-info-note"><PetIcon name="info" />Mood behavior is shared across every cat type. Cat type changes appearance only.</footer>
    </div>
  );
}

const cueRows = [
  { id: "wake", label: "Wake or hatch", detail: "Pet wakes up or appears", mark: "☀", action: "wake_up" as PetActionId },
  { id: "purr", label: "Click purr", detail: "You click or interact", mark: "♥", action: "click_purr" as PetActionId },
  { id: "drop", label: "Drag / drop bounce", detail: "Release after dragging", mark: "⌁", action: "drop_bounce" as PetActionId },
  { id: "snack", label: "Token snack", detail: "Pet gets a tiny treat", mark: "●", action: "token_snack" as PetActionId },
  { id: "milestone", label: "Milestone cheer", detail: "A meaningful marker is reached", mark: "★", action: "milestone_celebrate" as PetActionId },
  { id: "hot", label: "Hot alert", detail: "Local token flow becomes hot", mark: "↑", action: "hot_loop" as PetActionId },
  { id: "rest", label: "Cozy rest", detail: "Pet winds down gently", mark: "☾", action: "sleep_loop" as PetActionId },
];

function SoundPanel(props: Props & { story: PetStorySettings; appearance: PetAppearanceSettings; patch: (patch: Partial<PetStorySettings>) => void; trigger: (id: PetActionId) => void }) {
  const [previewAction, setPreviewAction] = useState<PetActionId>("click_purr");
  const cueVolumes = props.story.cueVolumes;
  const setCue = (id: string, enabled: boolean) => props.patch({ cueIds: enabled ? Array.from(new Set([...props.story.cueIds, id])) : props.story.cueIds.filter((cue) => cue !== id) });
  const actorPreviewAppearance = { ...props.appearance, moodBadge: { ...props.appearance.moodBadge, showMood: false } };
  const preview = (cue: (typeof cueRows)[number]) => {
    const cueId = cue.id as PetSoundCueId;
    setPreviewAction(cue.action);
    void playPetSoundCue(cueId, props.story, { preview: true });
  };

  return (
    <div className="story-page sound-cues-page" data-pet-page="sound">
      <div className="sound-story-grid">
        <section className="story-card cue-preview-card">
          <div className="story-card-title"><h2>Live Cue Preview</h2><PetIcon name="info" /></div>
          <span className="actor-loop-badge">{previewAction}</span>
          <div className="cue-preview-stage"><PetAppearanceVisual appearance={actorPreviewAppearance} usage={props.usage} storyActionId={previewAction} reduceMotion={props.story.reduceMotion} surface="preview" /></div>
          <div className="sound-wave" aria-hidden="true">▁▂▅▃▆▂▇▃▅▂▆▁▃▅▂▁</div>
          <button type="button" disabled={!props.story.soundEnabled || props.story.quietMode} onClick={() => preview(cueRows[1])}>▶ Play cue</button>
          <p>{props.story.quietMode ? "Quiet mode is suppressing previews." : "Hear the selected cue locally at the configured volume."}</p>
        </section>

        <div className="sound-center-column">
          <section className="story-card sound-style-card">
            <div className="story-card-heading"><h2>Sound Style</h2><p>Set one shared tonal style for TokenPet.</p></div>
            <div className="sound-style-grid">
              {(["soft", "cozy", "playful"] as const).map((style) => <button key={style} className={props.story.soundEnabled && props.story.soundStyle === style ? "selected" : ""} type="button" onClick={() => props.patch({ soundEnabled: true, soundStyle: style })}><span>{style === "soft" ? "♪" : style === "cozy" ? "♢" : "≋"}</span><strong>{style === "soft" ? "Soft chime" : style === "cozy" ? "Tiny bell" : "Lo-fi blip"}</strong></button>)}
              <button className={!props.story.soundEnabled ? "selected" : ""} type="button" onClick={() => props.patch({ soundEnabled: false })}><span>⌁</span><strong>Silent</strong></button>
            </div>
          </section>

          <section className="story-card cue-library-card">
            <div className="story-card-heading"><h2>Cue Library</h2><p>Optional sounds tied to small story moments.</p></div>
            <div className="cue-table-header"><span>Cue</span><span>Enabled</span><span>Preview</span><span>Volume</span></div>
            {cueRows.map((cue) => {
              const checked = props.story.cueIds.includes(cue.id);
              return <div className="cue-table-row" key={cue.id}><span className="cue-mark">{cue.mark}</span><span><strong>{cue.label}</strong><small>{cue.detail}</small></span><button className={`pet-switch ${checked ? "on" : ""}`} type="button" aria-label={`${checked ? "Disable" : "Enable"} ${cue.label}`} onClick={() => setCue(cue.id, !checked)} /><button className="cue-play-button" type="button" disabled={!checked || !props.story.soundEnabled || props.story.quietMode} onClick={() => preview(cue)}>▶</button><label className="cue-volume"><input type="range" min="0" max="100" value={cueVolumes[cue.id as PetSoundCueId]} onChange={(event) => props.patch({ cueVolumes: { ...props.story.cueVolumes, [cue.id]: Number(event.target.value) } })} /><small>{cueVolumes[cue.id as PetSoundCueId]}%</small></label></div>;
            })}
          </section>
        </div>

        <aside className="story-card sound-safety-card">
          <div className="story-card-heading"><h2>Safety</h2><p>Respect your context and environment.</p></div>
          <label className="master-volume"><span><strong>Master volume</strong><small>Overall output level</small></span><input type="range" min="0" max="100" value={props.story.volume} onChange={(event) => props.patch({ volume: Number(event.target.value) })} style={{ "--range-progress": `${props.story.volume}%` } as CSSProperties} /><em>{props.story.volume}%</em></label>
          <Toggle checked={props.story.safety.muteDuringFocus} onChange={(muteDuringFocus) => props.patch({ safety: { ...props.story.safety, muteDuringFocus } })} detail="Silence cues while focused">Mute during focus</Toggle>
          <Toggle checked={props.story.safety.quietHoursEnabled} onChange={(quietHoursEnabled) => props.patch({ safety: { ...props.story.safety, quietHoursEnabled } })} detail="Automatically lower sounds">Quiet hours</Toggle>
          <div className="quiet-hour-inputs"><input type="time" value={props.story.safety.quietHoursStart} onChange={(event) => props.patch({ safety: { ...props.story.safety, quietHoursStart: event.target.value } })} /><span>–</span><input type="time" value={props.story.safety.quietHoursEnd} onChange={(event) => props.patch({ safety: { ...props.story.safety, quietHoursEnd: event.target.value } })} /></div>
          <Toggle checked={props.story.safety.screenSharingStillness} disabled onChange={() => undefined} detail="Planned · screen-sharing detection is not available yet">Mute while screen sharing</Toggle>
          <Toggle checked disabled onChange={() => undefined} detail="Always uses the operating system audio mixer">Respect system volume</Toggle>
        </aside>
      </div>
      <footer className="story-info-note"><PetIcon name="info" />Sounds are optional, local, and shared across cat types. Cat type changes appearance only.</footer>
    </div>
  );
}

function JourneyPanel(props: Props & { story: PetStorySettings; appearance: PetAppearanceSettings; patch: (patch: Partial<PetStorySettings>) => void; trigger: (id: PetActionId) => void }) {
  const automaticStage = lifecycleFromUsage(props.usage);
  const stage = props.story.pinnedStage ?? automaticStage;
  const stageIndex = stageMeta.findIndex((item) => item.id === stage);
  const nextStage = stageMeta[Math.min(stageMeta.length - 1, stageIndex + 1)];
  const stageFraction = stage === "egg" ? 0
    : stage === "newKitten" ? Math.min(1, props.usage.allTimeTokens / 1_000_000)
    : stage === "deskBuddy" ? Math.min(1, Math.max((props.usage.allTimeTokens - 1_000_000) / 49_000_000, props.usage.analysis.activeDays / 7))
    : stage === "flowCompanion" ? Math.min(1, Math.max((props.usage.allTimeTokens - 50_000_000) / 450_000_000, Math.max(0, props.usage.analysis.activeDays - 7) / 23))
    : 1;
  const progress = Math.round(((Math.max(0, stageIndex) + stageFraction) / (stageMeta.length - 1)) * 100);
  const milestones = [
    { label: "7 active days", value: Math.min(props.usage.analysis.activeDays, 7), max: 7, mark: "✓" },
    { label: "1M local tokens", value: Math.min(props.usage.allTimeTokens, 1_000_000), max: 1_000_000, mark: "◉" },
    { label: "30 active days", value: Math.min(props.usage.analysis.activeDays, 30), max: 30, mark: "□" },
  ];
  const memories = props.story.journey?.memories?.slice(-3).reverse() ?? [];
  const nextUnlocks: Array<{ label: string; requirement: string; mark: string }> = [];
  if (props.usage.allTimeTokens < 1_000_000) nextUnlocks.push({ label: "Desk Buddy", requirement: `${compactNumber(1_000_000 - props.usage.allTimeTokens)} tokens to 1M`, mark: "◎" });
  if (props.usage.allTimeTokens < 50_000_000 && props.usage.analysis.activeDays < 7) nextUnlocks.push({ label: "Flow Companion", requirement: "50M tokens or 7 active days", mark: "✦" });
  if (props.usage.allTimeTokens < 500_000_000 && props.usage.analysis.activeDays < 30) nextUnlocks.push({ label: "Guardian Companion", requirement: "500M tokens or 30 active days", mark: "♙" });
  if (props.usage.analysis.activeDays < 7) nextUnlocks.push({ label: "Cozy Mat · planned visual", requirement: `Requires an actor variant after ${7 - props.usage.analysis.activeDays} more active days`, mark: "▱" });
  if (props.usage.analysis.activeDays < 30) nextUnlocks.push({ label: "30-day local memory card", requirement: `Stored on this machine · ${30 - props.usage.analysis.activeDays} active days remaining`, mark: "□" });
  if (!nextUnlocks.length) nextUnlocks.push({ label: "Core journey complete", requirement: "New local memories can continue naturally", mark: "✓" });
  const actorPreviewAppearance = { ...props.appearance, moodBadge: { ...props.appearance.moodBadge, showMood: false } };

  return (
    <div className="story-page journey-page" data-pet-page="journey">
      <div className="journey-grid">
        <section className="story-card current-companion-card">
          <h2>Current Companion</h2>
          <span className="journey-stage-badge">{stageMeta[stageIndex]?.label ?? stage}</span>
          <div className="journey-pet-stage"><PetAppearanceVisual appearance={actorPreviewAppearance} usage={props.usage} storyActionId="idle_breathe" reduceMotion={props.story.reduceMotion} surface="preview" /></div>
          <strong className="journey-token-total">{compactNumber(props.usage.allTimeTokens)}</strong><small>Local all-time tokens</small>
          <div className="journey-progress"><span><strong>Journey progress</strong><em>{progress}%</em></span><i><b style={{ width: `${progress}%` }} /></i><p>{stage === "guardianCompanion" ? "All lifecycle stages unlocked; local memories can keep growing." : `On the path to ${nextStage.label}`}</p></div>
        </section>

        <div className="journey-main-column">
          <section className="story-card lifecycle-card">
            <div className="story-card-heading"><h2>Lifecycle Progress</h2><p>Your companion grows naturally with local token flow.</p></div>
            <div className="lifecycle-visual-track">
              {stageMeta.map((item, index) => <div key={item.id} className={`${index <= stageIndex ? "reached" : ""} ${index === stageIndex ? "current" : ""}`}><span>{index === 0 ? "◌" : index < 3 ? <img src={actionThumbnails.idle_breathe} alt="" /> : "♙"}</span><i /><strong>{item.label}</strong><small>{index < stageIndex ? "Unlocked" : index === stageIndex ? "Current" : "Locked"}</small></div>)}
            </div>
          </section>

          <div className="journey-middle-grid">
            <section className="story-card next-unlocks-card">
              <div className="story-card-heading"><h2>Next Unlocks</h2><p>Keep your local flow going to unlock what is next.</p></div>
              <div>{nextUnlocks.slice(0, 3).map((unlock) => <article key={unlock.label}><span>{unlock.mark}</span><strong>{unlock.label}</strong><small>{unlock.requirement}</small></article>)}</div>
            </section>
            <section className="story-card local-memories-card">
              <div className="story-card-heading"><h2>Local Memories</h2><p>Little moments from your journey together.</p></div>
              <div data-memory-cards={props.story.companionSettings.showMemoryCards ? "visible" : "hidden"} className={memories.length && props.story.companionSettings.showMemoryCards ? "" : "memory-empty-grid"}>{props.story.companionSettings.showMemoryCards ? (memories.length ? memories.map((memory) => <article key={memory.id}><span>✦</span><strong>{memory.title}</strong><small>{memory.message}</small></article>) : <article className="memory-empty"><span>◌</span><strong>No local memories yet</strong><small>Meaningful milestones and daily digests will appear here, stored only on this machine.</small></article>) : <article className="memory-empty"><span>◌</span><strong>Memory cards are hidden</strong><small>Your local memories remain on this machine. Re-enable “Show memory cards” below to see them here.</small></article>}</div>
            </section>
          </div>

          <div className="journey-bottom-grid">
            <section className="story-card milestones-card">
              <div className="story-card-heading"><h2>Milestones</h2><p>Track progress and celebrate together.</p></div>
              {milestones.map((milestone) => <div key={milestone.label}><span className="milestone-mark">{milestone.mark}</span><strong>{milestone.label}</strong><i><b style={{ width: `${(milestone.value / milestone.max) * 100}%` }} /></i><em>{compactNumber(milestone.value)} / {compactNumber(milestone.max)}</em></div>)}
            </section>
            <section className="story-card companion-settings-card">
              <div className="story-card-heading"><h2>Companion Settings</h2><p>Choose how your companion shows up.</p></div>
              <Toggle checked={props.story.pinnedStage !== null} onChange={(pin) => props.patch({ pinnedStage: pin ? automaticStage : null })} detail="Keep this lifecycle stage selected in Journey">Pin journey stage</Toggle>
              <Toggle checked={props.story.companionSettings.keepTinyMenuForm} onChange={(keepTinyMenuForm) => props.patch({ companionSettings: { ...props.story.companionSettings, keepTinyMenuForm } })} detail="Show a minimal version when space is tight">Keep tiny form in menu bar</Toggle>
              <Toggle checked={props.story.companionSettings.showMemoryCards} onChange={(showMemoryCards) => props.patch({ companionSettings: { ...props.story.companionSettings, showMemoryCards } })} detail="Display recent local memory cards">Show memory cards</Toggle>
              <Toggle checked={props.story.companionSettings.celebrateMilestones} onChange={(celebrateMilestones) => props.patch({ companionSettings: { ...props.story.companionSettings, celebrateMilestones }, cueIds: celebrateMilestones ? Array.from(new Set([...props.story.cueIds, "milestone"])) : props.story.cueIds.filter((cue) => cue !== "milestone") })} detail="Play a small actor celebration">Celebrate milestones</Toggle>
              <button className="journey-celebrate-button" type="button" onClick={() => props.trigger("milestone_celebrate")}>Preview milestone celebration</button>
            </section>
          </div>
        </div>
      </div>
      <footer className="story-info-note"><PetIcon name="info" />Journey, milestones, and local memories are shared across cat types. Changing cat type only changes appearance.</footer>
    </div>
  );
}

export function PetStoryPanel(props: Props) {
  const story = props.settings.petStory ?? defaultPetStory;
  const appearance = normalizePetAppearance(props.settings);
  const patch = (next: Partial<PetStorySettings>) => props.setStory({ ...story, ...next });
  const trigger = (id: PetActionId) => {
    if (quickPlayActionIds.has(id) && window.tokenpet?.dispatchPetAction) {
      void window.tokenpet.dispatchPetAction(id as QuickPlayActionId);
      return;
    }
    patch({ lastAction: { id, nonce: Date.now() } });
  };
  const common = { ...props, story, appearance, patch, trigger };
  if (props.section === "actions") return <ActionPanel {...common} />;
  if (props.section === "mood") return <MoodPanel {...common} />;
  if (props.section === "sound") return <SoundPanel {...common} />;
  return <JourneyPanel {...common} />;
}
