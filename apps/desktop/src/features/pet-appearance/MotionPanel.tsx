import type { CSSProperties } from "react";
import type { MotionActionId, MotionModeId, MotionSettings, PetAppearanceSettings, UsageSnapshot } from "../../types";
import { defaultMotionSettings } from "./appearanceState";
import { motionActionLabels, motionActions, motionModes } from "./motionCatalog";
import { PetAppearanceVisual } from "./PetAppearanceVisual";
import { PetIcon } from "./icons";

type MotionPanelProps = {
  appearance: PetAppearanceSettings;
  usage: UsageSnapshot;
  onPatchAppearance: (patch: Partial<PetAppearanceSettings>, options?: { remember?: boolean }) => void;
};

type MotionPatch = Partial<Omit<MotionSettings, "desktopRoaming" | "triggers" | "safety" | "quietHours">> & {
  desktopRoaming?: Partial<MotionSettings["desktopRoaming"]>;
  triggers?: Partial<MotionSettings["triggers"]>;
  safety?: Partial<MotionSettings["safety"]>;
  quietHours?: Partial<MotionSettings["quietHours"]>;
};

function patchMotionSettings(settings: MotionSettings, patch: MotionPatch): MotionSettings {
  return {
    ...settings,
    ...patch,
    desktopRoaming: {
      ...settings.desktopRoaming,
      ...(patch.desktopRoaming ?? {}),
    },
    triggers: {
      ...settings.triggers,
      ...(patch.triggers ?? {}),
    },
    safety: {
      ...settings.safety,
      ...(patch.safety ?? {}),
    },
    quietHours: {
      ...settings.quietHours,
      ...(patch.quietHours ?? {}),
    },
  };
}

function MotionRange(props: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  const min = props.min ?? 0;
  const max = props.max ?? 100;
  const progress = Math.max(0, Math.min(100, ((props.value - min) / Math.max(max - min, 1)) * 100));

  return (
    <label className="motion-range-row">
      <span>
        <strong>{props.label}</strong>
        <small>{props.value}%</small>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={props.value}
        style={{ "--range-progress": `${progress}%` } as CSSProperties}
        onInput={(event) => props.onChange(Number(event.currentTarget.value))}
        aria-label={props.label}
      />
    </label>
  );
}

function ToggleRow(props: {
  title: string;
  detail: string;
  checked: boolean;
  icon?: "trend" | "star" | "clock" | "laptop" | "flame" | "mode-energetic";
  onToggle: () => void;
}) {
  return (
    <button className="motion-toggle-row" type="button" onClick={props.onToggle}>
      {props.icon ? (
        <span className={`motion-toggle-icon motion-toggle-icon-${props.icon}`}>
          <PetIcon name={props.icon} />
        </span>
      ) : null}
      <span>
        <strong>{props.title}</strong>
        <small>{props.detail}</small>
      </span>
      <span className={`pet-switch ${props.checked ? "on" : ""}`} aria-hidden="true" />
    </button>
  );
}

function MotionPreview(props: { appearance: PetAppearanceSettings; usage: UsageSnapshot; actionId: MotionActionId }) {
  return (
    <section className="pet-card motion-preview-card">
      <div className="pet-card-header">
        <div>
          <strong>Motion Preview</strong>
          <span>See how your pet moves around the desktop.</span>
        </div>
      </div>
      <div className={`motion-preview-stage motion-preview-${props.actionId}`}>
        <div className="motion-path-line">
          <span />
          <span />
          <span />
          <span />
        </div>
        <PetAppearanceVisual appearance={props.appearance} usage={props.usage} surface="preview" motionActionId={props.actionId} />
      </div>
      <div className="motion-preview-controls">
        <button className="motion-pause-button" type="button" aria-label="Pause motion preview">
          <span />
          <span />
        </button>
        <strong>{motionActionLabels[props.actionId]}...</strong>
        <button className="motion-speed-button" type="button">
          {(props.appearance.motionSettings.animationSpeed / 80).toFixed(1)}x
          <span aria-hidden="true">v</span>
        </button>
      </div>
    </section>
  );
}

