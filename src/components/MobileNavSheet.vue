<!--
 Copyright 2026 Atemukesu
 SPDX-License-Identifier: GPL-3.0-only
-->

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import MobileTabBar from "./MobileTabBar.vue";
import type { MainTab } from "../lib/app";

/**
 * Mobile drawer chrome, modelled on lmusic's bottom-sheet + NavigationSmartBar:
 * the sheet slides up over the playing wall; its bottom holds the four-tab bar
 * (home / library / settings / search). The page itself keeps rendering in
 * the underlying main view, so this component only owns the grab handle and
 * the tab bar — no blocking backdrop panel.
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
</script>

<template>
  <Teleport to="body">
    <Transition name="nav-sheet">
      <section
        v-if="open"
        class="fixed inset-x-0 bottom-0 z-[71] md:hidden"
        role="navigation"
        aria-label="navigation"
      >
        <button
          type="button"
          class="mx-auto flex h-6 w-full items-center justify-center bg-transparent"
          :aria-label="t('controls.collapse')"
          @click="close"
        >
          <span class="h-[3px] w-10 rounded-full bg-dim/60" aria-hidden="true" />
        </button>
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
