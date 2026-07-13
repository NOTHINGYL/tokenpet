import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef, useState } from "react";

type OverlayMode = "snack" | "dangle" | "yarn";
type OverlayPhase = "placing" | "playing" | "rolling" | "finishing";

type OverlayState = {
  mode?: OverlayMode;
  phase?: OverlayPhase;
  enabled?: boolean;
  hint?: string;
  targetScreenX?: number;
  targetScreenY?: number;
  pointerScreenX?: number;
  pointerScreenY?: number;
  durationMs?: number;
  snackStyle?: "paw" | "fish" | "token";
  snackSize?: number;
  fishToyStyle?: "mint" | "blue" | "feather";
  swingResponse?: number;
  toyTrailEffect?: boolean;
  yarnColor?: "orange" | "blue" | "violet";
};

type OverlayInput = {
  type: "click" | "cancel" | "reopen";
  screenX: number;
  screenY: number;
  timestamp: number;
  velocityX?: number;
  velocityY?: number;
};

type OverlayBridge = {
  quickPlayOverlayInput?: (input: OverlayInput) => void | Promise<unknown>;
  onQuickPlayOverlayState?: (callback: (state: OverlayState) => void) => (() => void) | void;
};

type PointerPosition = {
  clientX: number;
  clientY: number;
  screenX: number;
  screenY: number;
};

const validModes = new Set<OverlayMode>(["snack", "dangle", "yarn"]);

function initialOverlayState(): OverlayState & Required<Pick<OverlayState, "mode" | "phase" | "enabled">> {
  const search = new URLSearchParams(window.location.search);
  const requestedMode = search.get("mode") as OverlayMode | null;
  const mode = requestedMode && validModes.has(requestedMode) ? requestedMode : "snack";
  const phase = (search.get("phase") as OverlayPhase | null) ?? (mode === "dangle" ? "playing" : "placing");
  return {
    mode,
    phase,
    enabled: search.get("enabled") !== "false",
    hint: search.get("hint") ?? undefined,
    snackStyle: (search.get("snackStyle") as OverlayState["snackStyle"]) ?? "paw",
    snackSize: Number(search.get("snackSize") ?? 100),
    fishToyStyle: (search.get("fishToyStyle") as OverlayState["fishToyStyle"]) ?? "mint",
    swingResponse: Number(search.get("swingResponse") ?? 66),
    toyTrailEffect: search.get("toyTrailEffect") !== "false",
    yarnColor: (search.get("yarnColor") as OverlayState["yarnColor"]) ?? "orange",
  };
}

function defaultHint(mode: OverlayMode, phase: OverlayPhase) {
  if (phase === "finishing") return "Returning to your companion’s home…";
  if (phase === "rolling") return "Here it comes!";
  if (mode === "snack") return "Click to place the snack · Esc to cancel";
  if (mode === "dangle") return "Move the toy, then click to release · Esc to cancel";
  return "Click to toss the yarn · Esc to cancel";
}

function sendInput(input: OverlayInput) {
  const bridge = window.tokenpet as typeof window.tokenpet & OverlayBridge;
  return bridge.quickPlayOverlayInput?.(input);
}

function SnackIcon({ style }: { style: NonNullable<OverlayState["snackStyle"]> }) {
  return (
    <svg className="quick-overlay-snack-image" viewBox="0 0 112 92" aria-hidden="true">
      <path className="quick-overlay-prop-shadow" d="M15 76c18 10 54 9 80-2" />
      <path className="quick-overlay-prop-fill" d="M14 57c8-5 17-4 25 1l11 6c7 4 14 3 21-2l16-12c5-4 11-2 13 3 2 4 0 9-4 12L75 81c-9 7-22 8-32 3L18 72c-7-3-9-11-4-15Z" />
      <path className="quick-overlay-prop-line" d="M18 59c8-2 14 0 20 4l11 7c8 4 16 3 23-2l17-13M35 70c8 1 13 5 17 11" />
      {style === "paw" ? (
        <g className="quick-overlay-snack-accent">
          <ellipse cx="64" cy="38" rx="13" ry="11" />
          <circle cx="49" cy="29" r="6" /><circle cx="61" cy="21" r="6" /><circle cx="75" cy="24" r="6" />
        </g>
      ) : null}
      {style === "fish" ? (
        <g className="quick-overlay-snack-accent">
          <path d="M43 35c11-14 27-14 39-2-11 13-27 15-39 2Z" />
          <path d="m43 35-12-10v20Z" /><circle className="quick-overlay-cutout" cx="72" cy="32" r="2.6" />
        </g>
      ) : null}
      {style === "token" ? (
        <g className="quick-overlay-snack-accent">
          <circle cx="61" cy="32" r="17" /><path className="quick-overlay-token-mark" d="M52 25h18M61 25v16" />
        </g>
      ) : null}
    </svg>
  );
}

