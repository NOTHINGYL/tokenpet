import type { MoodLookId, PetAppearanceSettings, UsageSnapshot } from "../../types";
import { getEffectiveTokenBubbleId, getMoodLabel, moodToneClass, shouldShowMoodBadge } from "../pet-appearance/appearanceView";
import { canonicalPetActor } from "./canonicalActor";
import { getCatSkin } from "./catSkins";
import type { ActorMoodBadge, ActorRenderAttachment, ActorTokenFrame, PetActorFrame, PetMotionState, PetSurface, Rect } from "./actorTypes";
import { getActorTokenLabel, resolveActorOutfit } from "./outfitResolver";
import { getWearableKits } from "./wearableKits";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getRenderScale(surface: PetSurface, userSize: number) {
  if (surface === "desktop") return userSize;
  return clamp(userSize, 0.72, 1.14);
}

function pxRect(rect: Rect): Rect {
  const canvas = canonicalPetActor.canvas;
  return {
    x: rect.x * canvas.width,
    y: rect.y * canvas.height,
    width: rect.width * canvas.width,
    height: rect.height * canvas.height,
  };
}

function resolveMotionState(moodId: MoodLookId): PetMotionState {
  if (moodId === "sleepy") return "sleepy";
  if (moodId === "hot") return "hot";
  if (moodId === "overdrive") return "overdrive";
  return "focused";
}

function resolveTokenFrame(appearance: PetAppearanceSettings, usage: UsageSnapshot, tokenMode: ActorTokenFrame["mode"], skin: ReturnType<typeof getCatSkin>): ActorTokenFrame | null {
  const tokenBubbleId = getEffectiveTokenBubbleId(appearance);
  if (tokenMode === "hidden") return null;

  const label = getActorTokenLabel(appearance, usage);
  if (!label) return null;

  const compact = tokenBubbleId === "compact";
  const cost = tokenBubbleId === "cost";
  const fontSize = tokenMode === "embedded" ? 92 : cost ? 46 : compact ? 52 : 72;

  if (tokenMode === "embedded") {
    const tokenBounds = skin.bounds.tokenFrame ? pxRect(skin.bounds.tokenFrame) : canonicalPetActor.tokenFrameBounds ?? { x: 330, y: 684, width: 364, height: 112 };
    return {
      mode: tokenMode,
      tokenBubbleId,
      label,
      rect: tokenBounds,
      textOnly: true,
      fontSize,
    };
  }

  const baseWidth = cost ? 380 : compact ? 250 : 330;
  const baseHeight = compact ? 88 : 116;
  const y = tokenMode === "floating" ? canonicalPetActor.bodyBounds.y + 310 : canonicalPetActor.footLineY + 42;
  const x = tokenMode === "floating" ? canonicalPetActor.bodyBounds.x + canonicalPetActor.bodyBounds.width + 82 : 512;

  return {
    mode: tokenMode,
    tokenBubbleId,
    label,
    rect: {
      x: x - baseWidth / 2,
      y: y - baseHeight / 2,
      width: baseWidth,
      height: baseHeight,
    },
    textOnly: false,
    fontSize,
  };
}

function resolveMoodBadge(appearance: PetAppearanceSettings, moodId: MoodLookId, raised: boolean): ActorMoodBadge | null {
  if (!shouldShowMoodBadge(appearance, moodId)) return null;
  const width = 198;
  const height = 70;
  return {
    label: getMoodLabel(moodId),
    tone: moodId,
    rect: {
      x: 512 - width / 2,
      y: raised ? 72 : 112,
      width,
      height,
    },
  };
}

function resolveAttachments(appearance: PetAppearanceSettings, skin: ReturnType<typeof getCatSkin>, outfit: ReturnType<typeof resolveActorOutfit>) {
  return getWearableKits(appearance, skin, outfit).flatMap((kit) =>
    kit.attachments.map(
      (attachment): ActorRenderAttachment => ({
        ...attachment,
        id: `${kit.id}-${attachment.slot}`,
        accessoryId: kit.id,
        category: kit.category,
      }),
    ),
  );
}

export function createPetActorFrame(props: {
  appearance: PetAppearanceSettings;
  usage: UsageSnapshot;
  moodId?: MoodLookId;
  surface: PetSurface;
}): PetActorFrame {
  const moodId = props.moodId ?? props.appearance.moodId;
  const skin = getCatSkin(props.appearance.catTypeId);
  const outfit = resolveActorOutfit(props.appearance, skin);
  const tokenFrame = resolveTokenFrame(props.appearance, props.usage, outfit.tokenMode, skin);
  const moodBadge = resolveMoodBadge(props.appearance, moodId, outfit.moodBadgeRaised);
  const renderScale = getRenderScale(props.surface, props.appearance.size);

  return {
    model: canonicalPetActor,
    skin,
    surface: props.surface,
    moodId,
    motionState: resolveMotionState(moodId),
    appearance: props.appearance,
    className: `pet-appearance-visual pet-actor-canvas-shell pet-appearance-visual-${props.surface} pet-theme-${props.appearance.themeId} pet-mood-${
      moodToneClass[moodId]
    } ${props.appearance.moodBadge.colorByState ? "pet-mood-color-state" : ""} pet-cat-${skin.id} pet-body-${skin.bodyType} pet-token-${tokenFrame?.mode ?? "hidden"} pet-bubble-${getEffectiveTokenBubbleId(
      props.appearance,
    )}`,
    styleVars: {
      "--pet-visual-scale": renderScale.toString(),
      "--pet-visual-opacity": props.appearance.opacity.toString(),
      "--pet-visual-shadow": props.appearance.shadow.toString(),
      "--pet-actor-token-x": tokenFrame ? `${((tokenFrame.rect.x + tokenFrame.rect.width / 2) / canonicalPetActor.canvas.width) * 100}%` : "50%",
      "--pet-actor-token-y": tokenFrame ? `${((tokenFrame.rect.y + tokenFrame.rect.height / 2) / canonicalPetActor.canvas.height) * 100}%` : "78%",
      "--pet-actor-token-w": tokenFrame ? `${(tokenFrame.rect.width / canonicalPetActor.canvas.width) * 100}%` : "0%",
      "--pet-actor-token-h": tokenFrame ? `${(tokenFrame.rect.height / canonicalPetActor.canvas.height) * 100}%` : "0%",
    },
    renderScale,
    tokenFrame,
    moodBadge,
    attachments: resolveAttachments(props.appearance, skin, outfit),
    hitAreas: {
      token: tokenFrame?.mode === "hidden" ? undefined : tokenFrame?.rect,
    },
  };
}
