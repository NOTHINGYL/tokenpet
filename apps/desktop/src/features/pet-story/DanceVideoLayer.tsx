import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";

const DANCE_VIDEO_SOURCE = "pet-video/dance-golden-style.webm";
const DANCE_VIDEO_DURATION_SECONDS = 10.133;

function boundedSeconds(milliseconds: number) {
  return Math.min(DANCE_VIDEO_DURATION_SECONDS - .001, Math.max(0, milliseconds / 1_000));
}

export function DanceVideoLayer(props: {
  active: boolean;
  playing: boolean;
  startedAtMs?: number;
  sourceTimeMs?: number;
  scale?: number;
  surface: "desktop" | "preview";
  onReadyChange?: (ready: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sourceTimeRef = useRef(props.sourceTimeMs ?? 0);
  const playingRef = useRef(props.playing);

  useEffect(() => {
    sourceTimeRef.current = props.sourceTimeMs ?? 0;
  }, [props.sourceTimeMs]);

  useEffect(() => {
    playingRef.current = props.playing;
    const video = videoRef.current;
    if (!video || !props.active) return;
    if (props.playing) void video.play().catch(() => undefined);
    else video.pause();
  }, [props.active, props.playing]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !props.active) {
      props.onReadyChange?.(false);
      return;
    }

    let disposed = false;
    let ready = false;
    const desiredTime = () => boundedSeconds(
      props.startedAtMs === undefined
        ? sourceTimeRef.current
        : Date.now() - props.startedAtMs,
    );
    const synchronize = (force = false) => {
      if (disposed || video.readyState < HTMLMediaElement.HAVE_METADATA) return;
      const target = desiredTime();
      if (force || Math.abs(video.currentTime - target) > .1) video.currentTime = target;
      if (playingRef.current) {
        if (video.paused) void video.play().catch(() => undefined);
      } else if (!video.paused) {
        video.pause();
      }
      if (!ready && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        ready = true;
        props.onReadyChange?.(true);
      }
    };
    const handleLoaded = () => synchronize(true);
    const handleCanPlay = () => synchronize();
    const handleError = () => {
      ready = false;
      props.onReadyChange?.(false);
    };

    props.onReadyChange?.(false);
    video.addEventListener("loadedmetadata", handleLoaded);
    video.addEventListener("loadeddata", handleCanPlay);
    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("error", handleError);
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) synchronize(true);
    else video.load();
    const syncTimer = window.setInterval(() => synchronize(), 100);

    return () => {
      disposed = true;
      window.clearInterval(syncTimer);
      video.removeEventListener("loadedmetadata", handleLoaded);
      video.removeEventListener("loadeddata", handleCanPlay);
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("error", handleError);
      video.pause();
      props.onReadyChange?.(false);
    };
  }, [props.active, props.onReadyChange, props.startedAtMs]);

  if (!props.active) return null;
  return (
    <div
      className={`dance-video-layer dance-video-layer-${props.surface}`}
      data-dance-video-layer
      data-dance-video-source={DANCE_VIDEO_SOURCE}
      data-dance-video-audio="separate-detected-loop-reference"
      data-dance-video-scale={props.scale ?? 1}
      style={{ "--dance-video-scale": String(props.scale ?? 1) } as CSSProperties}
      aria-hidden="true"
    >
      <video
        ref={videoRef}
        className="dance-video"
        src={DANCE_VIDEO_SOURCE}
        muted
        playsInline
        preload="auto"
        disablePictureInPicture
      />
    </div>
  );
}
