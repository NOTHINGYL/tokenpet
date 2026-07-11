import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PetAppearanceVisual } from "../features/pet-appearance/PetAppearanceVisual";
import { normalizePetAppearance } from "../features/pet-appearance/appearanceState";
import {
  completePetDirectorAction,
  createPetDirectorState,
  defaultPetStory,
  directPetEvent,
  lifecycleFromUsage,
  moodAction,
  moodFromUsage,
  selectAmbientPetEvent,
  thresholdCrossingEvent,
} from "../features/pet-story/PetDirector";
import { playPetActionSound } from "../features/pet-story/soundCueEngine";
import { useAppSettings } from "../hooks/useAppSettings";
import { useUsage } from "../hooks/useUsage";
import type { PetActionId, PetDirectorEvent } from "../types";

type PointerGesture = {
  pointerId: number;
  screenX: number;
  screenY: number;
  dragActionSent: boolean;
};

type BatteryStatus = EventTarget & { charging: boolean; level: number };

function localDateKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function interactionAllowed(event: PetDirectorEvent, story: typeof defaultPetStory) {
  if (event.type === "pointer.click") return story.interactionRules.click;
  if (event.type === "pointer.dragStart") return story.interactionRules.drag;
  if (event.type === "pointer.drop") return story.interactionRules.drop;
  if (event.type === "quickPlay.action" || event.type === "actor.actionRequested") {
    if (event.action === "click_purr" || event.action === "walk_round_trip") return story.interactionRules.click;
    if (event.action === "drag_dangle") return story.interactionRules.drag;
    if (event.action === "token_snack") return story.interactionRules.feed;
    if (event.action === "play_cursor" || event.action === "toss_yarn") return story.interactionRules.cursor;
  }
  if (event.type === "milestone.reached") return story.companionSettings.celebrateMilestones;
  return true;
}

