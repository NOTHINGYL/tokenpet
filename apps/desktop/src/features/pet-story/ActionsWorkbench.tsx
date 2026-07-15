import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { PetActorAnimation, PetActorFrameAsset, PetActorManifest } from "../../../../../packages/pet-asset-schema/src";
import {
  createDistanceLockedWalkPlan,
  DANGLE_PURSUIT_ROOT_MOTION,
  DANGLE_RETURN_ROOT_MOTION,
  DEFAULT_WALK_ROOT_MOTION,
  distanceLockedWalkProgressAtTime,
  FEED_SNACK_RETURN_ROOT_MOTION,
  FEED_SNACK_WALK_ROOT_MOTION,
} from "../../../electron/quick-play-choreography";
import type {
  CursorTrackingVisual,
  PetActionId,
  PetActionTuningValue,
  PetAppearanceSettings,
  PetStorySettings,
  QuickPlayActionId,
  UsageSnapshot,
} from "../../types";
import { getCatTypeOption } from "../pet-appearance/catalog";
import { PetAppearanceVisual } from "../pet-appearance/PetAppearanceVisual";
import { actorAnimationCandidates, actorManifestFor, capabilityFor } from "./PetDirector";

export type ActionsPreviewId = Exclude<QuickPlayActionId, "capture_moment">;

type ChoiceOption = { value: string; label: string; mark?: string; asset?: string };
type SettingDefinition =
  | { key: string; label: string; type: "range"; min: number; max: number; step: number; defaultValue: number; minMark?: string; maxMark?: string; format: (value: number) => string }
  | { key: string; label: string; type: "toggle"; defaultValue: boolean; detail?: string }
  | { key: string; label: string; type: "choices"; defaultValue: string; options: ChoiceOption[] };

type ActionDefinition = {
  id: ActionsPreviewId;
  label: string;
  icon: string;
  durationMs: number;
  contract: string;
  settings: SettingDefinition[];
  phaseLabels: string[];
  authoredPhaseActions: PetActionId[];
  propLabel: string;
  propMark: string;
};

type PreviewFrame = {
  id: string;
  label: string;
  actorActionId: PetActionId;
  src: string;
  startMs: number;
  durationMs: number;
  sourceStartMs: number;
  sourceDurationMs: number;
};

const iconRoot = "quick-play-v18";
const PET_PREVIEW_TRAVEL_DISTANCE_PX = 288;
const PET_PREVIEW_TRAVEL_PERCENT = 54;
const percent = (value: number) => `${Math.round(value)}%`;
const seconds = (value: number) => `${value.toFixed(1)} sec`;

export const actionsPreviewIds: ActionsPreviewId[] = [
  "walk_round_trip",
  "token_snack",
  "play_cursor",
  "drag_dangle",
  "toss_yarn",
  "nap_here",
  "wake_up",
  "summon_to_pointer",
];

