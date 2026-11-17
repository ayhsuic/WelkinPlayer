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
let scrollChain: HTMLElement[] = [];

/**
 * Collect every vertically scrollable ancestor from the touched node up to the
 * sheet. Some pages scroll their own root, others rely on the wrapper, so the
 * gesture must check the whole chain rather than a single nearest scroller.
 */
function collectScrollChain(node: EventTarget | null): HTMLElement[] {
  const chain: HTMLElement[] = [];
  let current = node as HTMLElement | null;
  while (current && current !== bodyEl.value) {
    const style = getComputedStyle(current);
    if (/auto|scroll/.test(style.overflowY) && current.scrollHeight > current.clientHeight) {
      chain.push(current);
    }
    current = current.parentElement;
  }
  return chain;
}

function onTouchStart(event: TouchEvent) {
  const touch = event.touches[0];
  if (!touch) return;
  startY = touch.clientY;
  scrollChain = collectScrollChain(event.target);
}

function onTouchMove(event: TouchEvent) {
  if (!scrollChain.length) return;
  const touch = event.touches[0];
  if (!touch) return;
  const deltaY = touch.clientY - startY;
  // A downward drag only collapses the sheet once every scrollable ancestor in
  // the chain is already pinned to its top; this mirrors lmusic's nested-scroll
  // hand-off: the list keeps scrolling first, and reaching the top passes the
  // further pull to the sheet. Any ancestor still scrolled down keeps its own
  // native scroll and the gesture is left alone.
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
