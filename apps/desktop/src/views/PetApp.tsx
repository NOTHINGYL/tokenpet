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
  type PetDirectorState,
} from "../features/pet-story/PetDirector";
import { playPetActionSound } from "../features/pet-story/soundCueEngine";
import { useAppSettings } from "../hooks/useAppSettings";
import { useUsage } from "../hooks/useUsage";
import type { CursorTrackingVisual, PetActionId, PetDirectorEvent, QuickPlaySession } from "../types";

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
  if (event.type === "quickPlay.action") return true;
  if (event.type === "actor.actionRequested") {
    if (event.action === "click_purr" || event.action === "walk_round_trip") return story.interactionRules.click;
    if (event.action === "drag_dangle") return story.interactionRules.drag;
    if (event.action === "token_snack") return story.interactionRules.feed;
    if (event.action === "play_cursor" || event.action === "toss_yarn") return story.interactionRules.cursor;
  }
  if (event.type === "milestone.reached") return story.companionSettings.celebrateMilestones;
  return true;
}

const dangleDirectionalActions = {
  pounce: {
    left: "dangle_pounce", right: "dangle_pounce", front: "dangle_pounce_front", back: "dangle_pounce_back",
    "front-left": "dangle_pounce_front_left", "front-right": "dangle_pounce_front_right",
    "back-left": "dangle_pounce_back_left", "back-right": "dangle_pounce_back_right",
  },
  play: {
    left: "dangle_play", right: "dangle_play", front: "dangle_play_front", back: "dangle_play_back",
    "front-left": "dangle_play_front_left", "front-right": "dangle_play_front_right",
    "back-left": "dangle_play_back_left", "back-right": "dangle_play_back_right",
  },
  pursuit: {
    left: "dangle_pursuit_run", right: "dangle_pursuit_run", front: "dangle_pursuit_run_front", back: "dangle_pursuit_run_back",
    "front-left": "dangle_pursuit_run_front_left", "front-right": "dangle_pursuit_run_front_right",
    "back-left": "dangle_pursuit_run_back_left", "back-right": "dangle_pursuit_run_back_right",
  },
  return: {
    left: "dangle_return_walk", right: "dangle_return_walk", front: "dangle_return_walk_front", back: "dangle_return_walk_back",
    "front-left": "dangle_return_walk_front_left", "front-right": "dangle_return_walk_front_right",
    "back-left": "dangle_return_walk_back_left", "back-right": "dangle_return_walk_back_right",
  },
} as const satisfies Record<string, Record<NonNullable<QuickPlaySession["actorDirection"]>, PetActionId>>;

function dangleDirectionalAction(
  phase: keyof typeof dangleDirectionalActions,
  direction: QuickPlaySession["actorDirection"],
): PetActionId {
  return dangleDirectionalActions[phase][direction ?? "right"];
}

