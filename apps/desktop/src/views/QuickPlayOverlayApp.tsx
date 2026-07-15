import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

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
  type: "click" | "cancel" | "reopen" | "move";
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
  if (mode === "dangle") return "Wiggle for 1 sec to pounce · Click any time to release";
  return "Click to toss the yarn · Esc to cancel";
}

function sendInput(input: OverlayInput) {
  const bridge = window.tokenpet as typeof window.tokenpet & OverlayBridge;
  return bridge.quickPlayOverlayInput?.(input);
}

function SnackIcon({ style }: { style: NonNullable<OverlayState["snackStyle"]> }) {
  return <img className="quick-overlay-snack-image" src={`pet-actors/golden-british/props/snack-${style}.png`} alt="" draggable={false} aria-hidden="true" />;
}

function YarnIcon() {
  return (
    <svg className="quick-overlay-yarn-image" viewBox="0 0 82 68" aria-hidden="true">
      <circle className="quick-overlay-yarn-ball" cx="32" cy="30" r="23" />
      <path className="quick-overlay-yarn-thread" d="M13 19c15 7 29 19 39 34M16 45c17-12 28-23 36-36M10 33c16 1 31 6 43 14M26 8c2 18 10 34 25 47M52 49c12 2 15 13 26 10" />
    </svg>
  );
}

