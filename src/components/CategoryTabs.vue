<!--
 Copyright 2026 Atemukesu
 SPDX-License-Identifier: GPL-3.0-only
-->

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { libraryNavItems, type View } from "../lib/app";

defineProps<{ active: View }>();
const emit = defineEmits<{ navigate: [view: View] }>();
const { t } = useI18n();
</script>

<template>
  <nav class="flex shrink-0 items-stretch border-b border-line bg-surface" role="tablist" :aria-label="t('nav.categories')">
    <button v-for="item in libraryNavItems" :key="item.id" type="button" role="tab" class="relative flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 px-1 text-[12px] font-semibold uppercase tracking-[0.08em] transition-colors" :class="active === item.id ? 'text-accent' : 'text-muted hover:text-fg'" :aria-selected="active === item.id" @click="emit('navigate', item.id)">
      <component :is="item.icon" :size="15" :stroke-width="1.8" class="shrink-0" />
      <span class="truncate">{{ t(item.labelKey) }}</span>
      <span v-if="active === item.id" class="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent"></span>
    </button>
  </nav>
</template>
