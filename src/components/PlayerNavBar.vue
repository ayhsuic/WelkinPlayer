<!--
 Copyright 2026 Atemukesu
 SPDX-License-Identifier: GPL-3.0-only
-->

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { ListMusic, Repeat1, Shuffle } from "@lucide/vue";
import { usePlayerStore, type PlayMode } from "../stores/player";
import { seekPercent } from "../lib/audio";
import { percent } from "../lib/format";
import { i18n } from "../i18n";
import { pushToast } from "../lib/toast";

/**
 * Mobile transport strip, modelled on the lmusic seekbar:
 *
 *   - one rounded progress bar carrying the elapsed / total time;
 *   - drag horizontally to seek;
 *   - tap the left third for previous, the middle for play/pause, the right
 *     third for next;
 *   - long-press turns the bar into an in-bar three-way mode switcher: the
 *     order / repeat-one / shuffle icons appear in a row, slide to a third and
 *     release to pick that mode (no separate popup sheet);
 *   - an upward swipe opens the navigation drawer.
 *
 * Desktop keeps the full `PlayerBar`; this strip is mobile-only.
 */
const emit = defineEmits<{ sheet: [] }>();
const player = usePlayerStore();

/* ------------------------------------------------------------- seek bar */

const bar = ref<HTMLElement | null>(null);
/** While dragging, the bar shows `seekValue` so engine ticks cannot yank it. */
const seekValue = ref<number | null>(null);
/**
 * While the long-press mode switcher is open the gesture only picks a mode, so
 * the bar keeps following the real playhead instead of a frozen seek preview;
 * releasing then cannot snap back to a stale position.
 */
const sliderValue = () => (switching.value ? player.progress : seekValue.value ?? player.progress);

let pointerSeeking = false;
let dragMoved = false;
let downX = 0;
let downY = 0;
let barRect: DOMRect | null = null;
let pressTimer = 0;

/* ------------------------------------------------------- mode switcher */

/**
 * The three play modes laid out left to right inside the long-press
 * switcher, matching lmusic: list recycle, repeat-one, shuffle.
 */
const MODES: { id: PlayMode; icon: typeof Shuffle }[] = [
  { id: "order", icon: ListMusic },
  { id: "one", icon: Repeat1 },
  { id: "shuffle", icon: Shuffle },
];

/** True while the bar is in the long-press mode-switching state. */
const switching = ref(false);
/** Finger position inside the switcher, 0..1; drives the sliding highlight thumb. */
const switchRatio = ref(0.5);

/** Buffered range never falls behind the playhead; mirrors the other three bars. */
const bufferPercent = () => percent(Math.max(player.bufferedProgress, sliderValue()));

/** Playhead ratio as a 0..100 number, used to park the elapsed label beside the thumb. */
const fillRatio = () => Math.min(100, Math.max(0, sliderValue()));

/**
 * Elapsed label placement, matching lmusic's SeekbarDuration: the text sits
 * on the layer above the fill track, its right edge just left of the thumb.
 * When the playhead is near the start it parks at the left inset instead of
 * sliding off the bar.
 */
const elapsedStyle = () => {
  const ratio = fillRatio();
  if (ratio < 14) return { left: "14px", transform: "translateY(-50%)" };
  return { left: `${ratio}%`, transform: "translateY(-50%) translateX(calc(-100% - 8px))" };
};

/** Centre ratio of each mode's third, so the thumb starts over the active mode. */
const MODE_CENTER: Record<PlayMode, number> = { order: 1 / 6, one: 3 / 6, shuffle: 5 / 6 };

/** Which mode third the current finger position lands on. */
function activeModeIndex(): number {
  const ratio = Math.min(1, Math.max(0, switchRatio.value));
  if (ratio < 1 / 3) return 0;
  if (ratio < 2 / 3) return 1;
  return 2;
}

/** Localized label for the three play modes. */
function playModeLabel(mode: PlayMode): string {
  const key =
    mode === "shuffle"
      ? "controls.shuffle"
      : mode === "one"
        ? "controls.repeatOne"
        : "controls.repeatOrder";
  return i18n.global.t(key);
}

function selectMode(mode: PlayMode) {
  if (player.playMode() !== mode) void player.applyPlayMode(mode);
  pushToast("info", playModeLabel(mode));
  switching.value = false;
}

function modeAtRatio(ratio: number): PlayMode {
  if (ratio < 1 / 3) return MODES[0].id;
  if (ratio < 2 / 3) return MODES[1].id;
  return MODES[2].id;
}

function ratioFromEvent(clientX: number): number {
  if (!barRect) return 0;
  return Math.min(1, Math.max(0, (clientX - barRect.left) / barRect.width));
}

