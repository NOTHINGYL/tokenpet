import type { MotionActionId, MotionModeId } from "../../types";

const actorThumbnail = (name: string) => `pet-actors/golden-british/thumbnails/${name}.svg`;

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
    image: actorThumbnail("idle-breathe"),
  },
  {
    id: "tail-wag",
    label: "Tail wag",
    detail: "Small happy sway",
    image: actorThumbnail("tail-wag"),
  },
  {
    id: "blink",
    label: "Blink",
    detail: "Gentle eye blink",
    image: actorThumbnail("blink"),
  },
  {
    id: "stretch",
    label: "Stretch",
    detail: "Wake up stretch",
    image: actorThumbnail("stretch"),
  },
  {
    id: "run-across",
    label: "Run across screen",
    detail: "Sprint with dust",
    image: actorThumbnail("run-across"),
  },
  {
    id: "jump",
    label: "Jump",
    detail: "Cross a small gap",
    image: actorThumbnail("jump"),
  },
  {
    id: "desk-nap",
    label: "Desk nap",
    detail: "Sleepy desk pause",
    image: actorThumbnail("desk-nap"),
  },
  {
    id: "celebrate",
    label: "Celebrate",
    detail: "Milestone cheer",
    image: actorThumbnail("celebrate"),
  },
  {
    id: "pounce-cursor",
    label: "Pounce cursor",
    detail: "Play with pointer",
    image: actorThumbnail("pounce-cursor"),
  },
  {
    id: "edge-peek",
    label: "Edge peek",
    detail: "Peek from screen edge",
    image: actorThumbnail("edge-peek"),
  },
];

export const motionActionLabels = motionActions.reduce(
  (labels, action) => ({
    ...labels,
    [action.id]: action.label,
  }),
  {} as Record<MotionActionId, string>,
);