export const actionDefinitions: Record<ActionsPreviewId, ActionDefinition> = {
  walk_round_trip: {
    id: "walk_round_trip", label: "Pet", icon: `${iconRoot}/walk-round-trip.png`, durationMs: 5_500,
    contract: "new destination · exact return", propLabel: "simulated destination", propMark: "⌂",
    phaseLabels: ["Stand", "Walk out", "Look around", "Return", "Restore"],
    authoredPhaseActions: ["idle_breathe", "run_across", "play_cursor", "run_across", "idle_breathe"],
    settings: [
      { key: "walkPace", label: "Walk pace", type: "range", min: 60, max: 140, step: 5, defaultValue: 90, minMark: "🐢", maxMark: "🐇", format: percent },
      { key: "roamDistance", label: "Roam distance", type: "choices", defaultValue: "medium", options: [{ value: "near", label: "Near" }, { value: "medium", label: "Medium" }, { value: "far", label: "Far" }] },
      { key: "destinationPause", label: "Destination pause", type: "range", min: .5, max: 2, step: .1, defaultValue: 1.1, format: seconds },
      { key: "lookAroundEffect", label: "Look-around effect", type: "toggle", defaultValue: true, detail: "A quiet glance before returning" },
    ],
  },
  token_snack: {
    id: "token_snack", label: "Feed snack", icon: `${iconRoot}/token-snack.png`, durationMs: 9_000,
    contract: "dedicated approach · 3 licks · separate return run", propLabel: "snack", propMark: "🐾",
    phaseLabels: ["Stretch", "Slow walk", "Arrive", "Lick ×3", "Eat", "Return", "Settle"],
    authoredPhaseActions: ["feed_snack_stretch", "feed_snack_walk_slow", "feed_snack_arrive", "feed_snack_lick", "feed_snack_eat", "feed_snack_return_run", "feed_snack_settle"],
    settings: [
      { key: "snackStyle", label: "Snack style", type: "choices", defaultValue: "paw", options: [
        { value: "paw", label: "Paw treat", asset: "pet-actors/golden-british/props/snack-paw.png" },
        { value: "fish", label: "Fish bite", asset: "pet-actors/golden-british/props/snack-fish.png" },
        { value: "token", label: "Token cookie", asset: "pet-actors/golden-british/props/snack-token.png" },
      ] },
      { key: "walkPace", label: "Walk pace", type: "range", min: 60, max: 140, step: 5, defaultValue: 82, minMark: "🐢", maxMark: "🐇", format: percent },
      { key: "snackSize", label: "Snack size", type: "range", min: 70, max: 130, step: 5, defaultValue: 100, minMark: "•", maxMark: "🐾", format: percent },
      { key: "startMeow", label: "Start meow", type: "toggle", defaultValue: true, detail: "Play one preview cue at phase one" },
      { key: "returnPace", label: "Return pace", type: "choices", defaultValue: "run", options: [{ value: "run", label: "Run", mark: "🐈" }, { value: "quick", label: "Quick walk", mark: "🐈" }] },
    ],
  },
  play_cursor: {
    id: "play_cursor", label: "Play cursor", icon: `${iconRoot}/play-cursor.png`, durationMs: 10_000,
    contract: "10 sec · eyes → head → ears · body anchored", propLabel: "virtual cursor", propMark: "➤",
    phaseLabels: ["Notice", "Eyes follow", "Ears follow", "Track", "Restore"],
    authoredPhaseActions: ["idle_breathe", "play_cursor", "play_cursor", "play_cursor", "idle_breathe"],
    settings: [
      { key: "followSmoothing", label: "Follow smoothing", type: "range", min: 20, max: 100, step: 5, defaultValue: 74, minMark: "Soft", maxMark: "Fluid", format: percent },
      { key: "maxHeadTurnAngle", label: "Maximum head-turn angle", type: "range", min: 10, max: 42, step: 1, defaultValue: 28, format: (value) => `${value}°` },
      { key: "earFollow", label: "Ear follow", type: "toggle", defaultValue: true, detail: "Ears trail the eyes and head" },
    ],
  },
  drag_dangle: {
    id: "drag_dangle", label: "Dangle toy", icon: `${iconRoot}/drag-dangle.png`, durationMs: 8_000,
    contract: ">1 sec shake · pounce/play/chase · click any time · exact return", propLabel: "fish teaser", propMark: "🐟",
    phaseLabels: ["Alert", "Stalk", "Crouch", "Pounce", "Play", "Pursuit", "Return", "Settle"],
    authoredPhaseActions: ["dangle_alert", "dangle_stalk", "dangle_crouch", "dangle_pounce", "dangle_play", "dangle_pursuit_run", "dangle_return_walk", "dangle_settle"],
    settings: [
      { key: "fishToyStyle", label: "Fish-toy style", type: "choices", defaultValue: "mint", options: [
        { value: "mint", label: "Mint fish", asset: "pet-actors/golden-british/props/dangle-fish-mint.png" },
        { value: "blue", label: "Blue fish", asset: "pet-actors/golden-british/props/dangle-fish-blue.png" },
        { value: "feather", label: "Feather fish", asset: "pet-actors/golden-british/props/dangle-fish-feather.png" },
      ] },
      { key: "swingResponse", label: "Swing response", type: "range", min: 20, max: 100, step: 5, defaultValue: 66, minMark: "Soft", maxMark: "Snappy", format: percent },
      { key: "pursuitPace", label: "Pursuit pace", type: "range", min: 70, max: 150, step: 5, defaultValue: 108, format: percent },
      { key: "toyTrailEffect", label: "Toy trail effect", type: "toggle", defaultValue: true, detail: "Preview-only motion trail" },
    ],
  },
  toss_yarn: {
    id: "toss_yarn", label: "Toss yarn", icon: `${iconRoot}/toss-yarn.png`, durationMs: 5_500,
    contract: "one placement · mouth carry · return home", propLabel: "yarn ball", propMark: "🧶",
    phaseLabels: ["Place", "Roll", "Chase", "Carry", "Settle"],
    authoredPhaseActions: ["idle_breathe", "toss_yarn", "play_cursor", "toss_yarn", "idle_breathe"],
    settings: [
      { key: "yarnColor", label: "Yarn color", type: "choices", defaultValue: "orange", options: [{ value: "orange", label: "Orange", mark: "●" }, { value: "blue", label: "Blue", mark: "●" }, { value: "violet", label: "Violet", mark: "●" }] },
      { key: "rollDistance", label: "Roll distance", type: "range", min: 60, max: 180, step: 10, defaultValue: 120, format: (value) => `${value}px` },
      { key: "rollSpeed", label: "Roll speed", type: "range", min: 60, max: 150, step: 5, defaultValue: 100, format: percent },
      { key: "returnPace", label: "Return pace", type: "choices", defaultValue: "quick", options: [{ value: "run", label: "Run", mark: "🐈" }, { value: "quick", label: "Quick walk", mark: "🐈" }] },
    ],
  },
  nap_here: {
    id: "nap_here", label: "Nap here", icon: `${iconRoot}/nap-here.png`, durationMs: 1_800,
    contract: "stay in place · no restart while asleep", propLabel: "sleep effect", propMark: "Zz",
    phaseLabels: ["Settle", "Curl", "Breathe", "Dream", "Sleep"],
    authoredPhaseActions: ["idle_breathe", "nap_here", "nap_here", "sleep_loop", "sleep_loop"],
    settings: [
      { key: "settlePose", label: "Settle pose", type: "choices", defaultValue: "curl", options: [{ value: "curl", label: "Cozy curl", mark: "☾" }, { value: "paws", label: "On paws", mark: "🐾" }, { value: "side", label: "Side rest", mark: "◡" }] },
      { key: "breathingIntensity", label: "Breathing intensity", type: "range", min: 20, max: 100, step: 5, defaultValue: 54, format: percent },
      { key: "zEffect", label: "Z effect", type: "toggle", defaultValue: true, detail: "Show a gentle sleep marker" },
      { key: "sleepShadow", label: "Sleep shadow", type: "toggle", defaultValue: true, detail: "Ground the resting pose" },
    ],
  },
  wake_up: {
    id: "wake_up", label: "Wake up", icon: `${iconRoot}/wake-up.png`, durationMs: 5_000,
    contract: "≈5 sec · full-body stretch · restore state", propLabel: "wake sparkle", propMark: "✦",
    phaseLabels: ["Blink", "Roll", "Long stretch", "Hold", "Gather"],
    authoredPhaseActions: ["sleep_loop", "wake_up", "wake_up", "wake_up", "focus_loop"],
    settings: [
      { key: "meowVoice", label: "Meow voice", type: "choices", defaultValue: "cozy", options: [{ value: "soft", label: "Soft" }, { value: "cozy", label: "Cozy" }, { value: "playful", label: "Playful" }] },
      { key: "meowCue", label: "Meow cue", type: "toggle", defaultValue: true, detail: "Preview the approved local cue" },
      { key: "stretchHold", label: "Stretch hold", type: "range", min: 2.4, max: 3.6, step: .1, defaultValue: 3, format: seconds },
      { key: "wakeSparkle", label: "Wake sparkle", type: "toggle", defaultValue: true, detail: "A small preview-only highlight" },
    ],
  },
  summon_to_pointer: {
    id: "summon_to_pointer", label: "Summon", icon: `${iconRoot}/summon-to-pointer.png`, durationMs: 4_500,
    contract: "walk only · saves new home in real play", propLabel: "virtual pointer", propMark: "⌖",
    phaseLabels: ["Stand", "Route", "Walk", "Arrive", "Settle"],
    authoredPhaseActions: ["idle_breathe", "summon_to_screen", "summon_to_screen", "summon_to_screen", "focus_loop"],
    settings: [
      { key: "walkPace", label: "Walk pace", type: "range", min: 60, max: 140, step: 5, defaultValue: 92, minMark: "🐢", maxMark: "🐇", format: percent },
      { key: "arrivalOffset", label: "Arrival offset", type: "choices", defaultValue: "beside", options: [{ value: "near", label: "Near" }, { value: "beside", label: "Beside" }, { value: "below", label: "Below" }] },
      { key: "routeCurve", label: "Route curve", type: "choices", defaultValue: "gentle", options: [{ value: "straight", label: "Straight" }, { value: "gentle", label: "Gentle" }, { value: "curved", label: "Curved" }] },
      { key: "settleDelay", label: "Settle delay", type: "range", min: .2, max: 1.5, step: .1, defaultValue: .7, format: seconds },
    ],
  },
};