function YarnIcon() {
  return (
    <svg className="quick-overlay-yarn-image" viewBox="0 0 82 68" aria-hidden="true">
      <circle className="quick-overlay-yarn-ball" cx="32" cy="30" r="23" />
      <path className="quick-overlay-yarn-thread" d="M13 19c15 7 29 19 39 34M16 45c17-12 28-23 36-36M10 33c16 1 31 6 43 14M26 8c2 18 10 34 25 47M52 49c12 2 15 13 26 10" />
    </svg>
  );
}

function DangleIcon({ style }: { style: NonNullable<OverlayState["fishToyStyle"]> }) {
  const feather = style === "feather";
  return (
    <svg className="quick-overlay-dangle-image" viewBox="0 0 128 114" aria-hidden="true">
      <path className="quick-overlay-wand" d="M10 15h72" />
      <path className="quick-overlay-cord" d="M80 15c4 21-1 34 8 52" />
      {feather ? (
        <g className="quick-overlay-feather">
          <path d="M88 64c21-4 31 10 19 30-20 4-31-9-19-30Z" />
          <path d="m90 89 18-19M93 83l-9-4M99 78l9 5" />
        </g>
      ) : (
        <g className="quick-overlay-fish">
          <path d="M75 84c13-18 31-18 45-2-13 18-31 19-45 2Z" />
          <path d="m76 84-15-12v24Z" /><circle className="quick-overlay-cutout" cx="110" cy="79" r="2.7" />
        </g>
      )}
    </svg>
  );
}

function SnackProp({ pointer, released, state }: { pointer: PointerPosition; released: boolean; state: OverlayState }) {
  const snackStyle = state.snackStyle ?? "paw";
  return (
    <div className={`quick-overlay-snack-prop snack-${snackStyle} ${released ? "is-released" : ""}`} style={{ left: pointer.clientX, top: pointer.clientY, "--snack-scale": String(Math.max(.7, Math.min(1.3, (state.snackSize ?? 100) / 100))) } as CSSProperties} aria-hidden="true">
      <SnackIcon style={snackStyle} />
    </div>
  );
}

function YarnProp({ pointer, rolling, state }: { pointer: PointerPosition; rolling: boolean; state: OverlayState }) {
  const targetClientX = typeof state.targetScreenX === "number" ? state.targetScreenX - window.screenX : pointer.clientX;
  const targetClientY = typeof state.targetScreenY === "number" ? state.targetScreenY - window.screenY : pointer.clientY;
  const style = {
    left: pointer.clientX,
    top: pointer.clientY,
    "--roll-x": `${targetClientX - pointer.clientX}px`,
    "--roll-y": `${targetClientY - pointer.clientY}px`,
    "--roll-duration": `${Math.max(80, state.durationMs ?? 900)}ms`,
  } as CSSProperties;
  return (
    <div className={`quick-overlay-yarn-prop yarn-${state.yarnColor ?? "orange"} ${rolling ? "is-rolling" : ""}`} style={style} aria-hidden="true">
      <YarnIcon />
    </div>
  );
}

