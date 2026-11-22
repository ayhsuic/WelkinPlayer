<!--
 Copyright 2026 Atemukesu
 SPDX-License-Identifier: GPL-3.0-only
-->

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { mainPagerTabs, type MainTab } from "../lib/app";

/**
 * Primary destinations (home / library / search) stacked in place: switching
 * tabs cross-fades the active page in and out. There is no pinned tab row and
 * no follow-along drag — a horizontal swipe past the threshold (or a fling)
 * simply selects the neighbor tab, then the crossfade plays. Each page still
 * scrolls inside its own section; horizontal rails keep their own native scroll
 * and are exempt from the pager gesture.
 *
 * Every page is provided through a named slot so the parent keeps owning each
 * page's props and events.
 */
const props = defineProps<{ active: MainTab }>();
const emit = defineEmits<{ select: [tab: MainTab] }>();

const rootEl = ref<HTMLElement | null>(null);
/** Slide direction for the page transition: 1 enters from the right, -1 from the left. */
const dir = ref<1 | -1>(1);

function indexOf(tab: MainTab) {
  return Math.max(0, mainPagerTabs.indexOf(tab));
}

/** Horizontal swipe taps the neighbor tab; no follow-along drag. */
function goNeighbor(delta: 1 | -1) {
  const next = Math.max(0, Math.min(mainPagerTabs.length - 1, indexOf(props.active) + delta));
  const tab = mainPagerTabs[next];
  if (tab && tab !== props.active) {
    dir.value = delta;
    emit("select", tab);
  }
}

const slideVars = computed(() => ({
  "--enter-x": dir.value >= 0 ? "48px" : "-48px",
  "--leave-x": dir.value >= 0 ? "-48px" : "48px",
}));

// --- Horizontal swipe: taps the neighbor tab, no follow-along drag. ---
let dragging = false;
let startX = 0;
let startY = 0;
let axis: "x" | "y" | null = null;
let velocity = 0;
let lastSampleX = 0;
let lastSampleT = 0;
/** A touch starting inside a horizontal rail/column host is left to that
 *  rail's own native horizontal scroll; the pager must not steal it. */
let railGesture = false;

const SWIPE_PX = 60;
const FLING_PX_PER_MS = 0.35;

/** Walk up from the touch target to find a horizontal scroll host. */
function isHorizontalRail(target: EventTarget | null): boolean {
  let n = target as HTMLElement | null;
  while (n) {
    if (n.classList && (n.classList.contains("overflow-x-auto") || n.classList.contains("home-recent-columns"))) {
      return true;
    }
    n = n.parentElement;
  }
  return false;
}

function startGesture(clientX: number, clientY: number) {
  dragging = true;
  axis = null;
  startX = clientX;
  startY = clientY;
  velocity = 0;
  lastSampleX = clientX;
  lastSampleT = performance.now();
}

function moveGesture(clientX: number, clientY: number, event: { preventDefault(): void }) {
  if (!dragging) return;
  const dx = clientX - startX;
  const dy = clientY - startY;
  if (axis === null) {
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    // Only take over once the travel is clearly horizontal; a near-vertical or
    // diagonal gesture is handed back so the ancestor list keeps scrolling.
    if (adx > 8 && adx > ady * 1.2) {
      axis = "x";
      event.preventDefault();
    } else if (ady > 8) {
      axis = "y";
    }
  }
  if (axis === "x") {
    event.preventDefault();
    const now = performance.now();
    const dt = now - lastSampleT;
    if (dt > 0 && dt < 120) velocity = (clientX - lastSampleX) / dt;
    else velocity = 0;
    lastSampleX = clientX;
    lastSampleT = now;
  }
}

function endGesture() {
  if (!dragging) return;
  const wasHorizontal = axis === "x";
  dragging = false;
  axis = null;
  if (!wasHorizontal) return;
  const dx = lastSampleX - startX;
  const swiped = Math.abs(dx) > SWIPE_PX || Math.abs(velocity) > FLING_PX_PER_MS;
  if (!swiped) return;
  goNeighbor(dx < 0 ? 1 : -1);
}

// --- Event wiring ---
let unbind: (() => void) | null = null;

function onPointerDown(event: PointerEvent) {
  if (event.pointerType !== "mouse" || event.button !== 0) return;
  startGesture(event.clientX, event.clientY);
}
function onPointerMove(event: PointerEvent) {
  if (event.pointerType !== "mouse") return;
  moveGesture(event.clientX, event.clientY, event);
}
function onPointerEnd(event: PointerEvent) {
  if (event.pointerType !== "mouse") return;
  endGesture();
}

function onTouchStart(event: TouchEvent) {
  const touch = event.touches[0];
  if (!touch) return;
  railGesture = isHorizontalRail(event.target);
  if (railGesture) return;
  startGesture(touch.clientX, touch.clientY);
}
function onTouchMove(event: TouchEvent) {
  if (railGesture) return;
  const touch = event.touches[0];
  if (!touch) return;
  moveGesture(touch.clientX, touch.clientY, event);
}
function onTouchEnd() {
  railGesture = false;
  endGesture();
}

function bindGesture(el: HTMLElement) {
  el.addEventListener("pointerdown", onPointerDown);
  el.addEventListener("pointermove", onPointerMove);
  el.addEventListener("pointerup", onPointerEnd);
  el.addEventListener("pointercancel", onPointerEnd);
  el.addEventListener("touchstart", onTouchStart, { passive: true });
  el.addEventListener("touchmove", onTouchMove, { passive: false });
  el.addEventListener("touchend", onTouchEnd);
  el.addEventListener("touchcancel", onTouchEnd);
  unbind = () => {
    el.removeEventListener("pointerdown", onPointerDown);
    el.removeEventListener("pointermove", onPointerMove);
    el.removeEventListener("pointerup", onPointerEnd);
    el.removeEventListener("pointercancel", onPointerEnd);
    el.removeEventListener("touchstart", onTouchStart);
    el.removeEventListener("touchmove", onTouchMove);
    el.removeEventListener("touchend", onTouchEnd);
    el.removeEventListener("touchcancel", onTouchEnd);
  };
}

onMounted(() => {
  if (rootEl.value) bindGesture(rootEl.value);
});
onBeforeUnmount(() => {
  unbind?.();
});
</script>

<template>
  <div ref="rootEl" class="main-pager flex h-full w-full flex-col" :style="slideVars" style="touch-action: pan-x pan-y">
    <div class="relative min-h-0 flex-1 overflow-x-clip">
      <Transition name="page-slide" mode="out-in">
        <section :key="props.active" class="h-full min-h-0 overflow-y-auto overscroll-contain">
          <slot name="home" />
        </section>
      </Transition>
    </div>
  </div>
</template>
