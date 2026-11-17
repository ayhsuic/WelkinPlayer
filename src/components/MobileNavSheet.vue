<!--
 Copyright 2026 Atemukesu
 SPDX-License-Identifier: GPL-3.0-only
-->

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import MobileTabBar from "./MobileTabBar.vue";
import type { MainTab } from "../lib/app";

/**
 * Full-screen mobile drawer, modelled on lmusic's BottomSheetLayout: the sheet
 * is a separate layer above the playing wall. Its body renders the active tab
 * page (provided through the default slot); the bottom holds the four-tab bar.
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
  // sheet; otherwise only collapse once every ancestor is already at its top.
  const allAtTop = scrollChain.every((scroller) => scroller.scrollTop <= 0);
  if (dy > 10 && allAtTop) {
    if (event.cancelable) event.preventDefault();
    close();
  }
}

function onTouchEnd() {
  axis = "none";
  scrollChain = [];
}

let unbind: (() => void) | null = null;
onMounted(() => {
  const els = [bodyEl.value, contentEl.value].filter((el): el is HTMLElement => Boolean(el));
  for (const el of els) {
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
  }
  unbind = () => {
    for (const el of els) {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    }
  };
});
onBeforeUnmount(() => unbind?.());
</script>

<template>
  <Teleport to="body">
    <Transition name="nav-sheet">
      <section
        v-if="open"
        ref="bodyEl"
        class="fixed inset-0 z-[71] flex flex-col bg-bg pt-[env(safe-area-inset-top)] md:hidden"
        style="touch-action: pan-y"
        role="navigation"
        aria-label="navigation"
      >
        <div
          ref="contentEl"
          class="relative min-h-0 flex-1 overflow-y-auto overscroll-contain"
          style="touch-action: pan-y"
        >
          <slot />
        </div>
        <MobileTabBar :active="props.activeTab" @select="onSelect" />
      </section>
    </Transition>
  </Teleport>
</template>

<style scoped>
.nav-sheet-enter-active,
.nav-sheet-leave-active {
  transition: transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.nav-sheet-enter-from,
.nav-sheet-leave-to {
  transform: translateY(100%);
}
</style>
