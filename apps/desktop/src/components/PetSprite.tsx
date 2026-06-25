import { useEffect, useMemo, useState } from "react";
import { petAnimations, type PetAction } from "./petAnimations";

export function PetSprite(props: { action: PetAction; className?: string; onActionComplete?: (action: PetAction) => void }) {
  const { action, className, onActionComplete } = props;
  const animation = petAnimations[action];
  const [frameIndex, setFrameIndex] = useState(0);
  const frameDuration = useMemo(() => Math.round(1000 / animation.fps), [animation.fps]);

  useEffect(() => {
    setFrameIndex(0);
  }, [animation.id]);

  useEffect(() => {
    if (!animation.loop && frameIndex === animation.frames.length - 1) {
      const timer = window.setTimeout(() => onActionComplete?.(animation.id), frameDuration);
      return () => window.clearTimeout(timer);
    }

    const timer = window.setTimeout(() => {
      setFrameIndex((currentFrame) => {
        const nextFrame = currentFrame + 1;

        if (nextFrame < animation.frames.length) {
          return nextFrame;
        }

        if (animation.loop) {
          return 0;
        }

        return currentFrame;
      });
    }, frameDuration);

    return () => window.clearTimeout(timer);
  }, [animation, frameDuration, frameIndex, onActionComplete]);

  return (
    <img
      className={`cat-image cat-image-desktop pet-sprite pet-sprite-${animation.id} ${className ?? ""}`}
      src={animation.frames[frameIndex]}
      alt=""
      draggable={false}
      aria-hidden="true"
    />
  );
}