function defaultSettingsFor(action: ActionDefinition) {
  return Object.fromEntries(action.settings.map((setting) => [setting.key, setting.defaultValue])) as Record<string, PetActionTuningValue>;
}

function resolveAnimation(manifest: PetActorManifest, actionId: PetActionId) {
  return actorAnimationCandidates(actionId).map((id) => manifest.animations[id]).find(Boolean) as PetActorAnimation | undefined;
}

function frameUrl(manifest: PetActorManifest, frame: PetActorFrameAsset) {
  return `pet-actors/${manifest.actorId}/${frame.src}`;
}

function labelForFrame(labels: string[], index: number, count: number) {
  if (count <= 1) return labels[0];
  return labels[Math.min(labels.length - 1, Math.round(index * (labels.length - 1) / (count - 1)))];
}

function buildPreviewFrames(
  definition: ActionDefinition,
  manifest: PetActorManifest | null,
  fallbackImage: string,
  previewDurationMs = definition.durationMs,
  authoredPhaseDurations?: number[],
): PreviewFrame[] {
  if (!manifest) return [{ id: `${definition.id}-static`, label: "Approved still", actorActionId: "idle_breathe", src: fallbackImage, startMs: 0, durationMs: previewDurationMs, sourceStartMs: 0, sourceDurationMs: previewDurationMs }];
  if (definition.id === "token_snack" || definition.id === "drag_dangle") {
    let startMs = 0;
    return definition.authoredPhaseActions.map((actorActionId, index) => {
      const animation = resolveAnimation(manifest, actorActionId) ?? manifest.animations[manifest.defaultAnimation];
      const sourceDurationMs = animation.frames.reduce((total, frame) => total + Math.max(1, frame.durationMs), 0);
      const durationMs = authoredPhaseDurations?.[index] ?? previewDurationMs / definition.authoredPhaseActions.length;
      const frame: PreviewFrame = {
        id: `${definition.id}-${actorActionId}-${index}`,
        label: definition.phaseLabels[index],
        actorActionId,
        src: frameUrl(manifest, animation.frames[0]),
        startMs,
        durationMs,
        sourceStartMs: 0,
        sourceDurationMs,
      };
      startMs += durationMs;
      return frame;
    });
  }
  const requestedAnimation = resolveAnimation(manifest, definition.id);
  if (requestedAnimation && requestedAnimation.frames.length > 1) {
    const phaseDuration = previewDurationMs / requestedAnimation.frames.length;
    let sourceCursor = 0;
    return requestedAnimation.frames.map((frame, index) => {
      const next = {
        id: `${definition.id}-${frame.id}-${index}`,
        label: labelForFrame(definition.phaseLabels, index, requestedAnimation.frames.length),
        actorActionId: definition.id as PetActionId,
        src: frameUrl(manifest, frame),
        startMs: phaseDuration * index,
        durationMs: phaseDuration,
        sourceStartMs: sourceCursor,
        sourceDurationMs: frame.durationMs,
      };
      sourceCursor += Math.max(1, frame.durationMs);
      return next;
    });
  }

  const phaseDuration = previewDurationMs / definition.authoredPhaseActions.length;
  return definition.authoredPhaseActions.map((actorActionId, index) => {
    const animation = resolveAnimation(manifest, actorActionId) ?? requestedAnimation ?? manifest.animations[manifest.defaultAnimation];
    const frame = animation?.frames[0];
    return {
      id: `${definition.id}-${definition.phaseLabels[index]}-${index}`,
      label: definition.phaseLabels[index],
      actorActionId,
      src: frame ? frameUrl(manifest, frame) : fallbackImage,
      startMs: phaseDuration * index,
      durationMs: phaseDuration,
      sourceStartMs: 0,
      sourceDurationMs: frame?.durationMs ?? phaseDuration,
    };
  });
}

