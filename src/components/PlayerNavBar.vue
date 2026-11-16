<!--
 Copyright 2026 Atemukesu
 SPDX-License-Identifier: GPL-3.0-only
-->

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { usePlayerStore, type PlayMode } from "../stores/player";
import { seekPercent } from "../lib/audio";
import { percent } from "../lib/format";
import { i18n } from "../i18n";
import { pushToast } from "../lib/toast";

/**
 * Mobile transport strip, modelled on the lmusic seekbar:
 *
 *   - one tall progress bar carrying the elapsed / total time;
 *   - drag horizontally to seek;
 *   - tap the left third for previous, the middle for play/pause, the right
 *     third for next;
 *   - long-press cycles the play mode (order -> shuffle -> repeat-one);
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
const sliderValue = () => seekValue.value ?? player.progress;

let pointerSeeking = false;
let dragMoved = false;
let longFired = false;
let downX = 0;
let downY = 0;
let barRect: DOMRect | null = null;
let pressTimer = 0;

function ratioFromEvent(clientX: number): number {
  if (!barRect) return 0;
  return Math.min(1, Math.max(0, (clientX - barRect.left) / barRect.width));
}

/** Localized label for the three long-press play modes. */
function playModeLabel(mode: PlayMode): string {
  const key =
    mode === "shuffle"
      ? "controls.shuffle"
      : mode === "one"
        ? "controls.repeatOne"
        : "controls.repeatOrder";
  return i18n.global.t(key);
}

function onBarDown(event: PointerEvent) {
  const el = bar.value;
  if (!el) return;
  barRect = el.getBoundingClientRect();
  pointerSeeking = true;
  dragMoved = false;
  longFired = false;
  downX = event.clientX;
  downY = event.clientY;
  seekValue.value = player.progress;
  el.setPointerCapture?.(event.pointerId);
  // Long press cycles the play mode; a plain tap toggles play/pause.
  pressTimer = window.setTimeout(() => {
    longFired = true;
    void player.cyclePlayMode().then((next) => pushToast("info", playModeLabel(next)));
  }, 500);
}

function onBarMove(event: PointerEvent) {
  if (!pointerSeeking) return;
  const dx = event.clientX - downX;
  const dy = event.clientY - downY;
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
  if (longFired) {
    longFired = false;
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
  seekValue.value = null;
}

/* --------------------------------------------- swipe up opens the drawer */

const AXIS_LOCK_PX = 8;
const SHEET_STEP_PX = 24;
const EDGE_PX = 24;

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
    if (Math.abs(dx) >= Math.abs(dy)) {
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
      <div class="seekbar-fill" :style="{ width: percent(sliderValue()) }" />
      <span class="seekbar-time seekbar-time--start">{{ player.elapsedTime }}</span>
      <span class="seekbar-time seekbar-time--end">{{ player.totalTime }}</span>
    </div>
  </footer>
</template>

<style scoped>
.transport {
  position: fixed;
  left: 12px;
  right: 12px;
  bottom: calc(env(safe-area-inset-bottom) + 12px);
  z-index: 60;
  padding: 6px;
  border: 1px solid color-mix(in srgb, var(--line) 85%, transparent);
  background: color-mix(in srgb, var(--surface) 78%, transparent);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.26);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.seekbar {
  position: relative;
  height: 48px;
  overflow: hidden;
  background: color-mix(in srgb, var(--line) 55%, transparent);
  cursor: pointer;
  touch-action: none;
}

.seekbar-fill {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  background: var(--accent);
  pointer-events: none;
}

.seekbar-time {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  color: #fff;
  pointer-events: none;
}

.seekbar-time--start {
  left: 14px;
}

.seekbar-time--end {
  right: 14px;
}

/* Desktop keeps the full player bar, so this strip is mobile-only. */
@media (min-width: 768px) {
  .transport {
    display: none;
  }
}
</style>
