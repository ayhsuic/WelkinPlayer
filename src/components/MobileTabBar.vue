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
const props = defineProps<{ active: MainTab }>();
const emit = defineEmits<{ select: [tab: MainTab] }>();
const { t } = useI18n();

function onSelect(tab: MainTab) {
  emit("select", tab);
}
</script>

<template>
  <nav
    class="tab-bar no-scrollbar"
    role="tablist"
    :aria-label="t('nav.menu')"
    :style="{ paddingBottom: 'env(safe-area-inset-bottom)' }"
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
      <component :is="item.icon" class="tab-bar-icon" :size="21" :stroke-width="2" />
      <span v-if="props.active === item.id" class="tab-bar-label">{{ t(item.labelKey) }}</span>
    </button>
  </nav>
</template>

<style scoped>
.tab-bar {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  height: 52px;
  background: color-mix(in srgb, var(--surface) 95%, transparent);
  border-top: 1px solid var(--line);
}

.tab-bar-item {
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

.tab-bar-item.is-active {
  color: var(--accent);
}

.tab-bar-icon {
  transition: transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1);
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
