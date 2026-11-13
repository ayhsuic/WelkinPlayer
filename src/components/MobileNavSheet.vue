<!--
 Copyright 2026 Atemukesu
 SPDX-License-Identifier: GPL-3.0-only
-->

<script setup lang="ts">
import { ChevronDown, HeartHandshake, Music2, Settings2 } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import { downloadNavItems, libraryNavItems, primaryNavItems, systemNavItems } from "../lib/app";
import type { View } from "../lib/app";

/**
 * The bottom sheet the navigation strip pulls up. It lists the same entries the
 * desktop sidebar shows, but comes from the bottom of the screen so it belongs
 * to the strip's upward gesture rather than to a hamburger in the header.
 */
const props = defineProps<{ open: boolean; activeView: View }>();
const emit = defineEmits<{ "update:open": [value: boolean]; navigate: [view: View] }>();
const { t } = useI18n();

function close() {
  emit("update:open", false);
}

function go(view: View) {
  emit("update:open", false);
  emit("navigate", view);
}

/** Highlight only the view itself; the sheet does not know drill-down filters. */
function isActive(view: View): boolean {
  return props.activeView === view;
}
</script>

<template>
  <Teleport to="body">
    <Transition name="nav-sheet-backdrop">
      <div v-if="open" class="fixed inset-0 z-[70] bg-black/40 md:hidden" @pointerdown="close"></div>
    </Transition>
    <Transition name="nav-sheet">
      <section
        v-if="open"
        class="nav-sheet fixed inset-x-0 bottom-0 z-[71] flex max-h-[72vh] flex-col overflow-y-auto overscroll-contain border-t border-line bg-surface md:hidden"
        role="dialog"
        aria-modal="true"
        aria-label="navigation"
        :style="{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }"
      >
        <div class="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-5 py-3">
          <span class="flex items-center gap-2">
            <span class="nav-sheet-logo grid h-7 w-7 shrink-0 place-items-center bg-accent text-accent-fg" aria-hidden="true"><Music2 :size="14" :stroke-width="2.2" /></span>
            <span class="text-sm font-black uppercase tracking-[0.25em] leading-none">Welkin</span>
          </span>
          <button type="button" class="grid h-9 w-9 place-items-center text-muted transition-colors hover:text-fg" :aria-label="t('controls.collapse')" @click="close">
            <ChevronDown :size="18" :stroke-width="1.8" />
          </button>
        </div>
        <nav class="flex flex-col gap-px p-3">
          <button v-for="item in primaryNavItems" :key="item.id" type="button" class="relative flex h-11 items-center gap-3 border border-transparent px-3 text-left text-[13px] font-semibold uppercase tracking-[0.15em] transition-colors" :class="isActive(item.id) ? 'ak-select' : 'text-muted ak-hover hover:text-fg'" @click="go(item.id)"><component :is="item.icon" :size="18" :stroke-width="1.8" /><span class="truncate">{{ t(item.labelKey) }}</span></button>
        </nav>
        <div class="mx-3 border-t border-line"></div>
        <nav class="flex flex-col gap-px p-3">
          <button v-for="item in libraryNavItems" :key="item.id" type="button" class="relative flex h-11 items-center gap-3 border border-transparent px-3 text-left text-[13px] font-semibold uppercase tracking-[0.15em] transition-colors" :class="isActive(item.id) ? 'ak-select' : 'text-muted ak-hover hover:text-fg'" @click="go(item.id)"><component :is="item.icon" :size="18" :stroke-width="1.8" /><span class="truncate">{{ t(item.labelKey) }}</span></button>
        </nav>
        <div class="mx-3 border-t border-line"></div>
        <nav class="flex flex-col gap-px p-3">
          <button v-for="item in systemNavItems" :key="item.id" type="button" class="relative flex h-11 items-center gap-3 border border-transparent px-3 text-left text-[13px] font-semibold uppercase tracking-[0.15em] transition-colors" :class="isActive(item.id) ? 'ak-select' : 'text-muted ak-hover hover:text-fg'" @click="go(item.id)"><component :is="item.icon" :size="18" :stroke-width="1.8" /><span class="truncate">{{ t(item.labelKey) }}</span></button>
        </nav>
        <div class="mx-3 border-t border-line"></div>
        <nav class="flex flex-col gap-px p-3">
          <button v-for="item in downloadNavItems" :key="item.id" type="button" class="relative flex h-11 items-center gap-3 border border-transparent px-3 text-left text-[13px] font-semibold uppercase tracking-[0.15em] transition-colors" :class="isActive(item.id) ? 'ak-select' : 'text-muted ak-hover hover:text-fg'" @click="go(item.id)"><component :is="item.icon" :size="18" :stroke-width="1.8" /><span class="truncate">{{ t(item.labelKey) }}</span></button>
        </nav>
        <div class="mx-3 border-t border-line"></div>
        <nav class="flex flex-col gap-px p-3">
          <button type="button" class="relative flex h-11 items-center gap-3 border border-transparent px-3 text-left text-[13px] font-semibold uppercase tracking-[0.15em] transition-colors" :class="isActive('settings') ? 'ak-select' : 'text-muted ak-hover hover:text-fg'" @click="go('settings')"><Settings2 :size="18" :stroke-width="1.8" /><span class="truncate">{{ t("nav.settings") }}</span></button>
          <button type="button" class="relative flex h-11 items-center gap-3 border border-transparent px-3 text-left text-[13px] font-semibold uppercase tracking-[0.15em] transition-colors" :class="isActive('sponsor') ? 'ak-select' : 'text-muted ak-hover hover:text-fg'" @click="go('sponsor')"><HeartHandshake :size="18" :stroke-width="1.8" /><span class="truncate">{{ t("nav.sponsor") }}</span></button>
        </nav>
      </section>
    </Transition>
  </Teleport>
</template>

<style scoped>
.nav-sheet {
  /* A hairline grab handle, so the sheet reads as pulled rather than popped. */
  background-image: linear-gradient(to bottom, color-mix(in srgb, var(--fg) 18%, transparent) 0 2px, transparent 2px);
  background-repeat: no-repeat;
  background-position: 50% 8px;
  background-size: 40px 2px;
}

.nav-sheet-logo {
  clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px));
}

.nav-sheet-enter-active,
.nav-sheet-leave-active {
  transition: transform 300ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.nav-sheet-enter-from,
.nav-sheet-leave-to {
  transform: translateY(100%);
}

.nav-sheet-backdrop-enter-active,
.nav-sheet-backdrop-leave-active {
  transition: opacity 220ms ease;
}

.nav-sheet-backdrop-enter-from,
.nav-sheet-backdrop-leave-to {
  opacity: 0;
}
</style>
