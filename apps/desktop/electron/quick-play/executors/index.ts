export { executeDangleToy } from "./dangle-toy.js";
export { executeFeedSnack } from "./feed-snack.js";
export { executeNapHere } from "./nap-here.js";
export { executePet } from "./pet.js";
export { executePlayCursor, PLAY_CURSOR_DURATION_MS, PLAY_CURSOR_SETTLE_MS } from "./play-cursor.js";
export { executeSummon } from "./summon.js";
export { executeTossYarn } from "./toss-yarn.js";
export { executeWakeUp } from "./wake-up.js";

export const QUICK_PLAY_EXECUTOR_IDS = [
  "walk_round_trip",
  "token_snack",
  "play_cursor",
  "drag_dangle",
  "toss_yarn",
  "nap_here",
  "wake_up",
  "summon_to_pointer",
] as const;