function sampleTimeline(frames: PreviewFrame[], elapsedMs: number) {
  const frame = frames.find((candidate) => elapsedMs < candidate.startMs + candidate.durationMs) ?? frames.at(-1)!;
  const phaseProgress = Math.min(1, Math.max(0, (elapsedMs - frame.startMs) / Math.max(frame.durationMs, 1)));
  return { frame, phaseProgress, actorTimeMs: frame.sourceStartMs + frame.sourceDurationMs * phaseProgress };
}

function stageSample(actionId: ActionsPreviewId, progress: number, walkRootProgress = progress) {
  const roundTrip = Math.sin(Math.PI * progress);
  const cursorX = 50 + Math.sin(progress * Math.PI * 4) * 31;
  const cursorY = 45 + Math.cos(progress * Math.PI * 3) * 18;
  if (actionId === "walk_round_trip") return { actorX: -PET_PREVIEW_TRAVEL_PERCENT / 2 + walkRootProgress * PET_PREVIEW_TRAVEL_PERCENT, actorY: 0, propX: 83, propY: 70, cursorX: 83, cursorY: 70 };
  if (actionId === "token_snack") return { actorX: -roundTrip * 19, actorY: 0, propX: 30, propY: 71, cursorX: 30, cursorY: 71 };
  if (actionId === "play_cursor") return { actorX: 0, actorY: 0, propX: cursorX, propY: cursorY, cursorX, cursorY };
  if (actionId === "drag_dangle") return { actorX: Math.sin(progress * Math.PI * 2) * 8, actorY: -roundTrip * 3, propX: cursorX, propY: 24 + Math.sin(progress * Math.PI * 5) * 10, cursorX, cursorY: 24 };
  if (actionId === "toss_yarn") return { actorX: -roundTrip * 16, actorY: 0, propX: 25 + progress * 49, propY: 73, cursorX: 74, cursorY: 73 };
  if (actionId === "summon_to_pointer") return { actorX: -29 + progress * 31, actorY: -roundTrip * 2, propX: 79, propY: 67, cursorX: 79, cursorY: 67 };
  return { actorX: 0, actorY: 0, propX: 72, propY: 27, cursorX: 72, cursorY: 27 };
}

function ChoiceSetting(props: { definition: Extract<SettingDefinition, { type: "choices" }>; value: string; onChange: (value: string) => void }) {
  return (
    <div className="action-setting-group" data-action-setting={props.definition.key}>
      <strong>{props.definition.label}</strong>
      <div className={`action-setting-choices action-setting-choices-${props.definition.options.length}`}>
        {props.definition.options.map((option) => (
          <button key={option.value} className={props.value === option.value ? "selected" : ""} type="button" aria-pressed={props.value === option.value} onClick={() => props.onChange(option.value)}>
            {option.asset ? <img src={option.asset} alt="" draggable={false} aria-hidden="true" /> : option.mark ? <span aria-hidden="true">{option.mark}</span> : null}<em>{option.label}</em>
          </button>
        ))}
      </div>
    </div>
  );
}

function RangeSetting(props: { definition: Extract<SettingDefinition, { type: "range" }>; value: number; onChange: (value: number) => void }) {
  const progress = (props.value - props.definition.min) / Math.max(1, props.definition.max - props.definition.min) * 100;
  return (
    <label className="action-setting-group action-setting-range" data-action-setting={props.definition.key}>
      <span><strong>{props.definition.label}</strong><em>{props.definition.format(props.value)}</em></span>
      <span className="action-setting-range-control">
        <i>{props.definition.minMark ?? "−"}</i>
        <input type="range" min={props.definition.min} max={props.definition.max} step={props.definition.step} value={props.value} style={{ "--range-progress": `${progress}%` } as CSSProperties} onChange={(event) => props.onChange(Number(event.target.value))} />
        <i>{props.definition.maxMark ?? "+"}</i>
      </span>
    </label>
  );
}

function ToggleSetting(props: { definition: Extract<SettingDefinition, { type: "toggle" }>; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <button className="action-setting-toggle" type="button" role="switch" aria-checked={props.value} data-action-setting={props.definition.key} onClick={() => props.onChange(!props.value)}>
      <span><strong>{props.definition.label}</strong>{props.definition.detail ? <small>{props.definition.detail}</small> : null}</span>
      <i className={`pet-switch ${props.value ? "on" : ""}`} aria-hidden="true" />
    </button>
  );
}