function onBarDown(event: PointerEvent) {
  const el = bar.value;
  if (!el) return;
  barRect = el.getBoundingClientRect();
  pointerSeeking = true;
  dragMoved = false;
  switching.value = false;
  // Reset the swipe-up tracker so a stale axis from a previous gesture cannot
  // open the drawer mid-tap or seek.
  tracking = false;
  axis = "none";
  switchRatio.value = MODE_CENTER[player.playMode()];
  downX = event.clientX;
  downY = event.clientY;
  seekValue.value = player.progress;
  el.setPointerCapture?.(event.pointerId);
  // Long press opens the in-bar mode switcher; a plain tap toggles play/pause
  // or seeks.
  pressTimer = window.setTimeout(() => {
    switching.value = true;
  }, 500);
}

function onBarMove(event: PointerEvent) {
  if (!pointerSeeking) return;
  const dx = event.clientX - downX;
  const dy = event.clientY - downY;

  // Inside the switcher the gesture only aims at a mode: the highlight thumb
  // follows the finger, it never seeks.
  if (switching.value) {
    switchRatio.value = ratioFromEvent(event.clientX);
    return;
  }

  if (!dragMoved && Math.hypot(dx, dy) > 8) {
    // A vertical gesture belongs to the drawer swipe, not the seek drag.
    if (Math.abs(dx) < Math.abs(dy)) {
      pointerSeeking = false;
      return;
    }
    dragMoved = true;
    window.clearTimeout(pressTimer);
  }
  if (!dragMoved) return;
  const value = ratioFromEvent(event.clientX) * 100;
  seekValue.value = value;
  seekPercent(value, false);
}

function onBarUp(event: PointerEvent) {
  window.clearTimeout(pressTimer);
  if (!pointerSeeking) return;
  pointerSeeking = false;

  // Releasing from the long-press switcher picks the mode under the finger.
  if (switching.value) {
    selectMode(modeAtRatio(switchRatio.value));
    seekValue.value = null;
    return;
  }

  if (dragMoved) {
    const value = seekValue.value ?? player.progress;
    seekValue.value = null;
    seekPercent(value, true);
    return;
  }
  // Tap: left third previous, middle play/pause, right third next.
  const ratio = ratioFromEvent(event.clientX);
  if (ratio < 1 / 3) void player.previous();
  else if (ratio > 2 / 3) void player.next();
  else void player.togglePlayback();
}

function onBarCancel() {
  window.clearTimeout(pressTimer);
  pointerSeeking = false;
  dragMoved = false;
  switching.value = false;
  seekValue.value = null;
  tracking = false;
  axis = "none";
}

/* --------------------------------------------- swipe up opens the drawer */

const AXIS_LOCK_PX = 8;
const SHEET_STEP_PX = 32;
const EDGE_PX = 24;
/** A gesture only counts as vertical when the vertical component clearly dominates. */
const VERTICAL_RATIO = 1.2;

const root = ref<HTMLElement | null>(null);
let tracking = false;
let axis: "none" | "x" | "y" = "none";
let startX = 0;
let startY = 0;
let lastY = 0;

function onTouchStart(event: TouchEvent) {
  if (event.touches.length !== 1) return;
  const touch = event.touches[0];
  tracking = true;
  axis = "none";
  startX = touch.clientX;
  startY = touch.clientY;
  lastY = touch.clientY;
}

function onTouchMove(event: TouchEvent) {
  if (!tracking || event.touches.length !== 1) return;
  const touch = event.touches[0];
  const dx = touch.clientX - startX;
  const dy = touch.clientY - startY;
  lastY = touch.clientY;

  if (axis === "none") {
    if (Math.hypot(dx, dy) < AXIS_LOCK_PX) return;
    // The long-press mode switcher and an already-committed horizontal seek are
    // horizontal gestures: never let them open the drawer.
    const horizontal = switching.value || dragMoved || Math.abs(dx) * VERTICAL_RATIO >= Math.abs(dy);
    if (horizontal) {
      axis = "x";
      return;
    }
    // The bottom strip belongs to the system home gesture: exclude it.
    const inBottomStrip = startY > window.innerHeight - EDGE_PX;
    if (inBottomStrip) {
      tracking = false;
      return;
    }
    axis = "y";
  }

  if (axis === "y" && dy < 0 && event.cancelable) event.preventDefault();
}

function onTouchEnd() {
  if (!tracking) return;
  tracking = false;
  if (axis === "y" && startY - lastY >= SHEET_STEP_PX) emit("sheet");
}

function onTouchCancel() {
  tracking = false;
}

onMounted(() => {
  const el = root.value;
  if (!el) return;
  el.addEventListener("touchstart", onTouchStart, { passive: true });
  el.addEventListener("touchmove", onTouchMove, { passive: false });
  el.addEventListener("touchend", onTouchEnd, { passive: true });
  el.addEventListener("touchcancel", onTouchCancel, { passive: true });
});

onBeforeUnmount(() => {
  window.clearTimeout(pressTimer);
  const el = root.value;
  if (!el) return;
  el.removeEventListener("touchstart", onTouchStart);
  el.removeEventListener("touchmove", onTouchMove);
  el.removeEventListener("touchend", onTouchEnd);
  el.removeEventListener("touchcancel", onTouchCancel);
});
</script>

