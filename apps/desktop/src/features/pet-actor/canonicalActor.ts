import type { PetActorModel } from "./actorTypes";

export const canonicalPetActor: PetActorModel = {
  canvas: { width: 1024, height: 1024 },
  bodyBounds: { x: 194, y: 178, width: 636, height: 540 },
  headBounds: { x: 310, y: 166, width: 404, height: 360 },
  footLineY: 742,
  tokenFrameBounds: { x: 330, y: 684, width: 364, height: 112 },
  bones: ["root", "body", "head", "leftEar", "rightEar", "leftPaw", "rightPaw", "tail", "tokenFrame"],
  slots: [
    "baseBack",
    "bodyBack",
    "neckBack",
    "catBody",
    "headBack",
    "earBack",
    "headFront",
    "neckFront",
    "pawFront",
    "tokenFrame",
    "tokenText",
    "moodBadge",
    "effectBack",
    "effectFront",
  ],
};

export const actorSlotOrder = canonicalPetActor.slots;