function DangleProp({ pointer, state }: { pointer: PointerPosition; state: OverlayState }) {
  const desiredRef = useRef({ x: pointer.clientX - 88, y: pointer.clientY + 108 });
  const positionRef = useRef({ ...desiredRef.current });
  const velocityRef = useRef({ x: 0, y: 0 });
  const [fish, setFish] = useState(positionRef.current);

  useEffect(() => {
    desiredRef.current = { x: pointer.clientX - 114, y: pointer.clientY + 98 };
  }, [pointer.clientX, pointer.clientY]);

  useEffect(() => {
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const delta = Math.min((now - previous) / 16.667, 2.2);
      previous = now;
      const position = positionRef.current;
      const velocity = velocityRef.current;
      const desired = desiredRef.current;
      const response = Math.max(.45, Math.min(1.55, (state.swingResponse ?? 66) / 66));
      velocity.x = (velocity.x + (desired.x - position.x) * 0.045 * response * delta) * Math.pow(0.82, delta);
      velocity.y = (velocity.y + (desired.y - position.y) * 0.052 * response * delta) * Math.pow(0.82, delta);
      position.x += velocity.x * delta;
      position.y += velocity.y * delta;
      setFish({ ...position });
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [state.swingResponse]);

  const angle = Math.atan2(fish.y - pointer.clientY, fish.x - pointer.clientX) * 180 / Math.PI;
  const style = {
    left: fish.x,
    top: fish.y,
    "--toy-angle": `${angle + 128}deg`,
  } as CSSProperties;

  return (
    <div className={`quick-overlay-dangle-prop fish-${state.fishToyStyle ?? "mint"} ${state.toyTrailEffect ? "has-trail" : ""}`} style={style} aria-hidden="true">
      <DangleIcon style={state.fishToyStyle ?? "mint"} />
    </div>
  );
}

export function QuickPlayOverlayApp() {
  const [state, setState] = useState(initialOverlayState);
  const [submitted, setSubmitted] = useState(false);
  const [pointer, setPointer] = useState<PointerPosition>(() => ({
    clientX: window.innerWidth / 2,
    clientY: window.innerHeight / 2,
    screenX: window.screenX + window.innerWidth / 2,
    screenY: window.screenY + window.innerHeight / 2,
  }));
  const pointerRef = useRef(pointer);
  const priorPointerRef = useRef({ ...pointer, timestamp: performance.now() });
  const velocityRef = useRef({ x: 0, y: 0 });
  const clickTimerRef = useRef<number | null>(null);

  useEffect(() => {
    pointerRef.current = pointer;
  }, [pointer]);

  useEffect(() => {
    const bridge = window.tokenpet as typeof window.tokenpet & OverlayBridge;
    const unsubscribe = bridge.onQuickPlayOverlayState?.((next) => {
      setState((current) => ({ ...current, ...next }));
      if (typeof next.pointerScreenX === "number" && typeof next.pointerScreenY === "number") {
        const globalPointer = {
          clientX: next.pointerScreenX - window.screenX,
          clientY: next.pointerScreenY - window.screenY,
          screenX: next.pointerScreenX,
          screenY: next.pointerScreenY,
        };
        pointerRef.current = globalPointer;
        setPointer(globalPointer);
      }
      if (next.enabled === true && next.phase !== "finishing") setSubmitted(false);
    });
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      const lastPointer = pointerRef.current;
      void sendInput({ type: "cancel", screenX: lastPointer.screenX, screenY: lastPointer.screenY, timestamp: Date.now() });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (clickTimerRef.current !== null) window.clearTimeout(clickTimerRef.current);
    };
  }, []);

  function trackPointer(event: ReactPointerEvent<HTMLElement>) {
    if (submitted && state.mode !== "dangle") return;
    const now = performance.now();
    const previous = priorPointerRef.current;
    const elapsedSeconds = Math.max((now - previous.timestamp) / 1_000, 1 / 240);
    velocityRef.current = { x: (event.screenX - previous.screenX) / elapsedSeconds, y: (event.screenY - previous.screenY) / elapsedSeconds };
    priorPointerRef.current = { clientX: event.clientX, clientY: event.clientY, screenX: event.screenX, screenY: event.screenY, timestamp: now };
    setPointer({ clientX: event.clientX, clientY: event.clientY, screenX: event.screenX, screenY: event.screenY });
  }

  function submit(event: ReactMouseEvent<HTMLElement>) {
    if (!state.enabled || submitted || event.button !== 0) return;
    const nextPointer = { clientX: event.clientX, clientY: event.clientY, screenX: event.screenX, screenY: event.screenY };
    setPointer(nextPointer);
    if (event.detail >= 2) {
      if (clickTimerRef.current !== null) window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      void sendInput({ type: "reopen", screenX: event.screenX, screenY: event.screenY, timestamp: Date.now() });
      return;
    }
    const velocity = { ...velocityRef.current };
    if (clickTimerRef.current !== null) window.clearTimeout(clickTimerRef.current);
    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null;
      setSubmitted(true);
      void sendInput({
        type: "click",
        screenX: nextPointer.screenX,
        screenY: nextPointer.screenY,
        velocityX: velocity.x,
        velocityY: velocity.y,
        timestamp: Date.now(),
      });
    }, 220);
  }

  const phase = state.phase ?? (state.mode === "dangle" ? "playing" : "placing");
  const hint = state.hint ?? defaultHint(state.mode, phase);
  const horizontalMargin = state.mode === "dangle" ? 180 : 150;
  const visualPointer = {
    ...pointer,
    clientX: Math.min(Math.max(pointer.clientX, horizontalMargin), Math.max(horizontalMargin, window.innerWidth - horizontalMargin)),
    clientY: Math.min(Math.max(pointer.clientY, 90), Math.max(90, window.innerHeight - (state.mode === "dangle" ? 210 : 120))),
  };

  return (
    <main
      className={`quick-play-overlay quick-play-overlay-${state.mode} phase-${phase} ${submitted ? "is-submitted" : ""}`}
      data-view="quick-play-overlay"
      data-overlay-mode={state.mode}
      data-overlay-phase={phase}
      aria-label={`${state.mode} Quick Play pointer mode`}
      onPointerMove={trackPointer}
      onClick={submit}
    >
      <div className="quick-overlay-focus-ring" style={{ left: visualPointer.clientX, top: visualPointer.clientY }} aria-hidden="true" />
      {state.mode === "snack" ? <SnackProp pointer={visualPointer} released={submitted || phase === "finishing"} state={state} /> : null}
      {state.mode === "dangle" ? <DangleProp pointer={visualPointer} state={state} /> : null}
      {state.mode === "yarn" ? <YarnProp pointer={visualPointer} rolling={phase === "rolling"} state={state} /> : null}
      <div className="quick-overlay-hint" style={{ left: visualPointer.clientX, top: visualPointer.clientY }} role="status">{hint}</div>
    </main>
  );
}