export function PetApp() {
  const { usage } = useUsage();
  const { settings } = useAppSettings();
  const [dragging, setDragging] = useState(false);
  const [summoning, setSummoning] = useState(false);
  const [batteryLow, setBatteryLow] = useState(false);
  const [pointerOffset, setPointerOffset] = useState({ x: 0, y: 0 });
  const appearance = normalizePetAppearance(settings);
  const story = settings.petStory ?? defaultPetStory;
  const mood = moodFromUsage(usage, story.moodThresholds);
  const directorRef = useRef(createPetDirectorState(mood));
  const [directorAction, setDirectorAction] = useState<PetActionId>(() => moodAction(mood));
  const completionTimerRef = useRef<number | null>(null);
  const clickTimerRef = useRef<number | null>(null);
  const pointerGestureRef = useRef<PointerGesture | null>(null);
  const handledActionNonceRef = useRef<number | null>(null);
  const previousMoodRef = useRef(mood);
  const observedUsageRef = useRef<{ status: string; allTimeTokens: number } | null>(null);
  const ambientRef = useRef({
    lastActivityAt: Date.now(),
    lastBlinkAt: Date.now(),
    lastWakeDate: null as string | null,
    lastRestAttemptAt: 0,
  });

  const clearCompletionTimer = useCallback(() => {
    if (completionTimerRef.current !== null) {
      window.clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }
  }, []);

  const dispatchDirectorEvent = useCallback(
    (event: PetDirectorEvent) => {
      if (!interactionAllowed(event, story)) return false;
      if (
        event.type === "pointer.click"
        || event.type === "pointer.dragStart"
        || event.type === "pointer.drop"
        || event.type === "quickPlay.action"
        || (event.type === "token.delta" && event.tokens > 0)
      ) {
        ambientRef.current.lastActivityAt = Date.now();
      }
      const directed = directPetEvent(directorRef.current, event, {
        actorId: appearance.catTypeId,
        reduceMotion: story.reduceMotion || (story.safety.batteryLowPause && batteryLow),
        behaviorMode: story.behaviorMode,
        quietMode: story.quietMode,
      });
      directorRef.current = directed.state;
      const decision = directed.decision;
      if (!decision) return false;

      clearCompletionTimer();
      setDirectorAction(decision.resolved);
      if (event.type !== "token.delta") void playPetActionSound(decision.requested, story);

      if (decision.sideEffect === "summon") {
        setSummoning(true);
        void window.tokenpet?.summonPet?.().finally(() => {
          window.setTimeout(() => setSummoning(false), 560);
        });
      }

      if (decision.sideEffect === "capture") {
        window.setTimeout(() => void window.tokenpet?.capturePetMoment?.(), Math.min(420, Math.max(180, decision.durationMs / 4)));
      }

      if (decision.sideEffect === "traverse") {
        void window.tokenpet?.traversePet?.();
      }

      if (decision.durationMs > 0) {
        completionTimerRef.current = window.setTimeout(() => {
          const completed = completePetDirectorAction(directorRef.current);
          directorRef.current = completed;
          setDirectorAction(completed.currentAction);
          completionTimerRef.current = null;
        }, decision.durationMs);
      }

      return true;
    },
    [appearance.catTypeId, batteryLow, clearCompletionTimer, story],
  );

  useEffect(() => {
    const burnRate = mood === "overdrive" ? "overdrive" : mood === "hot" ? "hot" : mood === "focused" ? "steady" : "quiet";
    dispatchDirectorEvent({ type: "token.delta", tokens: 0, burnRate });
    const crossing = thresholdCrossingEvent(previousMoodRef.current, mood, story.reactionRules.oneShotOnThreshold);
    if (crossing) dispatchDirectorEvent(crossing);
    if (previousMoodRef.current === "overdrive" && mood !== "overdrive" && story.reactionRules.coolDownAfterOverdrive) {
      dispatchDirectorEvent({ type: "actor.actionRequested", action: "cool_down" });
    }
    previousMoodRef.current = mood;
  }, [dispatchDirectorEvent, mood, story.reactionRules.coolDownAfterOverdrive, story.reactionRules.oneShotOnThreshold]);

  useEffect(() => {
    if (usage.status === "loading") return;
    const previous = observedUsageRef.current;
    if (!previous || usage.allTimeTokens > previous.allTimeTokens) {
      ambientRef.current.lastActivityAt = Date.now();
    }
    observedUsageRef.current = { status: usage.status, allTimeTokens: usage.allTimeTokens };
  }, [usage.allTimeTokens, usage.status]);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const timestamp = now.getTime();
      const ambient = ambientRef.current;
      const suggestion = selectAmbientPetEvent({
        now: timestamp,
        dateKey: localDateKey(now),
        minuteOfDay: now.getHours() * 60 + now.getMinutes(),
        lastActivityAt: ambient.lastActivityAt,
        lastBlinkAt: ambient.lastBlinkAt,
        lastWakeDate: ambient.lastWakeDate,
        lastRestAttemptAt: ambient.lastRestAttemptAt,
        resting: directorRef.current.resting,
        lifecycleStage: lifecycleFromUsage(usage),
        behaviorMode: story.behaviorMode,
        quietMode: story.quietMode,
        reduceMotion: story.reduceMotion || (story.safety.batteryLowPause && batteryLow),
        nightStart: story.safety.quietHoursStart,
        nightEnd: story.safety.quietHoursEnd,
      });
      if (!suggestion) return;

      if (suggestion.kind === "blink") ambient.lastBlinkAt = timestamp;
      if (suggestion.kind === "rest") ambient.lastRestAttemptAt = timestamp;
      if (suggestion.kind === "wake") ambient.lastWakeDate = localDateKey(now);
      dispatchDirectorEvent(suggestion.event);
    };

    const startupTimer = window.setTimeout(tick, 450);
    const interval = window.setInterval(tick, 1_000);
    return () => {
      window.clearTimeout(startupTimer);
      window.clearInterval(interval);
    };
  }, [batteryLow, dispatchDirectorEvent, story.behaviorMode, story.quietMode, story.reduceMotion, story.safety.batteryLowPause, story.safety.quietHoursEnd, story.safety.quietHoursStart, usage]);

  useEffect(() => {
    if (!story.safety.batteryLowPause) {
      setBatteryLow(false);
      return;
    }
    const getBattery = (navigator as Navigator & { getBattery?: () => Promise<BatteryStatus> }).getBattery;
    if (!getBattery) return;
    let disposed = false;
    let battery: BatteryStatus | null = null;
    const update = () => {
      if (battery && !disposed) setBatteryLow(!battery.charging && battery.level <= 0.15);
    };
    void getBattery.call(navigator).then((nextBattery) => {
      if (disposed) return;
      battery = nextBattery;
      update();
      battery.addEventListener("chargingchange", update);
      battery.addEventListener("levelchange", update);
    });
    return () => {
      disposed = true;
      battery?.removeEventListener("chargingchange", update);
      battery?.removeEventListener("levelchange", update);
    };
  }, [story.safety.batteryLowPause]);

  useEffect(() => {
    const request = story.lastAction;
    if (!request || handledActionNonceRef.current === request.nonce) return;
    handledActionNonceRef.current = request.nonce;
    dispatchDirectorEvent({ type: "actor.actionRequested", action: request.id });
  }, [dispatchDirectorEvent, story.lastAction]);

  useEffect(() => {
    const unsubscribe = window.tokenpet?.onPetDirectorEvent?.((event) => {
      dispatchDirectorEvent(event);
    });
    return () => unsubscribe?.();
  }, [dispatchDirectorEvent]);

  useEffect(() => {
    const unsubscribe = window.tokenpet?.onCursorPosition?.((position) => {
      if (!story.followCursor || directorRef.current.activePriority > 200) {
        setPointerOffset({ x: 0, y: 0 });
        return;
      }
      setPointerOffset({
        x: Math.min(Math.max(position.x, -1), 1),
        y: Math.min(Math.max(position.y, -1), 1),
      });
    });
    if (!story.followCursor) setPointerOffset({ x: 0, y: 0 });
    return () => unsubscribe?.();
  }, [story.followCursor]);

  useEffect(
    () => () => {
      clearCompletionTimer();
      if (clickTimerRef.current !== null) window.clearTimeout(clickTimerRef.current);
    },
    [clearCompletionTimer],
  );

  function close(event: React.SyntheticEvent) {
    event.preventDefault();
    event.stopPropagation();
    window.tokenpet.close();
  }

  function openQuickPlay(event?: React.SyntheticEvent) {
    event?.preventDefault();
    event?.stopPropagation();
    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    window.tokenpet.togglePopover();
  }

  async function startDrag(event: React.PointerEvent<HTMLElement>) {
    if (event.button !== 0 || story.lockPosition) return;
    if ((event.target as HTMLElement).closest("button")) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    pointerGestureRef.current = {
      pointerId: event.pointerId,
      screenX: event.screenX,
      screenY: event.screenY,
      dragActionSent: false,
    };
    setDragging(true);
    await window.tokenpet.startDrag();
  }

  function moveDrag(event: React.PointerEvent<HTMLElement>) {
    const gesture = pointerGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.dragActionSent) return;
    if (Math.hypot(event.screenX - gesture.screenX, event.screenY - gesture.screenY) < 4) return;
    gesture.dragActionSent = true;
    dispatchDirectorEvent({ type: "pointer.dragStart" });
  }

  async function endDrag(event: React.PointerEvent<HTMLElement>) {
    const gesture = pointerGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    pointerGestureRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const result = await window.tokenpet.endDrag();
    const moved = result.moved || gesture.dragActionSent;

    if (moved) {
      if (!dispatchDirectorEvent({ type: "pointer.drop" })) {
        const completed = completePetDirectorAction(directorRef.current);
        directorRef.current = completed;
        setDirectorAction(completed.currentAction);
      }
      return;
    }

    if (clickTimerRef.current !== null) window.clearTimeout(clickTimerRef.current);
    clickTimerRef.current = window.setTimeout(() => {
      dispatchDirectorEvent({ type: "pointer.click" });
      clickTimerRef.current = null;
    }, 210);
  }

  const stageStyle = useMemo(
    () => {
      const companionScale = Math.min(Math.max(appearance.size, 0.75), 1.25);
      const closeSize = Math.round(24 + (companionScale - 0.75) * 8);
      const closeCenterX = 130 + 78 * companionScale;
      const closeCenterY = 172 - 66 * companionScale;
      return ({
        "--pet-scale": appearance.size.toString(),
        "--pet-opacity": appearance.opacity.toString(),
        "--pet-shadow-opacity": appearance.shadow.toString(),
        "--pet-ui-close-size": `${closeSize}px`,
        "--pet-ui-close-top": `${Math.round(closeCenterY - closeSize / 2)}px`,
        "--pet-ui-close-right": `${Math.round(260 - closeCenterX - closeSize / 2)}px`,
        "--pet-ui-close-font-size": `${Math.round(closeSize * 0.66)}px`,
      }) as CSSProperties;
    },
    [appearance.opacity, appearance.shadow, appearance.size],
  );

  return (
    <main
      className={`pet-stage pet-theme-${appearance.themeId} pet-state-${mood} ${dragging ? "is-dragging" : ""} ${summoning ? "is-summoning" : ""}`}
      style={stageStyle}
      onDoubleClick={openQuickPlay}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="pet-drag-region" aria-label="Drag TokenPet">
        <PetAppearanceVisual
          appearance={appearance}
          usage={usage}
          moodId={mood}
          storyActionId={directorAction}
          reduceMotion={story.reduceMotion || (story.safety.batteryLowPause && batteryLow)}
          pointerOffset={story.followCursor ? pointerOffset : undefined}
          surface="desktop"
          onBubbleClick={openQuickPlay}
        />
      </div>
      <button className="pet-close" type="button" aria-label="Hide TokenPet" onPointerDown={close} onClick={close}>
        x
      </button>
    </main>
  );
}