<template>
  <footer ref="root" class="transport no-scrollbar" role="group" aria-label="Playback controls">
    <div
      ref="bar"
      class="seekbar"
      :class="{ 'is-switching': switching }"
      :style="{ '--fill': percent(sliderValue()) }"
      role="slider"
      :aria-valuenow="Math.round(sliderValue())"
      aria-valuemin="0"
      aria-valuemax="100"
      aria-label="Playback position"
      @pointerdown="onBarDown"
      @pointermove="onBarMove"
      @pointerup="onBarUp"
      @pointercancel="onBarCancel"
    >
      <div class="seekbar-track">
        <div class="seekbar-buffer" :style="{ width: bufferPercent() }" />
        <div class="seekbar-fill" :style="{ width: percent(sliderValue()) }" />
      </div>
      <template v-if="!switching">
        <span class="seekbar-time seekbar-time--elapsed" :style="elapsedStyle()">{{ player.elapsedTime }}</span>
        <span class="seekbar-time seekbar-time--end">{{ player.totalTime }}</span>
      </template>
      <div v-if="switching" class="seekbar-switcher" :style="{ '--ratio': `${switchRatio * 100}%` }">
        <div class="switcher-thumb" aria-hidden="true" />
        <button
          v-for="(mode, i) in MODES"
          :key="mode.id"
          type="button"
          class="switcher-option"
          :class="{ 'is-active': activeModeIndex() === i }"
          :aria-label="playModeLabel(mode.id)"
          @click.stop="selectMode(mode.id)"
        >
          <component :is="mode.icon" :size="20" />
        </button>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.transport {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  width: min(340px, calc(100vw - 40px));
  bottom: calc(env(safe-area-inset-bottom) + 76px);
  z-index: 60;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.seekbar {
  position: relative;
  height: 44px;
  /* Transparent track: only the top-right and bottom-left corners are clipped. */
  clip-path: polygon(0 0, calc(100% - var(--cut)) 0, 100% var(--cut), 100% 100%, var(--cut) 100%, 0 calc(100% - var(--cut)));
  background: color-mix(in srgb, var(--line) 35%, transparent);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.26);
  cursor: pointer;
  touch-action: none;
}

/* Outer track fills the whole bar; the inner progress block is a second
   clipped-corner rectangle stacked on it, mirroring lmusic's two-layer seekbar. */
.seekbar-track {
  position: absolute;
  inset: 0;
}

.seekbar-buffer {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  clip-path: polygon(0 0, calc(100% - var(--cut)) 0, 100% var(--cut), 100% 100%, var(--cut) 100%, 0 calc(100% - var(--cut)));
  background: color-mix(in srgb, var(--fg) 16%, transparent);
  pointer-events: none;
}

.seekbar-fill {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 1;
  isolation: isolate;
  /* Elapsed block: top-right/bottom-left clipped; a lighter back layer sits under
     the solid front layer and peeks along the top and left edges. */
  clip-path: polygon(0 0, calc(100% - var(--cut)) 0, 100% var(--cut), 100% 100%, var(--cut) 100%, 0 calc(100% - var(--cut)));
  background: var(--accent);
  pointer-events: none;
}

.seekbar-fill::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  background: color-mix(in srgb, var(--accent) 50%, #fff);
  transform: translate(-6px, -6px);
  clip-path: polygon(0 0, calc(100% - var(--cut)) 0, 100% var(--cut), 100% 100%, var(--cut) 100%, 0 calc(100% - var(--cut)));
}

.seekbar-time {
  position: absolute;
  top: 50%;
  z-index: 2;
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  color: #fff;
  pointer-events: none;
}

.seekbar-time--elapsed {
  white-space: nowrap;
}

.seekbar-time--end {
  right: 14px;
  transform: translateY(-50%);
}

.seekbar-switcher {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  padding: 4px;
  background: color-mix(in srgb, var(--surface) 82%, transparent);
}

/* Sliding highlight: one third of the bar wide, centred under the finger. */
.switcher-thumb {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: clamp(0%, calc(var(--ratio, 50%) - 16.666%), 66.666%);
  width: 33.333%;
  isolation: isolate;
  clip-path: polygon(0 0, calc(100% - var(--cut)) 0, 100% var(--cut), 100% 100%, var(--cut) 100%, 0 calc(100% - var(--cut)));
  background: var(--accent);
  pointer-events: none;
}

.switcher-thumb::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  background: color-mix(in srgb, var(--accent) 50%, #fff);
  transform: translate(-6px, -6px);
  clip-path: polygon(0 0, calc(100% - var(--cut)) 0, 100% var(--cut), 100% 100%, var(--cut) 100%, 0 calc(100% - var(--cut)));
}

.switcher-option {
  position: relative;
  z-index: 1;
  flex: 1 1 0;
  display: grid;
  place-items: center;
  padding: 0;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
}

.switcher-option.is-active {
  color: #fff;
}

/* Desktop keeps the full player bar, so this strip is mobile-only. */
@media (min-width: 768px) {
  .transport {
    display: none;
  }
}
</style>
