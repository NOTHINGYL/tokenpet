import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type {
  MoodLookId,
  MoodPresentationSettings,
  MoodSignalWindow,
  MoodThresholdProfile,
  PetAppearanceSettings,
  PetStorySettings,
  UsageSnapshot,
} from "../../types";
import { compactNumber } from "../../utils/format";
import { PetAppearanceVisual } from "../pet-appearance/PetAppearanceVisual";
import { PetIcon } from "../pet-appearance/icons";
import {
  defaultMoodControls,
  defaultMoodThresholdProfiles,
  moodSignalFromUsage,
  moodThresholdFromLogRatio,
  moodThresholdSpan,
  moodThresholdToLogRatio,
  normalizeMoodPresentation,
  normalizeMoodThresholdProfile,
  resolveMood,
  updateMoodThreshold,
} from "./moodRuntime";

type Props = {
  story: PetStorySettings;
  appearance: PetAppearanceSettings;
  usage: UsageSnapshot;
  patch: (patch: Partial<PetStorySettings>) => void;
};

const windowOrder: MoodSignalWindow[] = ["live", "today", "last7Days"];
const adjustableMoods = ["focused", "hot", "overdrive"] as const;
type AdjustableMood = (typeof adjustableMoods)[number];

const windowMeta: Record<MoodSignalWindow, {
  label: string;
  shortLabel: string;
  defaults: MoodThresholdProfile;
}> = {
  live: {
    label: "Live · 1 hour",
    shortLabel: "Live · 1 hour",
    defaults: defaultMoodThresholdProfiles.live,
  },
  today: {
    label: "Today",
    shortLabel: "Today",
    defaults: defaultMoodThresholdProfiles.today,
  },
  last7Days: {
    label: "Last 7 days",
    shortLabel: "Last 7 days",
    defaults: defaultMoodThresholdProfiles.last7Days,
  },
};

const moodMeta: Record<MoodLookId, { label: string }> = {
  sleepy: { label: "Sleepy" },
  focused: { label: "Focused" },
  hot: { label: "Hot" },
  overdrive: { label: "Overdrive" },
};

function MoodSemanticIcon(props: { mood: MoodLookId }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    "data-mood-icon": props.mood,
  };
  if (props.mood === "sleepy") {
    return <svg {...common}><path d="M19.2 15.8A8.3 8.3 0 0 1 8.2 4.6 8.6 8.6 0 1 0 19.2 15.8Z" /></svg>;
  }
  if (props.mood === "focused") {
    return <svg {...common}><circle cx="12" cy="12" r="7.2" /><circle cx="12" cy="12" r="3.2" /><path d="M12 1.8v3M12 19.2v3M1.8 12h3M19.2 12h3" /></svg>;
  }
  if (props.mood === "hot") {
    return <span className="mood-semantic-icon mood-semantic-icon-hot" aria-hidden data-mood-icon="hot" />;
  }
  return <svg {...common}><path d="M13.5 2 6.8 13h4.6l-.9 9 6.9-12h-4.5l.6-8Z" /></svg>;
}

function MoodLabel(props: { mood: MoodLookId; iconOnly?: boolean }) {
  return (
    <span
      className={`mood-v35-label mood-${props.mood} ${props.iconOnly ? "icon-only" : ""}`.trim()}
      aria-label={props.iconOnly ? moodMeta[props.mood].label : undefined}
      title={props.iconOnly ? moodMeta[props.mood].label : undefined}
    >
      <MoodSemanticIcon mood={props.mood} />
      {props.iconOnly ? null : moodMeta[props.mood].label}
    </span>
  );
}

function moodProfileFor(story: PetStorySettings, windowId: MoodSignalWindow) {
  const stored = story.moodThresholdProfiles?.[windowId];
  const legacy = windowId === "live" ? story.moodThresholds : undefined;
  return normalizeMoodThresholdProfile(stored ?? legacy ?? windowMeta[windowId].defaults, windowId);
}

function presentationFor(story: PetStorySettings, mood: MoodLookId): MoodPresentationSettings {
  return normalizeMoodPresentation(story.moodPresentation)[mood];
}