export function ActionsWorkbench(props: {
  story: PetStorySettings;
  appearance: PetAppearanceSettings;
  usage: UsageSnapshot;
  patch: (patch: Partial<PetStorySettings>) => void;
}) {
  const [selectedAction, setSelectedAction] = useState<ActionsPreviewId>("token_snack");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [loopPreview, setLoopPreview] = useState(true);
  const lastTickRef = useRef<number | null>(null);
  const definition = actionDefinitions[selectedAction];
  const manifest = actorManifestFor(props.appearance.catTypeId);
  const fallbackImage = getCatTypeOption(props.appearance.catTypeId).image;
  const capability = capabilityFor(props.appearance.catTypeId, selectedAction);
  const previewAvailable = capability.status === "ready" || capability.status === "fallback";
  const savedSettings = props.story.actionSettings?.byAction[selectedAction] ?? {};
  const settings = { ...defaultSettingsFor(definition), ...savedSettings };
  const walkAnimation = manifest ? resolveAnimation(manifest, "walk_round_trip") : undefined;
  const walkRootMotion = walkAnimation?.locomotion
    ? {
      nominalStepDistancePx: walkAnimation.locomotion.nominalStepDistancePx,
      footfallsPerCycle: walkAnimation.locomotion.footfallsPerCycle,
      rootStepKeyframes: walkAnimation.locomotion.rootStepKeyframes,
    }
    : DEFAULT_WALK_ROOT_MOTION;
  const walkPreviewPlan = createDistanceLockedWalkPlan(PET_PREVIEW_TRAVEL_DISTANCE_PX, Number(settings.walkPace ?? 90), 1, walkRootMotion);
  const feedWalkAnimation = manifest ? resolveAnimation(manifest, "feed_snack_walk_slow") : undefined;
  const feedReturnAnimation = manifest ? resolveAnimation(manifest, "feed_snack_return_run") : undefined;
  const feedWalkRootMotion = feedWalkAnimation?.locomotion ?? FEED_SNACK_WALK_ROOT_MOTION;
  const feedReturnRootMotion = feedReturnAnimation?.locomotion ?? FEED_SNACK_RETURN_ROOT_MOTION;
  const feedWalkPlan = createDistanceLockedWalkPlan(PET_PREVIEW_TRAVEL_DISTANCE_PX, Number(settings.walkPace ?? 82), 1, feedWalkRootMotion);
  const feedReturnPace = String(settings.returnPace ?? "run") === "run" ? 140 : 118;
  const feedReturnPlan = createDistanceLockedWalkPlan(PET_PREVIEW_TRAVEL_DISTANCE_PX, feedReturnPace, 1, feedReturnRootMotion);
  const feedPhaseDurations = [900, feedWalkPlan.durationMs, 520, 1_080, 720, feedReturnPlan.durationMs, 280];
  const feedPreviewDurationMs = feedPhaseDurations.reduce((total, duration) => total + duration, 0);
  const danglePursuitAnimation = manifest ? resolveAnimation(manifest, "dangle_pursuit_run") : undefined;
  const dangleReturnAnimation = manifest ? resolveAnimation(manifest, "dangle_return_walk") : undefined;
  const danglePursuitPlan = createDistanceLockedWalkPlan(220, Number(settings.pursuitPace ?? 108), 1, danglePursuitAnimation?.locomotion ?? DANGLE_PURSUIT_ROOT_MOTION);
  const dangleReturnPlan = createDistanceLockedWalkPlan(220, 100, 1, dangleReturnAnimation?.locomotion ?? DANGLE_RETURN_ROOT_MOTION);
  const danglePhaseDurations = [390, 460, 1_100, 620, 850, danglePursuitPlan.durationMs, dangleReturnPlan.durationMs, 280];
  const danglePreviewDurationMs = danglePhaseDurations.reduce((total, duration) => total + duration, 0);
  const previewDurationMs = selectedAction === "walk_round_trip"
    ? walkPreviewPlan.durationMs
    : selectedAction === "token_snack"
      ? feedPreviewDurationMs
      : selectedAction === "drag_dangle"
        ? danglePreviewDurationMs
      : definition.durationMs;
  const frames = useMemo(
    () => buildPreviewFrames(definition, manifest, fallbackImage, previewDurationMs, selectedAction === "token_snack" ? feedPhaseDurations : selectedAction === "drag_dangle" ? danglePhaseDurations : undefined),
    [definition, danglePreviewDurationMs, fallbackImage, feedPreviewDurationMs, manifest, previewDurationMs, selectedAction],
  );
  const progress = Math.min(1, elapsedMs / Math.max(previewDurationMs, 1));
  const timelineSample = sampleTimeline(frames, elapsedMs);
  const walkSourceCycleDurationMs = walkAnimation?.frames.reduce((total, frame) => total + Math.max(1, frame.durationMs), 0) ?? 1;
  const walkActorTimeMs = elapsedMs * walkSourceCycleDurationMs / Math.max(1, walkPreviewPlan.cycleDurationMs);
  const walkCycleTimeMs = ((walkActorTimeMs % walkSourceCycleDurationMs) + walkSourceCycleDurationMs) % walkSourceCycleDurationMs;
  const walkFrame = frames.find((frame) => walkCycleTimeMs < frame.sourceStartMs + frame.sourceDurationMs) ?? frames[0];
  const sampledBase = selectedAction === "walk_round_trip"
    ? {
      frame: walkFrame,
      phaseProgress: Math.min(1, Math.max(0, (walkCycleTimeMs - walkFrame.sourceStartMs) / Math.max(1, walkFrame.sourceDurationMs))),
      actorTimeMs: walkActorTimeMs,
    }
    : timelineSample;
  const sampledAnimation = manifest ? resolveAnimation(manifest, sampledBase.frame.actorActionId) : undefined;
  const sampledAnimationDurationMs = sampledAnimation?.frames.reduce((total, frame) => total + Math.max(1, frame.durationMs), 0) ?? sampledBase.frame.sourceDurationMs;
  const sampledPhaseElapsedMs = Math.max(0, elapsedMs - sampledBase.frame.startMs);
  const sampled = selectedAction === "token_snack"
    ? {
      ...sampledBase,
      actorTimeMs: sampledBase.frame.actorActionId === "feed_snack_walk_slow"
        ? sampledPhaseElapsedMs * sampledAnimationDurationMs / Math.max(1, feedWalkPlan.cycleDurationMs)
        : sampledBase.frame.actorActionId === "feed_snack_return_run"
          ? sampledPhaseElapsedMs * sampledAnimationDurationMs / Math.max(1, feedReturnPlan.cycleDurationMs)
          : sampledBase.frame.actorActionId === "feed_snack_lick"
            ? sampledPhaseElapsedMs % Math.max(1, sampledAnimationDurationMs)
            : Math.min(sampledPhaseElapsedMs, Math.max(0, sampledAnimationDurationMs - 1)),
    }
    : selectedAction === "drag_dangle"
      ? {
        ...sampledBase,
        actorTimeMs: sampledBase.frame.actorActionId === "dangle_pursuit_run"
          ? sampledPhaseElapsedMs * sampledAnimationDurationMs / Math.max(1, danglePursuitPlan.cycleDurationMs)
          : sampledBase.frame.actorActionId === "dangle_return_walk"
            ? sampledPhaseElapsedMs * sampledAnimationDurationMs / Math.max(1, dangleReturnPlan.cycleDurationMs)
            : Math.min(sampledPhaseElapsedMs, Math.max(0, sampledAnimationDurationMs - 1)),
      }
      : sampledBase;
  const walkRootProgress = selectedAction === "walk_round_trip" ? distanceLockedWalkProgressAtTime(walkPreviewPlan, elapsedMs) : progress;
  const baseStage = stageSample(selectedAction, progress, walkRootProgress);
  const feedActorAction = sampled.frame.actorActionId;
  const feedHomeX = -25;
  const feedTargetX = 20;
  const feedTravelProgress = feedActorAction === "feed_snack_walk_slow"
    ? distanceLockedWalkProgressAtTime(feedWalkPlan, sampledPhaseElapsedMs)
    : feedActorAction === "feed_snack_return_run"
      ? distanceLockedWalkProgressAtTime(feedReturnPlan, sampledPhaseElapsedMs)
      : feedActorAction === "feed_snack_stretch" || feedActorAction === "feed_snack_settle" ? 0 : 1;
  const stage = selectedAction === "token_snack"
    ? {
      actorX: feedActorAction === "feed_snack_return_run"
        ? feedTargetX + (feedHomeX - feedTargetX) * feedTravelProgress
        : feedHomeX + (feedTargetX - feedHomeX) * feedTravelProgress,
      actorY: 0,
      propX: 70,
      propY: 73,
      cursorX: 70,
      cursorY: 73,
    }
    : selectedAction === "drag_dangle"
      ? (() => {
        const action = sampled.frame.actorActionId;
        const homeX = -24;
        const catchX = 5;
        const chaseX = 26;
        const pounceProgress = action === "dangle_pounce" ? sampled.phaseProgress : ["dangle_play", "dangle_pursuit_run", "dangle_return_walk", "dangle_settle"].includes(action) ? 1 : 0;
        const pursuitProgress = action === "dangle_pursuit_run" ? distanceLockedWalkProgressAtTime(danglePursuitPlan, sampledPhaseElapsedMs) : action === "dangle_return_walk" || action === "dangle_settle" ? 1 : 0;
        const returnProgress = action === "dangle_return_walk" ? distanceLockedWalkProgressAtTime(dangleReturnPlan, sampledPhaseElapsedMs) : action === "dangle_settle" ? 1 : 0;
        const actorX = action === "dangle_return_walk" || action === "dangle_settle"
          ? chaseX + (homeX - chaseX) * returnProgress
          : homeX + (catchX - homeX) * pounceProgress + (chaseX - catchX) * pursuitProgress;
        return { ...baseStage, actorX, actorY: action === "dangle_pounce" ? -Math.sin(sampled.phaseProgress * Math.PI) * 6 : 0 };
      })()
      : baseStage;
  const actorPreviewAppearance = {
    ...props.appearance,
    size: selectedAction === "walk_round_trip" ? .78 : Math.min(1.08, Math.max(.9, props.appearance.size)),
    tokenBubbleId: "hidden" as const,
    moodBadge: { ...props.appearance.moodBadge, showMood: false },
    accessorySettings: { ...props.appearance.accessorySettings, tokenFrameId: "hidden" as const },
  };
  const cursorTarget = {
    x: Math.min(1, Math.max(-1, (stage.cursorX - 50) / 31)),
    y: Math.min(1, Math.max(-1, (stage.cursorY - 45) / 18)),
  };
  const cursorCascade = elapsedMs % 1_800 / 1_800;
  const headFactor = Math.min(1, Math.max(0, (cursorCascade - .14) / .3));
  const earFactor = Math.min(1, Math.max(0, (cursorCascade - .46) / .34));
  const cursorPreviewTracking: CursorTrackingVisual | undefined = selectedAction === "play_cursor" ? {
    eyeOffset: cursorTarget,
    headOffset: { x: cursorTarget.x * headFactor, y: cursorTarget.y * headFactor },
    earOffset: { x: cursorTarget.x * headFactor * earFactor, y: cursorTarget.y * headFactor * earFactor },
    headAngleDegrees: cursorTarget.x * Number(settings.maxHeadTurnAngle ?? 28) * headFactor,
    withinAttention: true,
    earFollow: settings.earFollow !== false,
    stage: elapsedMs >= previewDurationMs - 350 ? "settle" : "tracking",
  } : undefined;

  useEffect(() => {
    setElapsedMs(0);
    setPlaying(previewAvailable);
    lastTickRef.current = null;
  }, [previewAvailable, selectedAction]);

  useEffect(() => {
    if (!playing || !previewAvailable) return;
    let raf = 0;
    const tick = (now: number) => {
      const last = lastTickRef.current ?? now;
      lastTickRef.current = now;
      setElapsedMs((current) => {
        const next = current + Math.min(80, now - last);
        if (next < previewDurationMs) return next;
        if (loopPreview) return next % previewDurationMs;
        setPlaying(false);
        return previewDurationMs;
      });
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(raf);
      lastTickRef.current = null;
    };
  }, [loopPreview, playing, previewAvailable, previewDurationMs]);

  const updateSetting = (key: string, value: PetActionTuningValue) => {
    props.patch({
      actionSettings: {
        schemaVersion: 1,
        byAction: {
          ...props.story.actionSettings.byAction,
          [selectedAction]: { ...savedSettings, [key]: value },
        },
      },
    });
  };

  const resetSelectedAction = () => {
    const nextByAction = { ...props.story.actionSettings.byAction };
    delete nextByAction[selectedAction];
    props.patch({ actionSettings: { schemaVersion: 1, byAction: nextByAction } });
    setElapsedMs(0);
    setPlaying(previewAvailable);
  };

  const propScale = selectedAction === "token_snack" ? Number(settings.snackSize ?? 100) / 100 : 1;
  const yarnColor = String(settings.yarnColor ?? "orange");
  const showProp = selectedAction !== "walk_round_trip"
    && !(selectedAction === "nap_here" && settings.zEffect === false)
    && !(selectedAction === "wake_up" && settings.wakeSparkle === false);

  return (
    <div className="story-page actions-workbench-page" data-pet-page="actions" data-selected-action={selectedAction}>
      <section className="action-selector" data-action-selector aria-label="Action previews">
        {actionsPreviewIds.map((actionId) => {
          const item = actionDefinitions[actionId];
          const itemCapability = capabilityFor(props.appearance.catTypeId, actionId);
          const disabled = itemCapability.status === "planned" || itemCapability.status === "unavailable";
          return (
            <button key={actionId} className={selectedAction === actionId ? "selected" : ""} type="button" data-action-id={actionId} aria-pressed={selectedAction === actionId} disabled={disabled} title={disabled ? itemCapability.reason : item.contract} onClick={() => setSelectedAction(actionId)}>
              <img src={item.icon} alt="" draggable={false} aria-hidden="true" />
              <strong>{item.label}</strong>
              {selectedAction === actionId ? <i aria-hidden="true">✓</i> : null}
              {disabled ? <small>Planned</small> : null}
            </button>
          );
        })}
      </section>

      <div className="actions-workspace">
        <section className="action-preview-card" data-action-preview>
          <header className="action-preview-header">
            <h2>Action Preview</h2>
            <span data-preview-only>Preview only</span>
          </header>
          <div
            className={`action-preview-stage action-preview-${selectedAction}`}
            data-action-preview-stage
            data-preview-coordinate-system="normalized-100x100"
            data-preview-walk-root-progress={selectedAction === "walk_round_trip" ? walkRootProgress.toFixed(4) : undefined}
            data-preview-walk-cycle-ms={selectedAction === "walk_round_trip" ? walkPreviewPlan.cycleDurationMs : undefined}
            data-preview-walk-distance-px={selectedAction === "walk_round_trip" ? walkPreviewPlan.distancePx : undefined}
            data-preview-feed-phase={selectedAction === "token_snack" ? sampled.frame.actorActionId : undefined}
            data-preview-feed-root-progress={selectedAction === "token_snack" ? feedTravelProgress.toFixed(4) : undefined}
            data-preview-cursor-contract={selectedAction === "play_cursor" ? "offline-eyes-head-ears" : undefined}
            data-preview-dangle-phase={selectedAction === "drag_dangle" ? sampled.frame.actorActionId : undefined}
            data-preview-dangle-contract={selectedAction === "drag_dangle" ? "offline-phases-distance-locked" : undefined}
          >
            <svg className="action-preview-route" viewBox="0 0 100 50" preserveAspectRatio="none" aria-hidden="true">
              <path d={selectedAction === "summon_to_pointer" ? "M12 38 C35 12 62 45 86 18" : selectedAction === "walk_round_trip" ? "M16 36 L84 36" : "M18 38 C35 34 44 44 62 35"} />
            </svg>
            <span className="action-preview-home" style={{ left: "16%", top: "69%" }} aria-hidden="true">⌂</span>
            <span className="action-preview-destination" style={{ left: `${stage.cursorX}%`, top: `${stage.cursorY}%` }} aria-hidden="true">⌖</span>
            <div className="action-preview-actor" style={{ "--actor-preview-x": `${stage.actorX}%`, "--actor-preview-y": `${stage.actorY}%` } as CSSProperties}>
              <PetAppearanceVisual appearance={actorPreviewAppearance} usage={props.usage} storyActionId={sampled.frame.actorActionId} facing={selectedAction === "walk_round_trip" ? "right" : selectedAction === "token_snack" && feedActorAction === "feed_snack_return_run" ? "left" : selectedAction === "drag_dangle" && sampled.frame.actorActionId === "dangle_return_walk" ? "left" : selectedAction === "drag_dangle" ? "right" : undefined} previewTimeMs={selectedAction === "play_cursor" ? elapsedMs : sampled.actorTimeMs} cursorTracking={cursorPreviewTracking} reduceMotion={false} surface="preview" />
            </div>
            {showProp ? (
              <span className={`action-preview-prop action-preview-prop-${selectedAction} yarn-${yarnColor}`} data-preview-prop={definition.propLabel} style={{ left: `${stage.propX}%`, top: `${stage.propY}%`, "--prop-scale": propScale } as CSSProperties} aria-label={definition.propLabel}>
                {selectedAction === "token_snack"
                  ? <img src={`pet-actors/golden-british/props/snack-${String(settings.snackStyle ?? "paw")}.png`} alt="" draggable={false} />
                  : selectedAction === "drag_dangle"
                    ? <img src={`pet-actors/golden-british/props/dangle-fish-${String(settings.fishToyStyle ?? "mint")}.png`} alt="" draggable={false} />
                  : definition.propMark}
              </span>
            ) : null}
            {selectedAction === "drag_dangle" ? (
              <>
                <svg className="action-preview-dangle-cord" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d={`M ${stage.cursorX - 8.1} ${stage.cursorY - 11.7} Q ${(stage.cursorX + stage.propX) / 2 - 4} ${(stage.cursorY + stage.propY) / 2 + 7} ${stage.propX} ${stage.propY}`} /></svg>
                <span className="action-preview-dangle-wand" style={{ left: `${stage.cursorX}%`, top: `${stage.cursorY}%` }} aria-hidden="true"><img src="pet-actors/golden-british/props/dangle-wand.png" alt="" draggable={false} /></span>
              </>
            ) : null}
            {["play_cursor", "summon_to_pointer"].includes(selectedAction) ? <span className="action-virtual-pointer" data-virtual-pointer style={{ left: `${stage.cursorX}%`, top: `${stage.cursorY}%` }} aria-hidden="true">➤</span> : null}
            <span className="action-preview-coordinate-readout">sandbox x {Math.round(stage.actorX + 50)} · y {Math.round(stage.actorY + 50)}</span>
            {!previewAvailable ? <div className="action-preview-unavailable"><strong>Approved still only</strong><small>{capability.reason}</small></div> : null}
          </div>

          <div className="action-filmstrip" data-action-filmstrip>
            {frames.map((frame, index) => (
              <button key={frame.id} className={sampled.frame.id === frame.id ? "active" : ""} type="button" data-action-keyframe data-phase-id={frame.id} onClick={() => {
                const seekMs = selectedAction === "walk_round_trip"
                  ? frame.sourceStartMs * walkPreviewPlan.cycleDurationMs / Math.max(1, walkSourceCycleDurationMs)
                  : frame.startMs;
                setElapsedMs(seekMs);
                setPlaying(false);
              }}>
                <span>{index + 1}</span><img src={frame.src} alt="" draggable={false} aria-hidden="true" /><strong>{frame.label}</strong>
              </button>
            ))}
          </div>

          <input className="action-scrubber" data-action-scrubber type="range" min="0" max={previewDurationMs} step="10" value={Math.min(elapsedMs, previewDurationMs)} aria-label="Preview timeline" onChange={(event) => { setPlaying(false); setElapsedMs(Number(event.target.value)); }} />
          <div className="action-transport">
            <button className="action-play-button" data-action-play type="button" aria-label={playing ? "Pause preview" : "Play preview"} onClick={() => {
              if (elapsedMs >= previewDurationMs) setElapsedMs(0);
              setPlaying((value) => !value);
            }}>{playing ? "Ⅱ" : "▶"}</button>
            <button className="action-restart-button" data-action-restart type="button" aria-label="Restart preview" onClick={() => { setElapsedMs(0); setPlaying(previewAvailable); }}>↻</button>
            <span>{Math.round(elapsedMs / 100) / 10}s / {Math.round(previewDurationMs / 100) / 10}s</span>
            <button className="action-loop-toggle" data-action-loop type="button" role="switch" aria-checked={loopPreview} onClick={() => setLoopPreview((value) => !value)}><strong>Loop preview</strong><i className={`pet-switch ${loopPreview ? "on" : ""}`} /></button>
          </div>
        </section>

        <aside className="action-settings-card" data-action-settings data-action-settings-for={selectedAction}>
          <header><h2>{definition.label} settings</h2><p>Applies to future plays.</p></header>
          <div className="action-settings-fields">
            {definition.settings.map((setting) => {
              const value = settings[setting.key] ?? setting.defaultValue;
              if (setting.type === "choices") return <ChoiceSetting key={setting.key} definition={setting} value={String(value)} onChange={(next) => updateSetting(setting.key, next)} />;
              if (setting.type === "range") return <RangeSetting key={setting.key} definition={setting} value={Number(value)} onChange={(next) => updateSetting(setting.key, next)} />;
              return <ToggleSetting key={setting.key} definition={setting} value={Boolean(value)} onChange={(next) => updateSetting(setting.key, next)} />;
            })}
          </div>
          <div className="action-contract-strip"><span aria-hidden="true">♙</span><strong>{definition.contract}</strong></div>
          <button className="action-reset-button" data-reset-action type="button" onClick={resetSelectedAction}><span aria-hidden="true">↻</span>Reset action</button>
        </aside>
      </div>

      <footer className="action-preview-footer" data-actions-footer><i />Preview changes apply instantly. Your desktop pet stays still.</footer>
    </div>
  );
}
