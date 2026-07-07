import type { MotionActionId, MotionModeId } from "../../types";

const actorFrame = (name: string) => `pet-actors/golden-british/frames/${name}.svg`;

export type MotionModeOption = {
  id: MotionModeId;
  label: string;
  icon: "mode-calm" | "mode-balanced" | "mode-playful" | "mode-energetic";
};

export type MotionActionOption = {
  id: MotionActionId;
  label: string;
  detail: string;
  image: string;
};

export const motionModes: MotionModeOption[] = [
  { id: "calm", label: "Calm", icon: "mode-calm" },
  { id: "balanced", label: "Balanced", icon: "mode-balanced" },
  { id: "playful", label: "Playful", icon: "mode-playful" },
  { id: "energetic", label: "Energetic", icon: "mode-energetic" },
];

export const motionActions: MotionActionOption[] = [
  {
    id: "idle-breathe",
    label: "Idle breathe",
    detail: "Soft breathing loop",
    image: actorFrame("idle-breathe"),
  },
  {
    id: "tail-wag",
    label: "Tail wag",
    detail: "Small happy sway",
    image: actorFrame("tail-wag"),
  },
  {
    id: "blink",
    label: "Blink",
    detail: "Gentle eye blink",
    image: actorFrame("blink"),
  },
  {
    id: "stretch",
    label: "Stretch",
    detail: "Wake up stretch",
    image: actorFrame("stretch"),
  },
  {
    id: "run-across",
    label: "Run across screen",
    detail: "Sprint with dust",
    image: actorFrame("run-across"),
  },
  {
    id: "jump",
    label: "Jump",
    detail: "Cross a small gap",
    image: actorFrame("jump"),
  },
  {
    id: "desk-nap",
    label: "Desk nap",
    detail: "Sleepy desk pause",
    image: actorFrame("desk-nap"),
  },
  {
    id: "celebrate",
    label: "Celebrate",
    detail: "Milestone cheer",
    image: actorFrame("celebrate"),
  },
  {
    id: "pounce-cursor",
    label: "Pounce cursor",
    detail: "Play with pointer",
    image: actorFrame("pounce-cursor"),
  },
  {
    id: "edge-peek",
    label: "Edge peek",
    detail: "Peek from screen edge",
    image: actorFrame("edge-peek"),
  },
];

export const motionActionLabels = motionActions.reduce(
  (labels, action) => ({
    ...labels,
    [action.id]: action.label,
  }),
  {} as Record<MotionActionId, string>,
);
