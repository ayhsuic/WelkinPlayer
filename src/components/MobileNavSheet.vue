<!--
 Copyright 2026 Atemukesu
 SPDX-License-Identifier: GPL-3.0-only
-->

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import MobileTabBar from "./MobileTabBar.vue";
import type { MainTab } from "../lib/app";

/**
 * Full-screen mobile drawer, modelled on lmusic's BottomSheetLayout: the sheet
 * is a separate layer above the playing wall. Its body renders the active tab
 * page (provided through the default slot); the bottom holds the four-tab bar.
 * When the body is scrolled to the top, a further downward drag collapses the
 * drawer back onto the wall.
 */
const props = defineProps<{ open: boolean; activeTab: MainTab }>();
const emit = defineEmits<{
  "update:open": [value: boolean];
  select: [tab: MainTab];
  close: [];
}>();
const { t } = useI18n();

function close() {
  emit("update:open", false);
  emit("close");
}

function onSelect(tab: MainTab) {
  emit("select", tab);
}

const bodyEl = ref<HTMLElement | null>(null);
let startY = 0;
let startScrollTop = 0;
let scroller: HTMLElement | null = null;

/** Walk up from the touched node to the nearest vertically scrollable ancestor. */
function nearestScroller(node: EventTarget | null): HTMLElement | null {
  let current = node as HTMLElement | null;
  while (current && current !== bodyEl.value) {
    const style = getComputedStyle(current);
    if (/auto|scroll/.test(style.overflowY) && current.scrollHeight > current.clientHeight) return current;
    current = current.parentElement;
  }
  return bodyEl.value;
}

function onTouchStart(event: TouchEvent) {
  const touch = event.touches[0];
  if (!touch) return;
  startY = touch.clientY;
  scroller = nearestScroller(event.target);
  startScrollTop = scroller?.scrollTop ?? 0;
}

function onTouchMove(event: TouchEvent) {
  if (!scroller) return;
  const touch = event.touches[0];
  if (!touch) return;
  const deltaY = touch.clientY - startY;
  // Only collapse once the scroller is already at its top; otherwise the page
  // keeps its own vertical scroll and the drag must not steal the gesture.
  if (startScrollTop <= 0 && deltaY > 12) {
    event.preventDefault();
    close();
  }
}

function onTouchEnd() {
  scroller = null;
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
        <button
          type="button"
          class="flex h-6 w-full shrink-0 items-center justify-center bg-transparent"
          :aria-label="t('controls.collapse')"
          @click="close"
        >
          <span class="h-[3px] w-10 rounded-full bg-dim/60" aria-hidden="true" />
        </button>
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