function SnackProp({ pointer, released, state }: { pointer: PointerPosition; released: boolean; state: OverlayState }) {
  const snackStyle = state.snackStyle ?? "paw";
  const targetClientX = released && typeof state.targetScreenX === "number" ? state.targetScreenX - window.screenX : pointer.clientX;
  const targetClientY = released && typeof state.targetScreenY === "number" ? state.targetScreenY - window.screenY : pointer.clientY;
  return (
    <div className={`quick-overlay-snack-prop snack-${snackStyle} ${released ? "is-released" : ""}`} style={{ left: targetClientX, top: targetClientY, "--snack-scale": String(Math.max(.7, Math.min(1.3, (state.snackSize ?? 100) / 100))) } as CSSProperties} aria-hidden="true">
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

function DangleProp({ pointer, state, onFishPosition }: { pointer: PointerPosition; state: OverlayState; onFishPosition: (point: { x: number; y: number }) => void }) {
  const horizontalDirection = pointer.clientX < 190 ? 1 : -1;
  const verticalDirection = pointer.clientY < 170 ? 1 : -1;
  const wandSize = 166;
  const wandAnchor = { x: .77, y: .61 };
  const wandTip = { x: .08, y: .07 };
  const wandFlip = { x: -horizontalDirection, y: -verticalDirection };
  const rodTip = {
    x: pointer.clientX + (wandTip.x - wandAnchor.x) * wandSize * wandFlip.x,
    y: pointer.clientY + (wandTip.y - wandAnchor.y) * wandSize * wandFlip.y,
  };
  const desiredRef = useRef({ x: rodTip.x + horizontalDirection * 12, y: rodTip.y + 110 });
  const positionRef = useRef({ ...desiredRef.current });
  const velocityRef = useRef({ x: 0, y: 0 });
  const [fish, setFish] = useState(positionRef.current);
  const [wandFlexed, setWandFlexed] = useState(false);

  useEffect(() => {
    desiredRef.current = { x: rodTip.x + horizontalDirection * 12, y: rodTip.y + 110 };
  }, [horizontalDirection, rodTip.x, rodTip.y]);

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
      setWandFlexed(Math.hypot(velocity.x, velocity.y) > 5.5);
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [state.swingResponse]);

  useEffect(() => {
    onFishPosition({ x: window.screenX + fish.x, y: window.screenY + fish.y });
  }, [fish.x, fish.y, onFishPosition]);

  const controlX = (rodTip.x + fish.x) / 2 - velocityRef.current.x * 1.8;
  const controlY = (rodTip.y + fish.y) / 2 + 22;
  const wandStyle = {
    left: pointer.clientX - wandSize * wandAnchor.x,
    top: pointer.clientY - wandSize * wandAnchor.y,
    "--wand-flip-x": wandFlip.x,
    "--wand-flip-y": wandFlip.y,
  } as CSSProperties;
  const fishStyle = { left: fish.x, top: fish.y } as CSSProperties;

  return (
    <div className={`quick-overlay-dangle-rig fish-${state.fishToyStyle ?? "mint"} ${state.toyTrailEffect ? "has-trail" : ""}`} aria-hidden="true">
      <svg className="quick-overlay-dangle-cord-layer" viewBox={`0 0 ${window.innerWidth} ${window.innerHeight}`} preserveAspectRatio="none">
        <path d={`M ${rodTip.x} ${rodTip.y} Q ${controlX} ${controlY} ${fish.x} ${fish.y - 25}`} />
      </svg>
      <img className="quick-overlay-dangle-wand" src={`pet-actors/golden-british/props/dangle-wand${wandFlexed ? "-flex" : ""}.png`} style={wandStyle} alt="" draggable={false} />
      <span className="quick-overlay-dangle-fish" style={fishStyle}>
        {state.toyTrailEffect ? <img className="quick-overlay-dangle-trail" src="pet-actors/golden-british/props/dangle-trail.png" alt="" draggable={false} /> : null}
        <img className="quick-overlay-dangle-fish-image" src={`pet-actors/golden-british/props/dangle-fish-${state.fishToyStyle ?? "mint"}.png`} alt="" draggable={false} />
      </span>
    </div>
  );
}

export function QuickPlayOverlayApp() {
  const [state, setState] = useState(initialOverlayState);
  const [submitted, setSubmitted] = useState(false);
  const [released, setReleased] = useState(false);
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
  const lastFishPublishRef = useRef(0);

  const publishFishPosition = useCallback((point: { x: number; y: number }) => {
    const now = performance.now();
    if (now - lastFishPublishRef.current < 32) return;
    lastFishPublishRef.current = now;
    void sendInput({ type: "move", screenX: point.x, screenY: point.y, timestamp: Date.now() });
  }, []);

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
      if (next.enabled === true && next.phase !== "finishing") {
        setSubmitted(false);
        setReleased(false);
      }
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
    const screenX = window.screenX + event.clientX;
    const screenY = window.screenY + event.clientY;
    velocityRef.current = { x: (screenX - previous.screenX) / elapsedSeconds, y: (screenY - previous.screenY) / elapsedSeconds };
    priorPointerRef.current = { clientX: event.clientX, clientY: event.clientY, screenX, screenY, timestamp: now };
    setPointer({ clientX: event.clientX, clientY: event.clientY, screenX, screenY });
  }

  function submit(event: ReactMouseEvent<HTMLElement>) {
    if (!state.enabled || submitted || event.button !== 0) return;
    const nextPointer = {
      clientX: event.clientX,
      clientY: event.clientY,
      screenX: window.screenX + event.clientX,
      screenY: window.screenY + event.clientY,
    };
    setPointer(nextPointer);
    if (state.mode === "dangle") {
      setSubmitted(true);
      const velocity = { ...velocityRef.current };
      void sendInput({
        type: "click",
        screenX: nextPointer.screenX,
        screenY: nextPointer.screenY,
        velocityX: velocity.x,
        velocityY: velocity.y,
        timestamp: Date.now(),
      });
      return;
    }
    if (event.detail >= 2) {
      if (clickTimerRef.current !== null) window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      setReleased(false);
      void sendInput({ type: "reopen", screenX: nextPointer.screenX, screenY: nextPointer.screenY, timestamp: Date.now() });
      return;
    }
    if (state.mode === "snack") setReleased(true);
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
  const pointerReleased = state.mode === "snack" && (released || submitted || state.enabled === false || phase === "finishing");
  const horizontalMargin = state.mode === "dangle" ? 180 : state.mode === "snack" ? 58 : 150;
  const bottomMargin = state.mode === "dangle" ? 210 : state.mode === "snack" ? 52 : 120;
  const visualPointer = state.mode === "dangle" ? pointer : {
    ...pointer,
    clientX: Math.min(Math.max(pointer.clientX, horizontalMargin), Math.max(horizontalMargin, window.innerWidth - horizontalMargin)),
    clientY: Math.min(Math.max(pointer.clientY, 52), Math.max(52, window.innerHeight - bottomMargin)),
  };

  return (
    <main
      className={`quick-play-overlay quick-play-overlay-${state.mode} phase-${phase} ${submitted ? "is-submitted" : ""} ${pointerReleased ? "is-released" : ""}`}
      data-view="quick-play-overlay"
      data-overlay-mode={state.mode}
      data-overlay-phase={phase}
      aria-label={`${state.mode} Quick Play pointer mode`}
      onPointerMove={trackPointer}
      onClick={submit}
    >
      <div className="quick-overlay-focus-ring" style={{ left: visualPointer.clientX, top: visualPointer.clientY }} aria-hidden="true" />
      {state.mode === "snack" ? <SnackProp pointer={visualPointer} released={pointerReleased} state={state} /> : null}
      {state.mode === "dangle" ? <DangleProp pointer={visualPointer} state={state} onFishPosition={publishFishPosition} /> : null}
      {state.mode === "yarn" ? <YarnProp pointer={visualPointer} rolling={phase === "rolling"} state={state} /> : null}
      <div className="quick-overlay-hint" style={{ left: visualPointer.clientX, top: visualPointer.clientY }} role="status">{hint}</div>
    </main>
  );
}
