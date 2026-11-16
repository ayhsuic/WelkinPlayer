<!--
 Copyright 2026 Atemukesu
 SPDX-License-Identifier: GPL-3.0-only
-->

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { Pause, Play, SkipBack, SkipForward } from "@lucide/vue";
import { usePlayerStore } from "../stores/player";
import { seekPercent } from "../lib/audio";
import { percent } from "../lib/format";

/**
 * Mobile transport strip. Replaces the old bare gesture capsule with a
 * playback control surface:
 *
 *   - a scrubbable progress track at the top (drag to seek);
 *   - previous / play-pause / next in the row below;
 *   - long-pressing the play button cycles the repeat mode;
 *   - an upward swipe opens the navigation drawer.
 *
 * Desktop keeps the full `PlayerBar`; this strip is mobile-only.
 */
const emit = defineEmits<{ sheet: [] }>();
const player = usePlayerStore();

/* ------------------------------------------------------------- scrubbing */

/** While dragging, the slider shows `seekValue` so engine ticks cannot yank it. */
const seekValue = ref<number | null>(null);
const sliderValue = computed(() => seekValue.value ?? player.progress);
let pointerSeeking = false;
let pointerCommitDone = false;

function onSeek(event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  if (!Number.isFinite(value)) return;
  seekValue.value = value;
  pointerCommitDone = false;
  seekPercent(value, false);
}

function commitSeek(event: Event) {
  if (pointerSeeking) return;
  if (pointerCommitDone) {
    pointerCommitDone = false;
    return;
  }
  const value = Number((event.target as HTMLInputElement).value);
  if (!Number.isFinite(value)) return;
  seekValue.value = null;
  seekPercent(value, true);
}

function beginSeek() {
  pointerSeeking = true;
  pointerCommitDone = false;
  seekValue.value = player.progress;
}

function endSeek() {
  if (!pointerSeeking) return;
  pointerSeeking = false;
  if (pointerCommitDone) return;
  const value = seekValue.value;
  if (value === null) return;
  pointerCommitDone = true;
  seekValue.value = null;
  seekPercent(value, true);
}

/* ------------------------------------------- play / long-press cycle mode */

let pressTimer = 0;
let longFired = false;

function pressPlay() {
  longFired = false;
  window.clearTimeout(pressTimer);
  // Long press cycles the repeat mode; a plain tap toggles play/pause.
  pressTimer = window.setTimeout(() => {
    longFired = true;
    void player.cycleRepeat();
  }, 500);
}

function releasePlay() {
  window.clearTimeout(pressTimer);
}

function onPlayTap() {
  if (longFired) {
    longFired = false;
    return;
  }
  void player.togglePlayback();
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
    <input
      :value="sliderValue"
      :style="{ '--fill': percent(sliderValue), '--buffered': percent(player.bufferedProgress) }"
      class="ak-slider transport-seek"
      type="range"
      min="0"
      max="100"
      aria-label="Playback position"
      @pointerdown="beginSeek"
      @input="onSeek"
      @change="commitSeek"
      @pointerup="endSeek"
      @pointercancel="endSeek"
      @lostpointercapture="endSeek"
    />
    <div class="transport-row">
      <button type="button" class="transport-btn" aria-label="Previous track" @click="player.previous()">
        <SkipBack :size="20" />
      </button>
      <button
        type="button"
        class="transport-btn transport-play"
        :aria-label="player.isPlaying ? 'Pause' : 'Play'"
        @pointerdown="pressPlay"
        @pointerup="releasePlay"
        @pointerleave="releasePlay"
        @click="onPlayTap"
      >
        <Pause v-if="player.isPlaying" :size="22" />
        <Play v-else :size="22" />
      </button>
      <button type="button" class="transport-btn" aria-label="Next track" @click="player.next()">
        <SkipForward :size="20" />
      </button>
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
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 14px 12px;
  border-radius: 20px;
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

.transport-seek {
  width: 100%;
  height: 14px;
  margin: 0;
}

.transport-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.transport-btn {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--fg);
  cursor: pointer;
  touch-action: manipulation;
}

.transport-play {
  width: 52px;
  height: 52px;
  background: var(--accent);
  color: #fff;
}

/* Desktop keeps the full player bar, so this strip is mobile-only. */
@media (min-width: 768px) {
  .transport {
    display: none;
  }
}
</style>
