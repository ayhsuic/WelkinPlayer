<!--
 Copyright 2026 Atemukesu
 SPDX-License-Identifier: GPL-3.0-only
-->

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { mainNavTabs, type MainTab } from "../lib/app";

/**
 * Top-bar primary entries (home / library / search), the replacement for the
 * old bottom tab bar. Selected entry tints accent and shows its short label;
 * unselected entries stay dimmed. Sits beside the settings avatar in each
 * page header.
 */
const props = defineProps<{ active: MainTab }>();
const emit = defineEmits<{ select: [tab: MainTab] }>();
const { t } = useI18n();

function onSelect(tab: MainTab) {
  emit("select", tab);
}
</script>

<template>
  <nav class="main-nav-tabs" role="tablist" :aria-label="t('nav.menu')">
    <button
      v-for="item in mainNavTabs"
      :key="item.id"
      type="button"
      role="tab"
      class="main-nav-tab"
      :class="{ 'is-active': props.active === item.id }"
      :aria-selected="props.active === item.id"
      :aria-label="t(item.labelKey)"
      @click="onSelect(item.id)"
    >
      <component :is="item.icon" class="main-nav-tab__icon" :size="19" :stroke-width="2" />
      <span v-if="props.active === item.id" class="main-nav-tab__label">{{ t(item.labelKey) }}</span>
    </button>
  </nav>
</template>

<style scoped>
.main-nav-tabs {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: calc(var(--cw) * 0.017 * var(--rail-scale, 1));
}

.main-nav-tab {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: calc(var(--cw) * 0.014 * var(--rail-scale, 1));
  padding: calc(var(--ch, 100vh) * 0.012 * var(--rail-scale, 1)) calc(var(--cw) * 0.028 * var(--rail-scale, 1));
  border: 1px solid var(--line);
  background: var(--surface);
  color: color-mix(in srgb, var(--fg) 40%, transparent);
  cursor: pointer;
  clip-path: polygon(0 0, calc(100% - var(--cut)) 0, 100% var(--cut), 100% 100%, var(--cut) 100%, 0 calc(100% - var(--cut)));
  transition: color 200ms ease, background-color 200ms ease;
}

.main-nav-tab.is-active {
  color: var(--accent-fg);
  background: var(--accent);
}

.main-nav-tab__icon {
  flex-shrink: 0;
}

.main-nav-tab__label {
  font-size: min(calc(var(--cw) * 0.033 * var(--rail-scale, 1)), calc(var(--ch, 100vh) * 0.025 * var(--rail-scale, 1)));
  font-weight: 500;
  letter-spacing: 0.04em;
  line-height: 1;
  white-space: nowrap;
}
</style>