export function PetApp() {
  const { usage } = useUsage();
  const { settings } = useAppSettings();
  const [dragging, setDragging] = useState(false);
  const [summoning, setSummoning] = useState(false);
  const [batteryLow, setBatteryLow] = useState(false);
  const [pointerOffset, setPointerOffset] = useState({ x: 0, y: 0 });
  const [cursorTracking, setCursorTracking] = useState<CursorTrackingVisual | null>(null);
  const [quickPlaySession, setQuickPlaySession] = useState<QuickPlaySession>({
    activeAction: null, startedAt: null, phase: "idle", phaseStartedAt: null, startBounds: null,
    startDirectorState: null, targetPoint: null, walkMotion: null, actorDirection: null, pointerMode: "none", resting: false, failure: null,
  });
  const appearance = normalizePetAppearance(settings);
  const story = settings.petStory ?? defaultPetStory;
  const mood = moodFromUsage(usage, story.moodThresholds);
  const directorRef = useRef(createPetDirectorState(mood));
  const [directorAction, setDirectorAction] = useState<PetActionId>(() => moodAction(mood));
  const completionTimerRef = useRef<number | null>(null);
  const clickTimerRef = useRef<number | null>(null);
  const pointerGestureRef = useRef<PointerGesture | null>(null);
  const handledActionNonceRef = useRef<number | null>(null);
  const quickPlayActiveRef = useRef(false);
  const quickPlayPreviousActionRef = useRef<QuickPlaySession["activeAction"]>(null);
  const quickPlaySnapshotRef = useRef<{ action: PetActionId; state: PetDirectorState } | null>(null);
  const quickPlayAppliedEndRef = useRef<string | null>(null);
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
      if (quickPlayActiveRef.current && event.type !== "quickPlay.action") return false;
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

      const nativeSideEffectOwnedByMain = event.type === "quickPlay.action";
      if (decision.sideEffect === "summon" && !nativeSideEffectOwnedByMain) {
        setSummoning(true);
        void window.tokenpet?.summonPet?.().finally(() => {
          window.setTimeout(() => setSummoning(false), 560);
        });
      }

      if (decision.sideEffect === "capture" && !nativeSideEffectOwnedByMain) {
        window.setTimeout(() => void window.tokenpet?.capturePetMoment?.(), Math.min(420, Math.max(180, decision.durationMs / 4)));
      }

      if (decision.sideEffect === "traverse" && !nativeSideEffectOwnedByMain) {
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
    let disposed = false;
    void window.tokenpet?.getQuickPlaySession?.().then((session) => {
      if (!disposed) setQuickPlaySession(session);
    });
    const unsubscribe = window.tokenpet?.onQuickPlaySessionChanged?.(setQuickPlaySession);
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    window.tokenpet?.reportPetDirectorState?.({ action: directorAction, resting: directorRef.current.resting });
  }, [directorAction]);

  useEffect(() => {
    const action = quickPlaySession.activeAction;
    const previousAction = quickPlayPreviousActionRef.current;
    quickPlayActiveRef.current = action !== null;

    if (action && previousAction === null) {
      quickPlaySnapshotRef.current = {
        action: directorAction,
        state: { ...directorRef.current, lastPlayedAt: { ...directorRef.current.lastPlayedAt } },
      };
      quickPlayAppliedEndRef.current = null;
    }

    const snapshot = quickPlaySnapshotRef.current;
    const terminalKey = action && ["complete", "failed"].includes(quickPlaySession.phase)
      ? `${action}:${quickPlaySession.phase}:${quickPlaySession.phaseStartedAt}`
      : null;
    if (snapshot && terminalKey && quickPlayAppliedEndRef.current !== terminalKey) {
      clearCompletionTimer();
      let nextState = { ...snapshot.state, lastPlayedAt: { ...snapshot.state.lastPlayedAt } };
      if (quickPlaySession.phase === "complete" && action === "nap_here") {
        nextState = { ...nextState, currentAction: "sleep_loop", resting: true, activePriority: 0, activeUntil: 0 };
      } else if (quickPlaySession.phase === "complete" && action === "wake_up") {
        nextState = { ...nextState, currentAction: nextState.moodLoop, resting: false, activePriority: 0, activeUntil: 0 };
      }
      directorRef.current = nextState;
      setDirectorAction(nextState.currentAction);
      quickPlayAppliedEndRef.current = terminalKey;
    }

    if (!action && previousAction && snapshot && quickPlayAppliedEndRef.current === null) {
      clearCompletionTimer();
      directorRef.current = { ...snapshot.state, lastPlayedAt: { ...snapshot.state.lastPlayedAt } };
      setDirectorAction(snapshot.action);
    }
    if (!action && previousAction) quickPlaySnapshotRef.current = null;
    quickPlayPreviousActionRef.current = action;
  }, [clearCompletionTimer, directorAction, quickPlaySession.activeAction, quickPlaySession.phase, quickPlaySession.phaseStartedAt]);

  useEffect(() => {
    const { activeAction, phase } = quickPlaySession;
    if (activeAction === "token_snack" && phase === "stand") {
      const startMeow = story.actionSettings.byAction.token_snack?.startMeow;
      if (startMeow !== false) void playPetActionSound("token_snack", story);
    }
    if (activeAction === "wake_up" && ["stand", "outbound", "interact"].includes(phase)) {
      const meowCue = story.actionSettings.byAction.wake_up?.meowCue;
      const meowVoice = story.actionSettings.byAction.wake_up?.meowVoice;
      const soundStyle = ["soft", "cozy", "playful"].includes(String(meowVoice)) ? meowVoice as typeof story.soundStyle : story.soundStyle;
      if (meowCue !== false) void playPetActionSound("wake_up", { ...story, soundStyle });
    }
  }, [quickPlaySession.activeAction, quickPlaySession.phase, quickPlaySession.phaseStartedAt, story]);

  useEffect(() => {
    const unsubscribe = window.tokenpet?.onCursorPosition?.((position) => {
      const quickPlayTracking = quickPlaySession.activeAction === "play_cursor" && quickPlaySession.phase === "tracking";
      if ((!story.followCursor && !quickPlayTracking) || (!quickPlayTracking && directorRef.current.activePriority > 200)) {
        setPointerOffset({ x: 0, y: 0 });
        setCursorTracking(null);
        return;
      }
      const smoothing = quickPlayTracking ? Number(story.actionSettings.byAction.play_cursor?.followSmoothing ?? 74) / 100 : .72;
      const target = { x: Math.min(Math.max(position.x, -1), 1), y: Math.min(Math.max(position.y, -1), 1) };
      if (quickPlayTracking) {
        setPointerOffset(target);
        setCursorTracking(position.tracking ? { ...position.tracking, stage: "tracking" } : null);
        return;
      }
      setCursorTracking(null);
      setPointerOffset((current) => ({
        x: current.x + (target.x - current.x) * Math.max(.12, 1 - smoothing * .82),
        y: current.y + (target.y - current.y) * Math.max(.12, 1 - smoothing * .82),
      }));
    });
    if (!story.followCursor && quickPlaySession.activeAction !== "play_cursor") setPointerOffset({ x: 0, y: 0 });
    if (quickPlaySession.activeAction !== "play_cursor") setCursorTracking(null);
    return () => unsubscribe?.();
  }, [quickPlaySession.activeAction, quickPlaySession.phase, story.actionSettings.byAction.play_cursor, story.followCursor]);

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
    if (event.button !== 0 || story.lockPosition || quickPlaySession.activeAction !== null) return;
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
      const napBreathing = Number(story.actionSettings.byAction.nap_here?.breathingIntensity ?? 54);
      return ({
        "--pet-scale": appearance.size.toString(),
        "--pet-opacity": appearance.opacity.toString(),
        "--pet-shadow-opacity": appearance.shadow.toString(),
        "--pet-ui-close-size": `${closeSize}px`,
        "--pet-ui-close-top": `${Math.round(closeCenterY - closeSize / 2)}px`,
        "--pet-ui-close-right": `${Math.round(260 - closeCenterX - closeSize / 2)}px`,
        "--pet-ui-close-font-size": `${Math.round(closeSize * 0.66)}px`,
        "--quick-nap-breathe": `${Math.max(1, Math.min(5, napBreathing / 24))}px`,
      }) as CSSProperties;
    },
    [appearance.opacity, appearance.shadow, appearance.size, story.actionSettings.byAction.nap_here],
  );

  const quickPlayActorAction = useMemo<PetActionId | null>(() => {
    const action = quickPlaySession.activeAction;
    const phase = quickPlaySession.phase;
    if (!action) return null;
    if (action === "walk_round_trip") {
      // Stand and settle freeze frame 1 of the same side-profile locomotion
      // clip, so starting/stopping never hard-cuts from the upright look asset.
      return phase === "pause" ? "walk_round_trip_look" : "walk_round_trip";
    }
    if (action === "token_snack") {
      if (phase === "stand") return "feed_snack_stretch";
      if (phase === "outbound") return "feed_snack_walk_slow";
      if (phase === "arrive") return "feed_snack_arrive";
      if (phase === "lick") return "feed_snack_lick";
      if (phase === "eat") return "feed_snack_eat";
      if (phase === "return") return "feed_snack_return_run";
      if (phase === "settle" || phase === "complete") return "feed_snack_settle";
    }
    if (action === "drag_dangle") {
      const direction = quickPlaySession.actorDirection;
      if (phase === "alert" || phase === "stand" || phase === "awaiting-placement") return "dangle_alert";
      if (phase === "stalk") return "dangle_stalk";
      if (phase === "crouch") return "dangle_crouch";
      if (phase === "pounce") return dangleDirectionalAction("pounce", direction);
      if (phase === "play" || phase === "interact") return dangleDirectionalAction("play", direction);
      if (phase === "pursuit") return dangleDirectionalAction("pursuit", direction);
      if (phase === "return") return dangleDirectionalAction("return", direction);
      if (phase === "release" || phase === "settle" || phase === "complete") return "dangle_settle";
    }
    if (action === "summon_to_pointer" && phase === "outbound") return "summon_to_pointer";
    if (action === "toss_yarn" && phase === "return") return "toss_yarn";
    if (phase === "return" || phase === "outbound") return "run_across";
    if (action === "toss_yarn" && phase === "interact") return "toss_yarn";
    if (action === "play_cursor") return "play_cursor";
    if (action === "nap_here") {
      const pose = story.actionSettings.byAction.nap_here?.settlePose;
      if (phase === "settle" && pose === "side") return "wake_up";
      if (phase === "settle" && pose === "paws") return "sleep_loop";
      return phase === "settle" ? "nap_here" : "sleep_loop";
    }
    if (action === "wake_up") return "wake_up";
    if (action === "summon_to_pointer" && phase === "stand") return "summon_to_screen";
    if (action === "summon_to_pointer") return phase === "settle" ? "focus_loop" : "run_across";
    return action;
  }, [quickPlaySession.activeAction, quickPlaySession.actorDirection, quickPlaySession.phase, story.actionSettings.byAction.nap_here, story.actionSettings.byAction.walk_round_trip]);

  const quickPlayFacing = useMemo<"left" | "right" | undefined>(() => {
    if (quickPlaySession.activeAction === "drag_dangle") {
      if (quickPlaySession.actorDirection && !["left", "right"].includes(quickPlaySession.actorDirection)) return undefined;
      if (quickPlaySession.actorDirection === "left" || quickPlaySession.actorDirection === "right") return quickPlaySession.actorDirection;
      const currentBounds = quickPlaySession.currentBounds;
      if (!currentBounds) return undefined;
      const currentCenterX = currentBounds.x + currentBounds.width / 2;
      if (quickPlaySession.phase === "settle" || quickPlaySession.phase === "complete") return undefined;
      if (quickPlaySession.phase === "return" && quickPlaySession.startBounds) {
        const homeCenterX = quickPlaySession.startBounds.x + quickPlaySession.startBounds.width / 2;
        return homeCenterX >= currentCenterX ? "right" : "left";
      }
      if (!quickPlaySession.targetPoint) return undefined;
      return quickPlaySession.targetPoint.x >= currentCenterX ? "right" : "left";
    }
    if (
      !["walk_round_trip", "token_snack"].includes(quickPlaySession.activeAction ?? "")
      || !quickPlaySession.startBounds
      || !quickPlaySession.targetPoint
    ) return undefined;
    const startCenterX = quickPlaySession.startBounds.x + quickPlaySession.startBounds.width / 2;
    const outboundFacing = quickPlaySession.targetPoint.x >= startCenterX ? "right" : "left";
    const facesHome = quickPlaySession.phase === "return" || quickPlaySession.phase === "settle" || quickPlaySession.phase === "complete";
    return facesHome ? (outboundFacing === "right" ? "left" : "right") : outboundFacing;
  }, [quickPlaySession.activeAction, quickPlaySession.actorDirection, quickPlaySession.currentBounds, quickPlaySession.phase, quickPlaySession.startBounds, quickPlaySession.targetPoint]);

  const actorAppearance = useMemo(() => quickPlaySession.activeAction === "drag_dangle"
    ? { ...appearance, size: appearance.size * .84 }
    : appearance, [appearance, quickPlaySession.activeAction]);

  const authoredLocomotionActive = (
    quickPlaySession.activeAction === "walk_round_trip"
    || quickPlaySession.activeAction === "token_snack"
    || quickPlaySession.activeAction === "drag_dangle"
  ) && (quickPlaySession.phase === "outbound" || quickPlaySession.phase === "pursuit" || quickPlaySession.phase === "return");
  const authoredLocomotionFrozen = quickPlaySession.activeAction === "walk_round_trip" && (
    quickPlaySession.phase === "stand"
    || quickPlaySession.phase === "settle"
    || quickPlaySession.phase === "complete"
    || (quickPlaySession.phase === "pause" && story.actionSettings.byAction.walk_round_trip?.lookAroundEffect === false)
  ) || quickPlaySession.activeAction === "token_snack" && (
    quickPlaySession.phase === "settle" || quickPlaySession.phase === "complete"
  );
  const playCursorTracking = quickPlaySession.activeAction !== "play_cursor"
    ? undefined
    : quickPlaySession.phase === "settle" || quickPlaySession.phase === "complete"
      ? {
        eyeOffset: { x: 0, y: 0 }, headOffset: { x: 0, y: 0 }, earOffset: { x: 0, y: 0 },
        headAngleDegrees: 0, withinAttention: false, earFollow: false, stage: "settle" as const,
      }
      : cursorTracking ?? undefined;

  return (
    <main
      className={`pet-stage pet-theme-${appearance.themeId} pet-state-${mood} ${dragging ? "is-dragging" : ""} ${summoning ? "is-summoning" : ""}`}
      data-quick-play-action={quickPlaySession.activeAction ?? "none"}
      data-quick-play-phase={quickPlaySession.phase}
      data-nap-z-effect={story.actionSettings.byAction.nap_here?.zEffect === false ? "false" : "true"}
      data-nap-shadow={story.actionSettings.byAction.nap_here?.sleepShadow === false ? "false" : "true"}
      data-wake-sparkle={story.actionSettings.byAction.wake_up?.wakeSparkle === false ? "false" : "true"}
      style={stageStyle}
      onDoubleClick={openQuickPlay}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="pet-drag-region" aria-label="Drag TokenPet">
        <PetAppearanceVisual
          appearance={actorAppearance}
          usage={usage}
          moodId={mood}
          storyActionId={quickPlayActorAction ?? directorAction}
          facing={quickPlayFacing}
          animationNonce={authoredLocomotionActive
            ? quickPlaySession.walkMotion?.startedAt
            : quickPlaySession.activeAction === "token_snack" && ["stand", "arrive", "lick", "eat", "settle"].includes(quickPlaySession.phase)
              ? quickPlaySession.phaseStartedAt ?? undefined
              : quickPlaySession.activeAction === "drag_dangle"
                ? quickPlaySession.phaseStartedAt ?? undefined
              : undefined}
          animationStartedAtMs={authoredLocomotionActive ? quickPlaySession.walkMotion?.startedAt : undefined}
          animationCycleDurationMs={authoredLocomotionActive ? quickPlaySession.walkMotion?.cycleDurationMs : undefined}
          previewTimeMs={authoredLocomotionFrozen ? 0 : undefined}
          reduceMotion={story.reduceMotion || (story.safety.batteryLowPause && batteryLow)}
          pointerOffset={story.followCursor || quickPlaySession.activeAction === "play_cursor" ? pointerOffset : undefined}
          cursorTracking={playCursorTracking}
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
