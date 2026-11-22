<!--
 Copyright 2026 Atemukesu
 SPDX-License-Identifier: GPL-3.0-only
-->

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import type { MainTab } from "../lib/app";
import MainNavTabs from "./MainNavTabs.vue";
import { useCollapsibleHeader } from "../composables/useCollapsibleHeader";

/**
 * Primary destinations (home / library / search) stacked in place: switching
 * tabs cross-fades the active page in and out, with no horizontal strip drag.
 * Each page still scrolls inside its own section; the pinned top bar follows
 * whichever section is scrolling.
 *
 * Every page is provided through a named slot so the parent keeps owning each
 * page's props and events; this component only owns the shared tab row and the
 * page transition.
 */
const props = defineProps<{ active: MainTab }>();
const emit = defineEmits<{ select: [tab: MainTab] }>();

const rootEl = ref<HTMLElement | null>(null);
/** Shared pinned top bar: the tab row lives once above the pages and shrinks
 *  together with the ancestor list's collapsed header state. */
const { collapsed } = useCollapsibleHeader(rootEl);

/** Each page slot scrolls inside its own section; the pinned top bar follows
 *  whichever section is scrolling. Scroll events do not bubble, so capture on
 *  the root to catch the section's own scroll. */
const HEADER_PEEK_PX = 12;
function onInnerScroll(event: Event) {
  const scroller = event.target as HTMLElement | null;
  collapsed.value = (scroller?.scrollTop ?? 0) > HEADER_PEEK_PX;
}

onMounted(() => {
  rootEl.value?.addEventListener("scroll", onInnerScroll, true);
});
onBeforeUnmount(() => {
  rootEl.value?.removeEventListener("scroll", onInnerScroll, true);
});
</script>

<template>
  <div ref="rootEl" class="main-pager flex h-full w-full flex-col">
    <!-- Shared top bar: one plain-text tab row above the pages, shared by all
         three pages. -->
    <header
      class="main-pager__topbar flex shrink-0 items-center justify-between gap-2 px-4 transition-[padding,background-color,border-color] duration-200 sm:px-6"
      :class="[collapsed ? 'border-b border-line bg-bg/95 backdrop-blur' : 'border-b border-transparent bg-transparent']"
    >
      <MainNavTabs :active="props.active" :collapsed="collapsed" @select="(tab) => emit('select', tab)" />
    </header>
    <div class="relative min-h-0 flex-1">
      <Transition name="page-fade" mode="out-in">
        <section :key="props.active" class="h-full min-h-0 overflow-y-auto overscroll-contain">
          <slot v-if="props.active === 'home'" name="home" />
          <slot v-else-if="props.active === 'library'" name="library" />
          <slot v-else name="search" />
        </section>
      </Transition>
    </div>
  </div>
</template>
