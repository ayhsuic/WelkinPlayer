<!--
 Copyright 2026 Atemukesu
 SPDX-License-Identifier: GPL-3.0-only
-->

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

/**
 * The mobile navigation strip: a bare gesture surface. It carries no buttons,
 * no track information and no progress — playback is controlled on the cover
 * wall, so this strip only turns gestures into intents:
 *
 *   tap         -> back to the wall (home, which is also the now-playing page)
 *   swipe left  -> next track
 *   swipe right -> previous track
 *   long press  -> locate the current track
 *   swipe up    -> open the bottom sheet menu
 *
 * Android keeps its own gesture strips at the screen edges: roughly the bottom
 * strip is the home gesture and the two side strips are back gestures. A
 * horizontal swipe therefore may only start away from the side strips, and an
 * upward swipe only away from the bottom strip. Taps and long presses are
 * allowed anywhere.
 *
 * While the cover wall does not exist yet, `locate` is answered by App.vue with
 * "back home, then open the queue", so the current track is at least visible.
 */
const props = withDefaults(defineProps<{ canSkip?: boolean }>(), { canSkip: false });
const emit = defineEmits<{ home: []; previous: []; next: []; locate: []; sheet: [] }>();

/** Travel (px) before a gesture commits to an axis. */
const AXIS_LOCK_PX = 8;
/** Horizontal travel (px) that commits a track change on release. */
const SWIPE_STEP_PX = 40;
/** Velocity (px/ms) that commits a track change even below SWIPE_STEP_PX. */
const FLING_PX_PER_MS = 0.35;
/** Vertical travel (px) that opens the sheet on release. */
const SHEET_STEP_PX = 24;
/** A tap must stay inside this travel and inside TAP_MAX_MS. */
const TAP_MAX_PX = 8;
const TAP_MAX_MS = 300;
const LONG_PRESS_MS = 500;
/** How wide the system's own edge gesture strips are, in px. */
const EDGE_PX = 24;

const root = ref<HTMLElement | null>(null);
let tracking = false;
let moved = false;
let axis: "none" | "x" | "y" = "none";
let startX = 0;
let startY = 0;
let lastX = 0;
let lastY = 0;
let startedAt = 0;
let longPressTimer = 0;

function clearLongPress() {
  if (!longPressTimer) return;
  window.clearTimeout(longPressTimer);
  longPressTimer = 0;
}

function onTouchStart(event: TouchEvent) {
  if (event.touches.length !== 1) return;
  // Claim the touch before the engine can start a page scroll: a scroll takes
  // over the stream and cancels it, so the swipe never reaches the axis lock.
  if (event.cancelable) event.preventDefault();
  const touch = event.touches[0];
  tracking = true;
  moved = false;
  axis = "none";
  startX = lastX = touch.clientX;
  startY = lastY = touch.clientY;
  startedAt = Date.now();
  clearLongPress();
  longPressTimer = window.setTimeout(() => {
    longPressTimer = 0;
    // A finger that has already travelled is not a long press.
    if (!tracking || moved) return;
    tracking = false;
    emit("locate");
  }, LONG_PRESS_MS);
}

function onTouchMove(event: TouchEvent) {
  if (!tracking || event.touches.length !== 1) return;
  const touch = event.touches[0];
  const dx = touch.clientX - startX;
  const dy = touch.clientY - startY;
  lastX = touch.clientX;
  lastY = touch.clientY;

  if (axis === "none") {
    if (Math.hypot(dx, dy) < AXIS_LOCK_PX) return;
    moved = true;
    clearLongPress();
    // The capsule floats above the screen's bottom edge, so its own rectangle
    // says nothing about where the system gesture strips are: the exclusion
    // zones must be measured against the viewport, not against the capsule.
    const viewWidth = window.innerWidth;
    const viewHeight = window.innerHeight;
    if (Math.abs(dx) >= Math.abs(dy)) {
      // The side strips belong to the system's back gesture.
      const inSideStrip = startX < EDGE_PX || startX > viewWidth - EDGE_PX;
      if (inSideStrip) {
        tracking = false;
        return;
      }
      axis = "x";
    } else if (dy < 0) {
      // The bottom strip belongs to the system's home gesture.
      const inBottomStrip = startY > viewHeight - EDGE_PX;
      if (inBottomStrip) {
        tracking = false;
        return;
      }
      axis = "y";
    } else {
      // A downward swipe is not this strip's gesture; leave it to the page.
      tracking = false;
      return;
    }
  }

  // The gesture is ours now: keep the webview from scrolling under it.
  if (event.cancelable) event.preventDefault();
}

function onTouchEnd() {
  clearLongPress();
  if (!tracking) {
    tracking = false;
    return;
  }
  tracking = false;
  const elapsed = Date.now() - startedAt;
  const dx = lastX - startX;
  const dy = lastY - startY;

  if (!moved) {
    if (Math.abs(dx) < TAP_MAX_PX && Math.abs(dy) < TAP_MAX_PX && elapsed < TAP_MAX_MS) emit("home");
    return;
  }

  if (axis === "x") {
    if (!props.canSkip) return;
    const velocity = elapsed > 0 ? dx / elapsed : 0;
    if (dx <= -SWIPE_STEP_PX || velocity <= -FLING_PX_PER_MS) emit("next");
    else if (dx >= SWIPE_STEP_PX || velocity >= FLING_PX_PER_MS) emit("previous");
  } else if (axis === "y") {
    if (-dy >= SHEET_STEP_PX) emit("sheet");
  }
}

function onTouchCancel() {
  clearLongPress();
  tracking = false;
}

onMounted(() => {
  const el = root.value;
  if (!el) return;
  // `touchstart` must be non-passive too: cancelling the start is the only
  // reliable way to keep a scroll from hijacking the gesture, and `touchmove`
  // must stay non-passive so the page cannot scroll under an active swipe.
  el.addEventListener("touchstart", onTouchStart, { passive: false });
  el.addEventListener("touchmove", onTouchMove, { passive: false });
  el.addEventListener("touchend", onTouchEnd, { passive: true });
  el.addEventListener("touchcancel", onTouchCancel, { passive: true });
});

onBeforeUnmount(() => {
  clearLongPress();
  const el = root.value;
  if (!el) return;
  el.removeEventListener("touchstart", onTouchStart);
  el.removeEventListener("touchmove", onTouchMove);
  el.removeEventListener("touchend", onTouchEnd);
  el.removeEventListener("touchcancel", onTouchCancel);
});
</script>

<template>
  <div ref="root" class="player-nav" role="group" aria-label="Navigation gestures">
    <span class="player-nav-grip" aria-hidden="true"><i /><i /><i /></span>
  </div>
</template>

<style scoped>
/*
 * A small floating capsule rather than a full-width bar: it carries no content,
 * so it only needs to be big enough to catch a thumb. The three dots are a
 * touch-affordance, not a progress indicator.
 */
.player-nav {
  position: fixed;
  left: 50%;
  bottom: calc(env(safe-area-inset-bottom) + 14px);
  transform: translateX(-50%);
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 136px;
  height: 38px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--line) 85%, transparent);
  background: color-mix(in srgb, var(--surface) 74%, transparent);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.26);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  touch-action: none;
  /* A long press must not open the text-selection / callout menu. */
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}

.player-nav-grip {
  display: flex;
  gap: 6px;
  opacity: 0.3;
}

.player-nav-grip i {
  width: 2px;
  height: 2px;
  border-radius: 999px;
  background: var(--fg);
}

/* Desktop keeps the full player bar, so the strip is mobile-only. */
@media (min-width: 768px) {
  .player-nav {
    display: none;
  }
}
</style>
