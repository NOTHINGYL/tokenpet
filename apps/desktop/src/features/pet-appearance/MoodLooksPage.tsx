import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { MoodLookId, PetAppearanceSettings, UsageSnapshot } from "../../types";
import { defaultAccessorySettings, defaultMoodBadgeSettings } from "./appearanceState";
import { patchAccessorySettings } from "./accessorySettings";
import { accessoryCatalog, moodLooks } from "./catalog";
import { PetAppearanceVisual } from "./PetAppearanceVisual";
import { PetIcon } from "./icons";

type MoodLooksPageProps = {
  appearance: PetAppearanceSettings;
  usage: UsageSnapshot;
  canUndo: boolean;
  onBack: () => void;
  onPatchAppearance: (patch: Partial<PetAppearanceSettings>) => void;
  onUndo: () => void;
};

const moodLoopIds: Record<MoodLookId, string> = {
  sleepy: "sleep_loop",
  focused: "focus_loop",
  hot: "hot_loop",
  overdrive: "overdrive_loop",
};

const moodDescriptions: Record<MoodLookId, string> = {
  sleepy: "Low-motion, cozy rest with a cool moonlit accent.",
  focused: "Attentive and calm with a soft focus halo.",
  hot: "Warm token flow with bright, energetic sparkles.",
  overdrive: "A short, vivid burst that always cools down.",
};

const effectForMood: Record<MoodLookId, PetAppearanceSettings["accessorySettings"]["effectId"]> = {
  sleepy: "sparkle-aura",
  focused: "leaf-drift",
  hot: "hot-sparks",
  overdrive: "star-trail",
};

function Switch(props: { checked: boolean; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button className="mood-setting-toggle" type="button" aria-pressed={props.checked} disabled={props.disabled} onClick={props.onClick}>
      <span>{props.label}</span>
      <span className={`pet-switch ${props.checked ? "on" : ""}`} aria-hidden="true" />
    </button>
  );
}

