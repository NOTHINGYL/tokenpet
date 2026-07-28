import { useEffect, useMemo, useRef, useState } from "react";
import { createPetActorFrame } from "./actorFrame";
import { loadPetActorImages, renderPetActorCanvas } from "./actorCanvasRenderer";
import type { PetActorProps } from "./actorTypes";

export function PetActorCanvas(props: PetActorProps) {
  const frame = useMemo(
    () =>
      createPetActorFrame({
        appearance: props.appearance,
        usage: props.usage,
        tokenValue: props.tokenValue,
        moodId: props.moodId,
        moodBadgeVisible: props.moodBadgeVisible,
        moodBadgeColor: props.moodBadgeColor,
        moodBadgeStyle: props.moodBadgeStyle,
        moodBadgePulse: props.moodBadgePulse,
        surface: props.surface,
      }),
    [props.appearance, props.usage, props.tokenValue, props.moodId, props.moodBadgeVisible, props.moodBadgeColor, props.moodBadgeStyle, props.moodBadgePulse, props.surface],
  );
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hoverRef = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let animationFrame = 0;
    let images: Awaited<ReturnType<typeof loadPetActorImages>> | null = null;

    async function prepare() {
      setReady(false);
      images = await loadPetActorImages(frame);
      if (cancelled) return;
      setReady(true);

      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context) return;

      const startedAt = performance.now();
      const draw = (time: number) => {
        renderPetActorCanvas(context, frame, images!, Math.max(0, time - startedAt), { hover: hoverRef.current });
        animationFrame = window.requestAnimationFrame(draw);
      };

      animationFrame = window.requestAnimationFrame(draw);
    }

    void prepare();

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
    };
  }, [frame]);

  return (
    <div
      className={frame.className}
      style={frame.styleVars as React.CSSProperties}
      data-mood-badge-icon={frame.moodBadge ? props.moodId : undefined}
      data-mood-badge-color={frame.moodBadge ? props.moodBadgeColor : undefined}
      data-mood-badge-style={frame.moodBadge?.style}
      data-mood-badge-pulse={frame.moodBadge?.entryPulse ? "true" : "false"}
      data-token-label={frame.tokenFrame?.label}
    >
      <span
        className={`pet-visual-cat-wrap pet-actor-canvas-root ${ready ? "is-ready" : "is-loading"}`}
        onPointerEnter={() => {
          hoverRef.current = true;
        }}
        onPointerLeave={() => {
          hoverRef.current = false;
        }}
      >
        <canvas
          ref={canvasRef}
          className="pet-actor-canvas"
          width={frame.model.canvas.width}
          height={frame.model.canvas.height}
          aria-hidden="true"
        />
        {frame.hitAreas.token ? (
          <button className="pet-actor-token-hotspot" type="button" onClick={props.onBubbleClick} aria-label="Open TokenPet summary" />
        ) : null}
      </span>
    </div>
  );
}
