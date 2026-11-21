<!--
 Copyright 2026 Atemukesu
 SPDX-License-Identifier: GPL-3.0-only
-->

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import MobileTabBar from "./MobileTabBar.vue";
import type { MainTab } from "../lib/app";

/**
 * Full-screen mobile drawer, modelled on lmusic's BottomSheetLayout: the sheet
 * is a separate layer above the playing wall. Its body renders the active tab
 * page (provided through the default slot); the bottom holds the tab bar.
 * Once every scrollable ancestor in the touched page is pinned to its top, a
 * further downward drag collapses the drawer back onto the wall. The gesture is
 * bound to the scrolling body (not just a handle strip) and mirrors the nested
 * scroll hand-off: the list keeps scrolling first, reaching the top passes the
 * remaining pull to the sheet.
 */
const props = defineProps<{ open: boolean; activeTab: MainTab }>();
const emit = defineEmits<{
  "update:open": [value: boolean];
  select: [tab: MainTab];
  close: [];
}>();

function close() {
  emit("update:open", false);
  emit("close");
}

function onSelect(tab: MainTab) {
  emit("select", tab);
}

const bodyEl = ref<HTMLElement | null>(null);
const contentEl = ref<HTMLElement | null>(null);
let startY = 0;
let startX = 0;
let axis: "none" | "x" | "y" = "none";
let scrollChain: HTMLElement[] = [];

// Drag-to-dismiss: the sheet follows the finger once every scroller in the
// touched page is pinned to its top; on release it either slides out past the
// threshold or springs back to its resting position.
const pullOffset = ref(0);
const pullAnimated = ref(false);
const closing = ref(false);
const pullActive = ref(false);
let dragging = false;
let lastY = 0;
let lastT = 0;
let velocity = 0;
let closeTimer = 0;
let reboundTimer = 0;

const CLOSE_PX = 110;
const VELOCITY_PX_PER_MS = 0.4;

const sheetStyle = computed(() => {
  const style: Record<string, string> = { touchAction: "pan-y" };
  // Outside an active gesture leave transform/transition to the outer enter/
  // leave transition class; only take over while the finger or the settle
  // animation owns the element.
  if (!pullActive.value) return style;
  style.transform = closing.value ? "translateY(100%)" : `translateY(${pullOffset.value}px)`;
  if (pullAnimated.value || closing.value) {
    style.transition = "transform 280ms cubic-bezier(0.2,0.8,0.2,1)";
  }
  return style;
});

/**
 * Collect every vertically scrollable ancestor from the touched node up to the
 * sheet. Containers that do not overflow still count: their scrollTop stays 0,
 * which reads as "already at the top".
 */
function collectScrollChain(node: EventTarget | null): HTMLElement[] {
  const chain: HTMLElement[] = [];
  let current = node as HTMLElement | null;
  while (current && current !== bodyEl.value) {
    const style = getComputedStyle(current);
    if (/auto|scroll/.test(style.overflowY)) chain.push(current);
    current = current.parentElement;
  }
  return chain;
}

function onTouchStart(event: TouchEvent) {
  const touch = event.touches[0];
  if (!touch) return;
  startY = touch.clientY;
  startX = touch.clientX;
  axis = "none";
  scrollChain = collectScrollChain(event.target);
  dragging = false;
  closing.value = false;
  pullOffset.value = 0;
  pullAnimated.value = false;
  pullActive.value = false;
  window.clearTimeout(closeTimer);
  window.clearTimeout(reboundTimer);
  velocity = 0;
  lastY = touch.clientY;
  lastT = performance.now();
}