export function MoodReactionsPanel(props: Props) {
  const story = props.story;
  const selectedWindow = windowOrder.includes(story.moodSignalWindow as MoodSignalWindow) ? story.moodSignalWindow! : "live";
  const profile = moodProfileFor(story, selectedWindow);
  const thresholdSpan = moodThresholdSpan(selectedWindow);
  const realtimePreviewValue = Math.min(
    thresholdSpan.max,
    Math.max(0, Math.round(moodSignalFromUsage(props.usage, selectedWindow))),
  );
  const [previewValue, setPreviewValueState] = useState(realtimePreviewValue);
  const previewDirty = useRef(false);
  const previousPreviewWindow = useRef(selectedWindow);
  const previewMood = resolveMood(previewValue, profile);
  const previewPresentation = presentationFor(story, previewMood);
  const moodControls = story.moodControls ?? defaultMoodControls;
  const previousPreviewMood = useRef(previewMood);
  const [previewPulseActive, setPreviewPulseActive] = useState(false);
  const previewAppearance = {
    ...props.appearance,
    moodId: previewMood,
    moodBadge: { ...props.appearance.moodBadge, showMood: false },
  };
  const previewUsage = {
    ...props.usage,
    liveOneHourTokens: previewValue,
    todayTokens: previewValue,
    sevenDayTokens: previewValue,
    allTimeTokens: previewValue,
  };
  const meta = windowMeta[selectedWindow];
  const railStyle = {
    "--mood-focused-position": `${moodThresholdToLogRatio(profile.focused, selectedWindow) * 100}%`,
    "--mood-hot-position": `${moodThresholdToLogRatio(profile.hot, selectedWindow) * 100}%`,
    "--mood-overdrive-position": `${moodThresholdToLogRatio(profile.overdrive, selectedWindow) * 100}%`,
  } as CSSProperties;

  useEffect(() => {
    const windowChanged = previousPreviewWindow.current !== selectedWindow;
    if (windowChanged) {
      previousPreviewWindow.current = selectedWindow;
      previewDirty.current = false;
      setPreviewValueState(realtimePreviewValue);
      return;
    }
    if (!previewDirty.current) setPreviewValueState(realtimePreviewValue);
  }, [realtimePreviewValue, selectedWindow]);

  useEffect(() => {
    if (previousPreviewMood.current === previewMood) return;
    previousPreviewMood.current = previewMood;
    if (!moodControls.entryPulse) {
      setPreviewPulseActive(false);
      return;
    }
    setPreviewPulseActive(true);
    const timer = window.setTimeout(() => setPreviewPulseActive(false), props.story.reduceMotion ? 120 : 400);
    return () => window.clearTimeout(timer);
  }, [moodControls.entryPulse, previewMood, props.story.reduceMotion]);

  const patchMoodStory = (next: Partial<PetStorySettings>) => props.patch(next);
  const patchProfile = (windowId: MoodSignalWindow, nextProfile: MoodThresholdProfile) => {
    const normalized = normalizeMoodThresholdProfile(nextProfile, windowId);
    patchMoodStory({
      moodThresholdProfiles: { ...story.moodThresholdProfiles, [windowId]: normalized },
      moodThresholds: windowId === selectedWindow ? normalized : story.moodThresholds,
    });
  };
  const selectWindow = (windowId: MoodSignalWindow) => {
    const nextProfile = moodProfileFor(story, windowId);
    patchMoodStory({
      moodSignalWindow: windowId,
      moodThresholds: nextProfile,
    });
  };
  const setThreshold = (mood: AdjustableMood, logValue: number) => {
    const minLog = Math.log10(thresholdSpan.min);
    const maxLog = Math.log10(thresholdSpan.max);
    const value = moodThresholdFromLogRatio((logValue - minLog) / (maxLog - minLog), selectedWindow);
    patchProfile(selectedWindow, updateMoodThreshold(profile, selectedWindow, mood, value));
  };
  const beginThresholdDrag = (mood: AdjustableMood, event: ReactPointerEvent<HTMLElement>) => {
    const rail = event.currentTarget.closest(".mood-v35-threshold-editor");
    const rect = rail?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    event.preventDefault();
    const minLog = Math.log10(thresholdSpan.min);
    const maxLog = Math.log10(thresholdSpan.max);
    const applyPointer = (clientX: number) => {
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      setThreshold(mood, minLog + ratio * (maxLog - minLog));
    };
    const move = (moveEvent: PointerEvent) => applyPointer(moveEvent.clientX);
    const finish = (upEvent: PointerEvent) => {
      applyPointer(upEvent.clientX);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    applyPointer(event.clientX);
  };
  const resetThresholds = () => patchProfile(selectedWindow, meta.defaults);
  const setPreviewValue = (value: number) => {
    const nextValue = Math.min(thresholdSpan.max, Math.max(0, Math.round(value)));
    previewDirty.current = true;
    setPreviewValueState(nextValue);
  };
  const beginPreviewDrag = (event: ReactPointerEvent<HTMLInputElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    event.preventDefault();
    const applyPointer = (clientX: number) => {
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      setPreviewValue(ratio * thresholdSpan.max);
    };
    const move = (moveEvent: PointerEvent) => applyPointer(moveEvent.clientX);
    const finish = (upEvent: PointerEvent) => {
      applyPointer(upEvent.clientX);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    applyPointer(event.clientX);
  };
  const patchPresentation = (mood: MoodLookId, next: Partial<MoodPresentationSettings>) => {
    patchMoodStory({
      moodPresentation: {
        ...story.moodPresentation,
        [mood]: { ...presentationFor(story, mood), ...next },
      },
    });
  };
  const patchMoodControls = (next: Partial<typeof moodControls>) => {
    patchMoodStory({ moodControls: { ...moodControls, ...next } });
  };

  return (
    <div
      className="story-page mood-reactions-page mood-v35-page"
      data-pet-page="mood"
      data-mood-page-layout="v37-one-way-simulator"
      data-mood-window={selectedWindow}
      data-preview-mood={previewMood}
    >
      <section className="story-card mood-v35-signal-card">
        <div className="story-card-heading">
          <h2>Mood signal</h2>
          <p>Choose the token window that drives your pet&apos;s mood.</p>
        </div>
        <div className="mood-v35-window-row">
          <div className="mood-v35-window-tabs" role="tablist" aria-label="Mood signal window">
            {windowOrder.map((windowId) => (
              <button
                key={windowId}
                type="button"
                role="tab"
                aria-selected={selectedWindow === windowId}
                className={selectedWindow === windowId ? "selected" : ""}
                data-mood-window-option={windowId}
                onClick={() => selectWindow(windowId)}
              >
                {windowMeta[windowId].label}
              </button>
            ))}
          </div>
          <p>Each window keeps its own thresholds.</p>
        </div>
        <div className="mood-v35-threshold-header">
          <strong>Thresholds for <b>{meta.shortLabel}</b></strong>
          <span>Log scale <PetIcon name="info" /></span>
          <button type="button" data-reset-thresholds={selectedWindow} onClick={resetThresholds}>Reset thresholds</button>
        </div>
        <div className="mood-v35-threshold-editor" style={railStyle}>
          <div className="mood-v35-threshold-segments" aria-hidden="true" />
          <div className="mood-v35-fixed-threshold mood-sleepy">
            <span>
              <MoodLabel mood="sleepy" />
            </span>
            <output>0</output>
            <i><svg viewBox="0 0 24 24"><path d="M8 11V8a4 4 0 0 1 8 0v3M6 11h12v10H6z" /></svg></i>
          </div>
          {adjustableMoods.map((mood) => (
            <div
              key={mood}
              className={`mood-v35-threshold-node mood-${mood}`}
              style={{ "--mood-node-position": `var(--mood-${mood}-position)` } as CSSProperties}
            >
              <span>
                <MoodLabel mood={mood} />
              </span>
              <output>{compactNumber(profile[mood])}</output>
              <i
                aria-hidden="true"
                onPointerDown={(event) => beginThresholdDrag(mood, event)}
              >
                <span /><span /><span /><span /><span /><span /><span /><span /><span />
              </i>
              <input
                type="range"
              min={Math.log10(thresholdSpan.min)}
              max={Math.log10(thresholdSpan.max)}
              step="0.001"
              value={Math.log10(profile[mood])}
                aria-label={`${moodMeta[mood].label} start threshold`}
                data-mood-threshold={mood}
                onInput={(event) => setThreshold(mood, Number(event.currentTarget.value))}
                onChange={(event) => setThreshold(mood, Number(event.target.value))}
              />
            </div>
          ))}
        </div>
      </section>

      <div className="mood-v35-workbench">
        <section className="story-card mood-v35-preview-card">
          <div className="mood-v35-preview-heading">
            <h2>Live reaction preview</h2>
            <span>Preview only</span>
          </div>
          <div className="mood-v35-preview-stage">
            {moodControls.badgeVisible ? (
              <span
                className={`mood-v35-preview-badge ${previewPulseActive ? "entry-pulse" : ""} ${props.story.reduceMotion ? "reduce-motion" : ""}`.trim()}
                style={{ "--mood-badge-color": previewPresentation.badgeColor } as CSSProperties}
                data-preview-badge-style={moodControls.badgeStyle}
                data-preview-entry-pulse={previewPulseActive ? "true" : "false"}
              >
                <MoodLabel mood={previewMood} iconOnly={moodControls.badgeStyle === "iconOnly"} />
              </span>
            ) : null}
            <PetAppearanceVisual
              appearance={previewAppearance}
              usage={previewUsage}
              tokenValue={previewValue}
              storyActionId={previewPresentation.actorLoop}
              reduceMotion={props.story.reduceMotion}
              surface="preview"
            />
          </div>
          <label className="mood-v35-preview-slider">
            <strong>Preview token level</strong>
            <input
              type="range"
              min={0}
              max={thresholdSpan.max}
              step={Math.max(1, Math.round(thresholdSpan.min / 10))}
              value={previewValue}
              data-mood-preview-token={previewValue}
              onPointerDown={beginPreviewDrag}
              onInput={(event) => setPreviewValue(Number(event.currentTarget.value))}
              onChange={(event) => setPreviewValue(Number(event.target.value))}
            />
            <output>{compactNumber(previewValue)}</output>
          </label>
        </section>

        <section className="story-card mood-v37-controls-card" data-mood-controls="global">
          <div className="mood-v37-controls-heading">
            <h2>Mood controls</h2>
            <p>Shared presentation for every mood.</p>
          </div>
          <div className="mood-v37-control-row mood-v37-badge-toggle-row">
            <span>
              <strong>Mood badge</strong>
              <small>Show the resolved mood above your pet</small>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={moodControls.badgeVisible}
              aria-label="Show mood badge"
              className={`pet-switch ${moodControls.badgeVisible ? "on" : ""}`}
              data-mood-badge-toggle="global"
              onClick={() => patchMoodControls({ badgeVisible: !moodControls.badgeVisible })}
            />
          </div>
          <div className="mood-v37-colors">
            <strong>Badge colors</strong>
            <div>
              {(["sleepy", "focused", "hot", "overdrive"] as MoodLookId[]).map((mood) => {
                const presentation = presentationFor(story, mood);
                return (
                  <div className={`mood-v37-color-item mood-${mood}`} key={mood}>
                    <MoodSemanticIcon mood={mood} />
                    <label className="mood-v35-color-field" title={`${moodMeta[mood].label} badge color`}>
                      <input
                        type="color"
                        value={presentation.badgeColor}
                        aria-label={`${moodMeta[mood].label} badge color`}
                        data-mood-badge-color={mood}
                        onChange={(event) => patchPresentation(mood, { badgeColor: event.target.value })}
                      />
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mood-v37-control-row mood-v37-style-row">
            <strong>Badge style</strong>
            <div className="mood-v37-style-options" role="radiogroup" aria-label="Mood badge style">
              <button
                type="button"
                role="radio"
                aria-checked={moodControls.badgeStyle === "iconLabel"}
                className={moodControls.badgeStyle === "iconLabel" ? "selected" : ""}
                data-mood-badge-style="iconLabel"
                onClick={() => patchMoodControls({ badgeStyle: "iconLabel" })}
              >
                Icon + label
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={moodControls.badgeStyle === "iconOnly"}
                className={moodControls.badgeStyle === "iconOnly" ? "selected" : ""}
                data-mood-badge-style="iconOnly"
                onClick={() => patchMoodControls({ badgeStyle: "iconOnly" })}
              >
                Icon only
              </button>
            </div>
          </div>
          <div className="mood-v37-control-row mood-v37-entry-row">
            <span>
              <strong>Entry pulse</strong>
              <small>Animate the badge once when the mood changes</small>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={moodControls.entryPulse}
              aria-label="Animate mood badge on entry"
              className={`pet-switch ${moodControls.entryPulse ? "on" : ""}`}
              data-mood-entry-pulse
              onClick={() => patchMoodControls({ entryPulse: !moodControls.entryPulse })}
            />
          </div>
        </section>
      </div>

      <footer className="story-info-note mood-v35-note">
        <PetIcon name="info" />
        Mood signal and thresholds are shared across all cat types. Changes apply instantly.
      </footer>
    </div>
  );
}
