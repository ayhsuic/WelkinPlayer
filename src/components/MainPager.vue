<!--
 Copyright 2026 Atemukesu
 SPDX-License-Identifier: GPL-3.0-only
-->

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { mainPagerTabs, type MainTab } from "../lib/app";

/**
 * Three-page horizontal pager for the primary destinations (home / library /
 * search), modelled on the category strip in CategoriesView: a hand-written
 * transform strip driven by touch (mobile) and pointer (mouse) drags; on
 * release it animates to the nearest page and publishes the settled tab. No
 * native horizontal scrolling is used, so scroll events cannot fight the
 * animation.
 *
 * Each page is provided through a named slot so the parent keeps owning every
 * page's props and events; this component only owns the strip and the gesture.
 */
const props = defineProps<{ active: MainTab }>();
const emit = defineEmits<{ select: [tab: MainTab] }>();

const strip = ref<HTMLElement | null>(null);
const rootEl = ref<HTMLElement | null>(null);
const position = ref(0); // translateX px of the strip (0 or negative)
const targetIndex = ref(0);
let stripWidth = 1;

function measure() {
  stripWidth = strip.value?.clientWidth ?? 1;
}

function setTransition(enable: boolean) {
  const el = strip.value;
  if (el) el.style.transition = enable ? "transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)" : "none";
}

function indexOf(tab: MainTab) {
  return Math.max(0, mainPagerTabs.indexOf(tab));
}

function goTo(index: number, animate: boolean) {
  targetIndex.value = Math.max(0, Math.min(mainPagerTabs.length - 1, index));
  setTransition(animate);
  position.value = -(targetIndex.value * stripWidth);
}

let settleTimer: ReturnType<typeof setTimeout> | null = null;
const FLING_PX_PER_MS = 0.35;

function settleAndPublish() {
  const delta = -position.value / stripWidth;
  const current = Math.round(delta);
  const frac = delta - current;
  let index = current;
  if (velocity <= -FLING_PX_PER_MS && frac >= -0.3) index = current + 1;
  else if (velocity >= FLING_PX_PER_MS && frac <= 0.3) index = current - 1;
  index = Math.max(0, Math.min(mainPagerTabs.length - 1, index));
  goTo(index, true);
  if (settleTimer) clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    const tab = mainPagerTabs[index];
    if (tab && tab !== props.active) emit("select", tab);
  }, 360);
}

function cancelSettle() {
  if (settleTimer) { clearTimeout(settleTimer); settleTimer = null; }
}

// --- Drag state (whole component area) ---
let dragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragStartPosition = 0;
let dragAxis: "x" | "y" | null = null;
let velocity = 0;
let lastSampleX = 0;
let lastSampleT = 0;

function startDrag(clientX: number, clientY: number) {
  dragging = true;
  dragAxis = null;
  dragStartX = clientX;
  dragStartY = clientY;
  dragStartPosition = position.value;
  velocity = 0;
  lastSampleX = clientX;
  lastSampleT = performance.now();
  cancelSettle();
  setTransition(false);
}

function moveDrag(clientX: number, clientY: number, event: { preventDefault(): void }) {
  if (!dragging) return;
  const dx = clientX - dragStartX;
  const dy = clientY - dragStartY;
  if (dragAxis === null) {
    if (Math.abs(dx) > 5 && Math.abs(dx) >= Math.abs(dy)) {
      dragAxis = "x";
      event.preventDefault();
    } else if (Math.abs(dy) > 5) {
      dragAxis = "y";
    }
  }
  if (dragAxis === "x") {
    event.preventDefault();
    position.value = dragStartPosition + dx;
    const now = performance.now();
    const dt = now - lastSampleT;
    if (dt > 0 && dt < 120) velocity = (clientX - lastSampleX) / dt;
    else velocity = 0;
    lastSampleX = clientX;
    lastSampleT = now;
  }
}

function endDrag() {
  if (!dragging) return;
  const wasHorizontal = dragAxis === "x";
  dragging = false;
  dragAxis = null;
  if (wasHorizontal) settleAndPublish();
}

// --- Event wiring ---
let unbind: (() => void) | null = null;

function onPointerDown(event: PointerEvent) {
  if (event.pointerType !== "mouse") return;
  if (event.button !== 0) return;
  startDrag(event.clientX, event.clientY);
}
function onPointerMove(event: PointerEvent) {
  if (event.pointerType !== "mouse") return;
  moveDrag(event.clientX, event.clientY, event);
}
function onPointerEnd(event: PointerEvent) {
  if (event.pointerType !== "mouse") return;
  endDrag();
}

function onTouchStart(event: TouchEvent) {
  const touch = event.touches[0];
  if (!touch) return;
  startDrag(touch.clientX, touch.clientY);
}
function onTouchMove(event: TouchEvent) {
  const touch = event.touches[0];
  if (!touch) return;
  moveDrag(touch.clientX, touch.clientY, event);
}
function onTouchEnd() {
  endDrag();
}

function bindDragEvents(el: HTMLElement) {
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

watch(() => props.active, (tab) => {
  cancelSettle();
  goTo(indexOf(tab), true);
});

let resizeObserver: ResizeObserver | null = null;
onMounted(() => {
  measure();
  goTo(indexOf(props.active), false);
  if (rootEl.value) bindDragEvents(rootEl.value);
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => {
      measure();
      goTo(targetIndex.value, false);
    });
    if (strip.value) resizeObserver.observe(strip.value);
  }
});
onBeforeUnmount(() => {
  unbind?.();
  resizeObserver?.disconnect();
  cancelSettle();
});

const stripStyle = computed(() => ({ transform: `translateX(${position.value}px)` }));
</script>

<template>
  <div ref="rootEl" class="main-pager w-full" style="touch-action: pan-y">
    <div class="relative w-full overflow-x-clip">
      <div ref="strip" class="flex w-full" :style="stripStyle">
        <section v-for="tab in mainPagerTabs" :key="tab" class="w-full shrink-0 min-w-0">
          <slot v-if="tab === 'home'" name="home" />
          <slot v-else-if="tab === 'library'" name="library" />
          <slot v-else name="search" />
        </section>
      </div>
    </div>
  </div>
</template>
