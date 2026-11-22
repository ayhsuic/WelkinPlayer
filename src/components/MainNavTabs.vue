<!--
 Copyright 2026 Atemukesu
 SPDX-License-Identifier: GPL-3.0-only
-->

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { mainNavTabs, type MainTab } from "../lib/app";

/**
 * Top-bar primary entries (home / library / search), the replacement for the
 * old bottom tab bar. Plain text tabs in a row: no icon, no border, no clipped
 * chip background. The active tab is enlarged on an accent pill; inactive
 * entries stay dimmed. `collapsed` mirrors the pinned header state: once the
 * page scrolls up and the header tucks into its compact bar, the tabs shrink
 * along with it.
 */
const props = defineProps<{ active: MainTab; collapsed?: boolean }>();
const emit = defineEmits<{ select: [tab: MainTab] }>();
const { t } = useI18n();

function onSelect(tab: MainTab) {
  emit("select", tab);
}
</script>

<template>
  <nav
    class="main-nav-tabs"
    role="tablist"
    :class="{ 'is-collapsed': props.collapsed }"
    :aria-label="t('nav.menu')"
  >
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
      <span class="main-nav-tab__label">{{ t(item.labelKey) }}</span>
    </button>
  </nav>
</template>

<style scoped>
.main-nav-tabs {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: calc(var(--cw) * 0.012 * var(--rail-scale, 1));
}

.main-nav-tab {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: calc(var(--ch, 100vh) * 0.011 * var(--rail-scale, 1)) calc(var(--cw) * 0.03 * var(--rail-scale, 1));
  border: 0;
  background: transparent;
  border-radius: 999px;
  color: var(--dim);
  cursor: pointer;
  transition: color 200ms ease, background-color 200ms ease, transform 200ms ease;
}

.main-nav-tab__label {
  font-size: min(calc(var(--cw) * 0.035 * var(--rail-scale, 1)), calc(var(--ch, 100vh) * 0.027 * var(--rail-scale, 1)));
  font-weight: 500;
  letter-spacing: 0.02em;
  line-height: 1.2;
  white-space: nowrap;
}

.main-nav-tab.is-active {
  color: var(--accent-fg);
  background: var(--accent);
}

.main-nav-tab.is-active .main-nav-tab__label {
  font-weight: 700;
  font-size: min(calc(var(--cw) * 0.039 * var(--rail-scale, 1)), calc(var(--ch, 100vh) * 0.03 * var(--rail-scale, 1)));
}

/* Pinned compact header: tabs shrink together with the title and avatar. */
.main-nav-tabs.is-collapsed .main-nav-tab__label {
  font-size: min(calc(var(--cw) * 0.032 * var(--rail-scale, 1)), calc(var(--ch, 100vh) * 0.025 * var(--rail-scale, 1)));
}

.main-nav-tabs.is-collapsed .main-nav-tab.is-active .main-nav-tab__label {
  font-size: min(calc(var(--cw) * 0.035 * var(--rail-scale, 1)), calc(var(--ch, 100vh) * 0.027 * var(--rail-scale, 1)));
}
</style>
