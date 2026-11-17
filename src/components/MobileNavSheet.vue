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
 * further downward drag collapses the drawer back onto the wall — the whole
 * body participates, not just a top handle strip.
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
let startY = 0;
let startX = 0;
let scrollChain: HTMLElement[] = [];

/**
 * Collect every vertically scrollable ancestor from the touched node up to the
 * sheet. Some pages scroll their own root, others rely on the wrapper, so the
 * gesture must check the whole chain rather than a single nearest scroller.
 * Containers that do not overflow still count: their scrollTop stays 0, which
 * reads as "already at the top".
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
  scrollChain = collectScrollChain(event.target);
}

function onTouchMove(event: TouchEvent) {
  const touch = event.touches[0];
  if (!touch) return;
  const deltaY = touch.clientY - startY;
  const deltaX = touch.clientX - startX;
  // Ignore sideways swipes so a horizontal list keeps its own gesture.
  if (Math.abs(deltaX) > Math.abs(deltaY)) return;
  // A short page with no scrollable ancestor passes the pull straight to the
  // sheet; otherwise only collapse once every ancestor is already at its top,
  // mirroring lmusic's nested-scroll hand-off to the bottom sheet.
  const allAtTop = scrollChain.every((scroller) => scroller.scrollTop <= 0);
  if (deltaY > 8 && allAtTop) {
    event.preventDefault();
    close();
  }
}

function onTouchEnd() {
  scrollChain = [];
}

let unbind: (() => void) | null = null;
onMounted(() => {
  const el = bodyEl.value;
  if (!el) return;
  el.addEventListener("touchstart", onTouchStart, { passive: true });
  el.addEventListener("touchmove", onTouchMove, { passive: false });
  el.addEventListener("touchend", onTouchEnd);
  el.addEventListener("touchcancel", onTouchEnd);
  unbind = () => {
    el.removeEventListener("touchstart", onTouchStart);
    el.removeEventListener("touchmove", onTouchMove);
    el.removeEventListener("touchend", onTouchEnd);
    el.removeEventListener("touchcancel", onTouchEnd);
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
        class="fixed inset-0 z-[71] flex flex-col bg-bg md:hidden"
        role="navigation"
        aria-label="navigation"
      >
        <div class="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
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
