<!--
 Copyright 2026 Atemukesu
 SPDX-License-Identifier: GPL-3.0-only
-->

<script setup lang="ts">
import { computed } from "vue";
import { VList } from "virtua/vue";
import { ListOrdered, LoaderCircle } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import { usePlayerStore } from "../stores/player";
import { coverPending, initial, pad } from "../lib/format";
import { requestMeta } from "../directives/requestMeta";

const vRequestMeta = requestMeta;
const { t } = useI18n();
const player = usePlayerStore();

const QUEUE_ROW_HEIGHT = 52;

/** The full queue, including the current track and everything before/after it. */
const allQueue = computed(() => player.queue);

function playFromQueue(index: number) {
  const track = player.queue[index];
  if (track) player.selectTrack(track);
}
</script>

<template>
  <div class="h-full w-full overflow-y-auto">
    <div class="mx-auto flex w-full max-w-6xl flex-col px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <header class="shrink-0 border-b border-line pb-6">
        <p class="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.35em] text-accent"><span class="h-2 w-2 bg-accent"></span>{{ t("nowPlaying.queue") }}</p>
        <h1 class="mt-4 truncate text-4xl font-black leading-none tracking-tight sm:text-5xl">{{ t("nav.queue") }}</h1>
        <p class="mt-3 text-sm text-muted">{{ t("nowPlaying.nextUp", { count: player.queue.length }) }}</p>
      </header>

      <div v-if="player.queue.length === 0" class="ak-frame mt-8 grid place-items-center gap-4 border border-dashed border-line bg-surface/50 px-6 py-20 text-center">
        <ListOrdered :size="36" class="text-dim" />
        <p class="max-w-md text-sm text-muted">{{ t("nowPlaying.emptyQueue") }}</p>
      </div>

      <template v-else>
        <div v-if="player.currentTrack" class="mt-6 flex items-center gap-3 border border-line bg-surface p-4">
          <span class="grid h-12 w-12 shrink-0 place-items-center overflow-hidden text-lg font-black text-white/90" :style="{ backgroundColor: player.currentTrack.color }">
            <img v-if="player.currentTrack.cover" :src="player.currentTrack.cover" alt="" decoding="async" class="h-full w-full object-cover" />
            <LoaderCircle v-else-if="coverPending(player.currentTrack)" :size="16" :stroke-width="2" class="animate-spin" />
            <template v-else>{{ initial(player.currentTrack) }}</template>
          </span>
          <span class="min-w-0 flex-1">
            <small class="font-mono text-[10px] uppercase tracking-[0.3em] text-dim">{{ t("nowPlaying.now") }}</small>
            <strong class="block truncate text-sm font-semibold text-accent">{{ player.currentTrack.title }}</strong>
            <small class="block truncate text-[12px] text-muted">{{ player.currentTrack.artist }}</small>
          </span>
        </div>

        <div class="mt-4 h-[65vh]">
          <VList :data="allQueue" :item-size="QUEUE_ROW_HEIGHT">
            <template #default="{ item: track, index }">
              <button
                type="button"
                v-request-meta="track"
                class="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-fg/5"
                :class="index === player.queueIndex ? 'ak-select' : ''"
                @click="playFromQueue(index)"
              >
                <span class="w-6 shrink-0 text-right font-mono text-[11px] tabular-nums text-dim">{{ pad(index + 1) }}</span>
                <span class="grid h-9 w-9 shrink-0 place-items-center overflow-hidden text-sm font-black text-white/90" :style="{ backgroundColor: track.color }">
                  <img v-if="track.cover" :src="track.cover" alt="" loading="lazy" decoding="async" class="h-full w-full object-cover" />
                  <LoaderCircle v-else-if="coverPending(track)" :size="14" :stroke-width="2" class="animate-spin" />
                  <template v-else>{{ initial(track) }}</template>
                </span>
                <span class="min-w-0 flex-1">
                  <strong class="block truncate text-[12px] font-semibold">{{ track.title }}</strong>
                  <small class="block truncate text-[11px] text-muted">{{ track.artist }}</small>
                </span>
              </button>
            </template>
          </VList>
        </div>
      </template>
    </div>
  </div>
</template>