function onTouchMove(event: TouchEvent) {
  const touch = event.touches[0];
  if (!touch) return;
  const dy = touch.clientY - startY;
  const dx = touch.clientX - startX;

  // Lock the axis once the gesture leaves the dead zone; a sideways swipe keeps
  // its own horizontal gesture and is left alone.
  if (axis === "none") {
    if (Math.hypot(dx, dy) < 8) return;
    axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
  }
  if (axis === "x") return;

  // A short page with no scrollable ancestor passes the pull straight to the
  // sheet; otherwise only follow once every ancestor is already at its top.
  const allAtTop = scrollChain.every((scroller) => scroller.scrollTop <= 0);
  if (!allAtTop) return;

  // An upward pull hands back to the list; only a downward pull drags the sheet.
  if (dy <= 0) {
    pullOffset.value = 0;
    dragging = false;
    return;
  }

  dragging = true;
  pullActive.value = true;
  if (event.cancelable) event.preventDefault();
  // Resistance after the first 120px so the sheet does not chase the finger to
  // the bottom of the screen.
  pullOffset.value = dy <= 120 ? dy : 120 + (dy - 120) * 0.4;

  const now = performance.now();
  const dt = now - lastT;
  if (dt > 0) velocity = (touch.clientY - lastY) / dt;
  lastY = touch.clientY;
  lastT = now;
}

function onTouchEnd() {
  if (dragging) {
    const shouldClose = pullOffset.value >= CLOSE_PX || velocity > VELOCITY_PX_PER_MS;
    pullAnimated.value = true;
    if (shouldClose) {
      closing.value = true;
      closeTimer = window.setTimeout(() => close(), 280);
    } else {
      pullOffset.value = 0;
      reboundTimer = window.setTimeout(() => {
        pullActive.value = false;
        pullAnimated.value = false;
      }, 280);
    }
  }
  axis = "none";
  scrollChain = [];
  dragging = false;
}

// The component stays mounted while the section itself is `v-if="open"`, so
// the refs are null on first mount. Bind only after the section has rendered,
// and detach when it closes; otherwise the gesture never attaches at all.
let boundEls: HTMLElement[] = [];

function bindGesture() {
  detachGesture();
  const els = [bodyEl.value, contentEl.value].filter((el): el is HTMLElement => Boolean(el));
  for (const el of els) {
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
  }
  boundEls = els;
}

function detachGesture() {
  for (const el of boundEls) {
    el.removeEventListener("touchstart", onTouchStart);
    el.removeEventListener("touchmove", onTouchMove);
    el.removeEventListener("touchend", onTouchEnd);
    el.removeEventListener("touchcancel", onTouchEnd);
  }
  boundEls = [];
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      // Reset any transient drag state left over from the previous close:
      // otherwise a stale `closing`/`pullActive` inline transform pins the
      // sheet to its exit position and only an empty transparent layer shows.
      window.clearTimeout(closeTimer);
      window.clearTimeout(reboundTimer);
      closing.value = false;
      pullActive.value = false;
      pullAnimated.value = false;
      pullOffset.value = 0;
      dragging = false;
      velocity = 0;
      await nextTick();
      bindGesture();
    } else {
      detachGesture();
    }
  }
);

onMounted(() => {
  if (props.open) void nextTick().then(bindGesture);
});
onBeforeUnmount(() => {
  window.clearTimeout(closeTimer);
  window.clearTimeout(reboundTimer);
  detachGesture();
});
</script>

<template>
  <Teleport to="body">
    <Transition name="nav-sheet">
      <section
        v-if="open"
        ref="bodyEl"
        class="fixed inset-0 z-[71] flex flex-col bg-bg pt-[env(safe-area-inset-top)] md:hidden"
        :style="sheetStyle"
        role="navigation"
        aria-label="navigation"
      >
        <div
          ref="contentEl"
          class="relative min-h-0 flex-1 overflow-y-auto overscroll-contain"
          style="touch-action: pan-y; padding-bottom: calc(env(safe-area-inset-bottom) + 84px)"
        >
          <slot />
        </div>
        <MobileTabBar :active="props.activeTab" @select="onSelect" />
      </section>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Container for the sheet's cqw-based header/tab-bar scaling. */
section {
  container-type: inline-size;
}

.nav-sheet-enter-active,
.nav-sheet-leave-active {
  transition: transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.nav-sheet-enter-from,
.nav-sheet-leave-to {
  transform: translateY(100%);
}
</style>
