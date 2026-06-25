export type PetAction = "idle" | "blinkLook" | "wave";

export type PetAnimation = {
  id: PetAction;
  frames: string[];
  fps: number;
  loop: boolean;
  priority: number;
};

const actionBase = "assets/pets/actions/gold-cat";

function numberedFrames(prefix: string, count: number) {
  return Array.from({ length: count }, (_value, index) => `${actionBase}/${prefix}-${String(index + 1).padStart(2, "0")}.png`);
}

export const petAnimations: Record<PetAction, PetAnimation> = {
  idle: {
    id: "idle",
    frames: numberedFrames("idle", 4),
    fps: 5,
    loop: true,
    priority: 0,
  },
  blinkLook: {
    id: "blinkLook",
    frames: numberedFrames("blink-look", 5),
    fps: 11,
    loop: false,
    priority: 1,
  },
  wave: {
    id: "wave",
    frames: numberedFrames("wave", 8),
    fps: 12,
    loop: false,
    priority: 2,
  },
};
