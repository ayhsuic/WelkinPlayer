<!--
 Copyright 2026 Atemukesu
 SPDX-License-Identifier: GPL-3.0-only
-->

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { mainNavTabs, type MainTab } from "../lib/app";

/**
 * Bottom tab bar inside the mobile drawer, modelled on lmusic's
 * `NavigateTabBar`: an evenly split row, each slot carrying an icon and —
 * only when selected — a short label. Selected tint is the accent colour,
 * unselected is a dimmed foreground; corners stay square.
 */
const props = defineProps<{ active: MainTab; inline?: boolean }>();
const emit = defineEmits<{ select: [tab: MainTab] }>();
const { t } = useI18n();

function onSelect(tab: MainTab) {
  emit("select", tab);
}
</script>

<template>
  <nav
    class="tab-bar no-scrollbar"
    :class="{ 'tab-bar--inline': props.inline }"
    role="tablist"
    :aria-label="t('nav.menu')"
  >
    <button
      v-for="item in mainNavTabs"
      :key="item.id"
      type="button"
      role="tab"
      class="tab-bar-item"
      :class="{ 'is-active': props.active === item.id }"
      :aria-selected="props.active === item.id"
      :aria-label="t(item.labelKey)"
      @click="onSelect(item.id)"
    >
      <span class="item-highlight" aria-hidden="true" />
      <component :is="item.icon" class="tab-bar-icon" :size="21" :stroke-width="2" />
      <span v-if="props.active === item.id" class="tab-bar-label">{{ t(item.labelKey) }}</span>
    </button>
  </nav>
</template>

<style scoped>
.tab-bar {
  position: absolute;
  left: 24px;
  right: 24px;
  bottom: calc(env(safe-area-inset-bottom) + 12px);
  display: flex;
  flex-direction: row;
  align-items: stretch;
  height: 56px;
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  border: 1px solid var(--line);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.3);
  clip-path: polygon(0 0, calc(100% - var(--cut)) 0, 100% var(--cut), 100% 100%, var(--cut) 100%, 0 calc(100% - var(--cut)));
}

/* Flow layout for the landscape rail: sits in the flex column instead of an
   absolutely positioned overlay, so it always renders at the pane bottom. */
.tab-bar--inline {
  position: relative;
  left: auto;
  right: auto;
  bottom: auto;
  width: 100%;
  margin: 0;
  background: var(--surface);
}

.tab-bar-item {
  position: relative;
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: color-mix(in srgb, var(--fg) 40%, transparent);
  transition: color 200ms ease, transform 200ms ease;
}

.item-highlight {
  position: absolute;
  inset: 0;
  opacity: 0;
  transition: opacity 200ms ease;
  pointer-events: none;
}

.item-highlight::before {
  content: "";
  position: absolute;
  inset: 0;
  background: var(--accent);
  clip-path: polygon(0 0, calc(100% - var(--cut)) 0, 100% var(--cut), 100% 100%, var(--cut) 100%, 0 calc(100% - var(--cut)));
}

.item-highlight::after {
  content: "";
  position: absolute;
  inset: 0;
  background:
    linear-gradient(color-mix(in srgb, var(--accent) 50%, #fff), color-mix(in srgb, var(--accent) 50%, #fff)) top left / 100% 6px no-repeat,
    linear-gradient(color-mix(in srgb, var(--accent) 50%, #fff), color-mix(in srgb, var(--accent) 50%, #fff)) top left / 6px 100% no-repeat;
  clip-path: polygon(0 0, calc(100% - var(--cut)) 0, 100% var(--cut), 100% 100%, var(--cut) 100%, 0 calc(100% - var(--cut)));
  pointer-events: none;
}

.tab-bar-item.is-active {
  color: var(--accent-fg);
}

.tab-bar-item.is-active .item-highlight {
  opacity: 1;
}

.tab-bar-icon,
.tab-bar-label {
  position: relative;
  z-index: 1;
}

.tab-bar-icon {
  transition: transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.tab-bar-item.is-active .tab-bar-icon,
.tab-bar-item.is-active .tab-bar-label {
  color: var(--accent-fg);
}

.tab-bar-item.is-active .tab-bar-icon {
  transform: scale(1.1);
}

.tab-bar-label {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.04em;
  line-height: 1;
  color: var(--fg);
}
</style>