function MotionModeCard(props: { selectedMode: MotionModeId; onSelect: (modeId: MotionModeId) => void }) {
  return (
    <section className="pet-card motion-mode-card">
      <div className="pet-card-header">
        <div>
          <strong>Motion Mode</strong>
          <span>Choose the overall movement style.</span>
        </div>
      </div>
      <div className="motion-mode-grid">
        {motionModes.map((mode) => (
          <button className={props.selectedMode === mode.id ? "selected" : ""} key={mode.id} type="button" onClick={() => props.onSelect(mode.id)}>
            <PetIcon name={mode.icon} />
            {mode.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function ActionLibrary(props: { selectedAction: MotionActionId; onSelect: (actionId: MotionActionId) => void }) {
  return (
    <section className="pet-card motion-action-card">
      <div className="pet-card-header">
        <div>
          <strong>Action Library</strong>
          <span>Choose a motion to preview and run.</span>
        </div>
      </div>
      <div className="motion-action-grid">
        {motionActions.map((action) => (
          <button
            className={props.selectedAction === action.id ? "selected" : ""}
            key={action.id}
            type="button"
            data-motion-action-id={action.id}
            onClick={() => props.onSelect(action.id)}
          >
            <span className="motion-action-menu">
              <PetIcon name="more" />
            </span>
            <img src={action.image} alt="" draggable={false} aria-hidden="true" />
            <strong>{action.label}</strong>
          </button>
        ))}
      </div>
    </section>
  );
}

function PathPreview() {
  return (
    <section className="pet-card motion-path-card">
      <div className="pet-card-header">
        <div>
          <strong>Path Preview</strong>
          <span>Typical roaming path example.</span>
        </div>
        <button type="button">
          <PetIcon name="reset" />
          Reset to defaults
        </button>
      </div>
      <div className="motion-path-steps">
        {[
          ["H", "Home", "Start position"],
          ["E", "Edge", "Walk the edge"],
          ["J", "Jump", "Cross a gap"],
          ["Z", "Nap", "Take a short break"],
        ].map((step, index) => (
          <div className="motion-path-step" key={step[1]}>
            <span>{step[0]}</span>
            <strong>{step[1]}</strong>
            <small>{step[2]}</small>
            {index < 3 ? <em aria-hidden="true">---&gt;</em> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

export function MotionPanel(props: MotionPanelProps) {
  const motion = props.appearance.motionSettings;
  const patchMotion = (patch: MotionPatch, options?: { remember?: boolean }) => {
    props.onPatchAppearance({ motionSettings: patchMotionSettings(motion, patch) }, options);
  };
  const toggleDesktopRoaming = (key: keyof MotionSettings["desktopRoaming"]) => {
    patchMotion({ desktopRoaming: { [key]: !motion.desktopRoaming[key] } });
  };
  const toggleTrigger = (key: keyof MotionSettings["triggers"]) => {
    patchMotion({ triggers: { [key]: !motion.triggers[key] } });
  };
  const toggleSafety = (key: keyof MotionSettings["safety"]) => {
    patchMotion({ safety: { [key]: !motion.safety[key] } });
  };

  return (
    <div className="pet-motion-panel">
      <div className="pet-motion-grid">
        <MotionPreview appearance={props.appearance} usage={props.usage} actionId={motion.actionId} />
        <div className="motion-main-column">
          <MotionModeCard selectedMode={motion.modeId} onSelect={(modeId) => patchMotion({ modeId })} />
          <ActionLibrary selectedAction={motion.actionId} onSelect={(actionId) => patchMotion({ actionId })} />
        </div>
        <section className="pet-card motion-controls-card">
          <div className="pet-card-header">
            <div>
              <strong>Movement Controls</strong>
              <span>Fine-tune how your pet moves.</span>
            </div>
          </div>
          <div className="motion-range-list">
            <MotionRange label="Animation speed" value={motion.animationSpeed} min={20} max={140} onChange={(animationSpeed) => patchMotion({ animationSpeed }, { remember: false })} />
            <MotionRange label="Motion energy" value={motion.motionEnergy} onChange={(motionEnergy) => patchMotion({ motionEnergy }, { remember: false })} />
            <MotionRange label="Jump height" value={motion.jumpHeight} max={120} onChange={(jumpHeight) => patchMotion({ jumpHeight }, { remember: false })} />
            <MotionRange label="Roaming distance" value={motion.roamingDistance} onChange={(roamingDistance) => patchMotion({ roamingDistance }, { remember: false })} />
            <MotionRange label="Cursor sensitivity" value={motion.cursorSensitivity} onChange={(cursorSensitivity) => patchMotion({ cursorSensitivity }, { remember: false })} />
          </div>
        </section>
        <section className="pet-card motion-roaming-card">
          <div className="pet-card-header">
            <div>
              <strong>Desktop Roaming</strong>
              <span>Control where your pet can wander.</span>
            </div>
          </div>
          <div className="motion-toggle-list">
            <ToggleRow title="Edge roaming" detail="Wander along screen edges" checked={motion.desktopRoaming.edgeRoaming} onToggle={() => toggleDesktopRoaming("edgeRoaming")} />
            <ToggleRow title="Remember position" detail="Return to last spot on launch" checked={motion.desktopRoaming.rememberPosition} onToggle={() => toggleDesktopRoaming("rememberPosition")} />
            <ToggleRow title="Avoid menu bar" detail="Don't walk behind the menu bar" checked={motion.desktopRoaming.avoidMenuBar} onToggle={() => toggleDesktopRoaming("avoidMenuBar")} />
            <ToggleRow title="Avoid focused window" detail="Stay out of your active window" checked={motion.desktopRoaming.avoidFocusedWindow} onToggle={() => toggleDesktopRoaming("avoidFocusedWindow")} />
            <ToggleRow title="Multi-screen travel" detail="Allow moving across displays" checked={motion.desktopRoaming.multiScreenTravel} onToggle={() => toggleDesktopRoaming("multiScreenTravel")} />
            <ToggleRow title="Snap back home" detail="Return home after long absence" checked={motion.desktopRoaming.snapBackHome} onToggle={() => toggleDesktopRoaming("snapBackHome")} />
          </div>
        </section>
        <section className="pet-card motion-triggers-card">
          <div className="pet-card-header">
            <div>
              <strong>Triggers</strong>
              <span>What makes your pet more active.</span>
            </div>
          </div>
          <div className="motion-toggle-list">
            <ToggleRow icon="trend" title="Token spike" detail="Move more when tokens increase" checked={motion.triggers.tokenSpike} onToggle={() => toggleTrigger("tokenSpike")} />
            <ToggleRow icon="star" title="Milestone reached" detail="Celebrate big milestones" checked={motion.triggers.milestoneReached} onToggle={() => toggleTrigger("milestoneReached")} />
            <ToggleRow icon="clock" title="Idle 25m" detail="Get active after being idle" checked={motion.triggers.idleBreak} onToggle={() => toggleTrigger("idleBreak")} />
            <ToggleRow icon="laptop" title="Work session start" detail="Greet you with movement" checked={motion.triggers.workSessionStart} onToggle={() => toggleTrigger("workSessionStart")} />
            <ToggleRow icon="flame" title="Hot state" detail="Move faster when usage is hot" checked={motion.triggers.hotState} onToggle={() => toggleTrigger("hotState")} />
            <ToggleRow icon="mode-energetic" title="Overdrive state" detail="High-energy movement" checked={motion.triggers.overdriveState} onToggle={() => toggleTrigger("overdriveState")} />
          </div>
        </section>
        <section className="pet-card motion-safety-card">
          <div className="pet-card-header">
            <div>
              <strong>Safety &amp; Accessibility</strong>
              <span>Make motion comfortable for you.</span>
            </div>
          </div>
          <div className="motion-toggle-list">
            <ToggleRow title="Reduce motion" detail="Subtle movements only" checked={motion.safety.reduceMotion} onToggle={() => toggleSafety("reduceMotion")} />
            <ToggleRow title="Disable sudden jumps" detail="Prevent abrupt jumps" checked={motion.safety.disableSuddenJumps} onToggle={() => toggleSafety("disableSuddenJumps")} />
            <ToggleRow title="Pause during typing" detail="Stay still while you type" checked={motion.safety.pauseDuringTyping} onToggle={() => toggleSafety("pauseDuringTyping")} />
            <ToggleRow title="Quiet hours motion" detail="Lower activity during quiet hours" checked={motion.safety.quietHoursMotion} onToggle={() => toggleSafety("quietHoursMotion")} />
            <div className="motion-quiet-hours">
              <select value={motion.quietHours.start} onChange={(event) => patchMotion({ quietHours: { ...motion.quietHours, start: event.currentTarget.value } })}>
                <option value="22:00">10:00 PM</option>
                <option value="23:00">11:00 PM</option>
                <option value="00:00">12:00 AM</option>
              </select>
              <span>to</span>
              <select value={motion.quietHours.end} onChange={(event) => patchMotion({ quietHours: { ...motion.quietHours, end: event.currentTarget.value } })}>
                <option value="06:00">6:00 AM</option>
                <option value="07:00">7:00 AM</option>
                <option value="08:00">8:00 AM</option>
              </select>
            </div>
            <ToggleRow title="Screen sharing stillness" detail="Stay still when sharing screen" checked={motion.safety.screenSharingStillness} onToggle={() => toggleSafety("screenSharingStillness")} />
          </div>
        </section>
        <PathPreview />
      </div>
      <footer className="pet-appearance-footer">
        <span>
          <PetIcon name="spark" />
          Motion changes apply instantly.
        </span>
        <button type="button" onClick={() => patchMotion(defaultMotionSettings)}>
          <PetIcon name="reset" />
          Reset motion
        </button>
      </footer>
    </div>
  );
}