export function MoodLooksPage(props: MoodLooksPageProps) {
  const [previewMood, setPreviewMood] = useState<MoodLookId>(props.appearance.moodId);
  const [playingAll, setPlayingAll] = useState(false);
  const [backgroundWash, setBackgroundWash] = useState(20);
  const selectedMood = props.appearance.moodId;
  const actorReady = props.appearance.catTypeId === "golden-british";
  const selectedLook = useMemo(() => moodLooks.find((look) => look.id === selectedMood) ?? moodLooks[0], [selectedMood]);

  useEffect(() => {
    if (!actorReady) {
      setPlayingAll(false);
      setPreviewMood(selectedMood);
      return;
    }
    if (!playingAll) {
      setPreviewMood(selectedMood);
      return;
    }
    let index = moodLooks.findIndex((look) => look.id === previewMood);
    const timer = window.setInterval(() => {
      index = (index + 1) % moodLooks.length;
      setPreviewMood(moodLooks[index].id);
    }, 1200);
    return () => window.clearInterval(timer);
  }, [actorReady, playingAll, selectedMood]);

  const patchMoodVisibility = (moodId: MoodLookId, visible: boolean) => {
    props.onPatchAppearance(
      patchAccessorySettings(props.appearance, {
        moodVisibility: { [moodId]: visible },
      }),
    );
  };

  const resetMoodLooks = () => {
    setPlayingAll(false);
    setPreviewMood("focused");
    setBackgroundWash(20);
    props.onPatchAppearance({
      moodId: "focused",
      moodBadge: defaultMoodBadgeSettings,
      accessorySettings: {
        ...props.appearance.accessorySettings,
        effectId: defaultAccessorySettings.effectId,
        moodVisibility: defaultAccessorySettings.moodVisibility,
      },
    });
  };

  const previewAppearance = { ...props.appearance, moodId: previewMood, moodBadge: { ...props.appearance.moodBadge, showMood: false } };
  const runtimeEffectsAvailable = false;

  return (
    <div className="mood-looks-page" data-pet-page="mood-looks" data-testid="mood-looks-page">
      <div className="cat-type-page-toolbar mood-looks-toolbar">
        <button className="cat-type-back" type="button" onClick={props.onBack} data-testid="mood-looks-back">
          <PetIcon name="back" />
          <span>Appearance</span>
        </button>
        <span aria-hidden="true">/</span>
        <strong>Mood Looks</strong>
        <div className="cat-type-toolbar-actions">
          <span className="cat-type-save-state"><span aria-hidden="true" />Changes apply instantly</span>
          <button type="button" onClick={props.onUndo} disabled={!props.canUndo}><PetIcon name="undo" />Undo</button>
          <button type="button" onClick={resetMoodLooks}><PetIcon name="reset" />Reset mood looks</button>
        </div>
      </div>

      <div className="mood-looks-layout">
        <section className="pet-card mood-live-preview-card">
          <div className="pet-card-header"><div><strong>Live Preview</strong></div><PetIcon name="info" /></div>
          <div className={`mood-live-preview-stage mood-preview-${previewMood}`} style={{ "--mood-wash": `${backgroundWash}%` } as CSSProperties}>
            <PetAppearanceVisual appearance={previewAppearance} usage={props.usage} storyActionId={moodLoopIds[previewMood] as "sleep_loop" | "focus_loop" | "hot_loop" | "overdrive_loop"} surface="preview" />
          </div>
          <div className="mood-preview-picker">
            <small>{actorReady ? "Current actor loop" : "Approved static fallback"}</small>
            <strong><span className={`mood-dot ${selectedLook.dotClassName}`} />{actorReady ? moodLoopIds[previewMood] : "Actor loops planned"}</strong>
          </div>
          <button className="mood-preview-all" type="button" disabled={!actorReady} aria-pressed={playingAll} title={actorReady ? undefined : "This cat currently uses an approved static fallback image."} onClick={() => setPlayingAll((value) => !value)}>
            {actorReady ? (playingAll ? "■ Stop preview" : "▷ Preview all moods") : "Actor loops planned"}
          </button>
        </section>

        <section className="pet-card mood-choice-card">
          <div className="pet-card-header"><div><strong>Moods</strong><span>Select a mood to customize its actor look.</span></div></div>
          <div className="mood-choice-list">
            {moodLooks.map((look) => (
              <button
                key={look.id}
                className={selectedMood === look.id ? "selected" : ""}
                type="button"
                data-mood-look-id={look.id}
                disabled={!actorReady}
                title={actorReady ? `${look.label} actor loop` : "Static fallback image; generated actor loop planned."}
                onClick={() => { setPlayingAll(false); setPreviewMood(look.id); props.onPatchAppearance({ moodId: look.id }); }}
              >
                <span className={`mood-look-symbol ${look.id}`} aria-hidden="true" />
                <span><strong>{look.label}</strong><small>{moodLoopIds[look.id]}</small></span>
                <i className={`mood-dot ${look.dotClassName}`} />
              </button>
            ))}
          </div>
        </section>

        <section className="pet-card mood-editor-card">
          <header className="mood-editor-header">
            <div><span className={`mood-dot ${selectedLook.dotClassName}`} /><div><h3>{selectedLook.label}</h3><p>{moodDescriptions[selectedMood]}</p></div></div>
            <img src={selectedLook.image} alt="" draggable={false} aria-hidden="true" />
          </header>
          <div className="mood-editor-list">
            <label><span><strong>Badge color · baked</strong><small>Generated actor follows the approved mood palette</small></span><select disabled value="mood-palette" onChange={() => undefined}><option value="mood-palette">Mood state palette</option></select></label>
            <label><span><strong>Glow intensity · baked</strong><small>Requires a generated actor variant</small></span><input type="range" min="0" max="100" value="60" disabled readOnly /><em>Baked</em></label>
            <Switch checked={props.appearance.moodBadge.colorByState} disabled={!runtimeEffectsAvailable} label={runtimeEffectsAvailable ? "Tint external token frame by mood" : "Embedded frame tint is baked · planned"} onClick={() => props.onPatchAppearance({ moodBadge: { ...props.appearance.moodBadge, colorByState: !props.appearance.moodBadge.colorByState } })} />
            <label><span><strong>Particle effect</strong><small>{runtimeEffectsAvailable ? "Manifest-compatible ambient accent" : "Baked into generated actor frames"}</small></span><select disabled={!runtimeEffectsAvailable} value={props.appearance.accessorySettings.effectId} onChange={(event) => props.onPatchAppearance(patchAccessorySettings(props.appearance, { effectId: event.target.value as PetAppearanceSettings["accessorySettings"]["effectId"] }))}><option value="none">None</option>{accessoryCatalog.filter((item) => item.category === "effects").map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            <label><span><strong>Expression style · baked</strong><small>The selected actor state owns its expression</small></span><select disabled value="actor-state" onChange={() => undefined}><option value="actor-state">Actor state expression</option></select></label>
            <label><span><strong>Background wash · preview only</strong><small>Console preview, not desktop actor art</small></span><input type="range" min="0" max="60" value={backgroundWash} onChange={(event) => setBackgroundWash(Number(event.target.value))} /><em>{backgroundWash}%</em></label>
            <label><span><strong>Accessory override</strong><small>{runtimeEffectsAvailable ? "Optional signature look" : "Requires generated actor variant"}</small></span><select disabled={!runtimeEffectsAvailable} value={props.appearance.accessorySettings.effectId} onChange={(event) => props.onPatchAppearance(patchAccessorySettings(props.appearance, { effectId: event.target.value as PetAppearanceSettings["accessorySettings"]["effectId"] }))}><option value="none">None</option><option value={effectForMood[selectedMood]}>Recommended for {selectedLook.label}</option></select></label>
          </div>
        </section>

        <aside className="mood-side-column">
          <section className="pet-card mood-effects-card">
            <div className="pet-card-header"><div><strong>Mood Effects</strong><span>Toggle actor-safe effects per mood.</span></div></div>
            {moodLooks.map((look) => (
              <Switch key={look.id} checked={props.appearance.accessorySettings.moodVisibility[look.id]} disabled={!runtimeEffectsAvailable} label={`${look.label} effect${runtimeEffectsAvailable ? "" : " · baked"}`} onClick={() => patchMoodVisibility(look.id, !props.appearance.accessorySettings.moodVisibility[look.id])} />
            ))}
          </section>
          <section className="pet-card mood-quick-actions">
            <h3>Quick Actions</h3>
            <button type="button" disabled title="Mood effects are baked into the current actor frames.">Apply visibility · baked</button>
            <button type="button" onClick={resetMoodLooks}>Reset mood looks</button>
          </section>
        </aside>
      </div>
      <footer className="mood-looks-note"><PetIcon name="info" />Token thresholds are configured in Mood &amp; Reactions. Mood Looks is visual-only.</footer>
    </div>
  );
}
