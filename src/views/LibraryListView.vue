<!--
 Copyright 2026 Atemukesu
 SPDX-License-Identifier: GPL-3.0-only
-->

<script setup lang="ts">
import { computed } from "vue";
import type { Component } from "vue";
import { CalendarDays, ChevronRight, Disc3, Folder, HardDriveDownload, ListMusic, Mic2, Music, Pause, Play } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import { usePlayerStore } from "../stores/player";
import type { Track } from "../stores/player";
import { initial } from "../lib/format";
import type { View } from "../lib/app";

/**
 * Library ("资料库") entry, modelled on the Mornye reference: a plain linear
 * list of category rows (playlists / artists / albums / tracks / genres /
 * folders) with accent line icons and a chevron, followed by a recently-added
 * cover rail. Rows drill into the matching classification inside the drawer.
 */
const emit = defineEmits<{
  navigate: [view: View];
}>();

const { t } = useI18n();
const player = usePlayerStore();

interface CategoryRow {
  id: View;
  titleKey: string;
  icon: Component;
}

const rows: CategoryRow[] = [
  { id: "playlists", titleKey: "nav.playlists", icon: ListMusic },
  { id: "artists", titleKey: "nav.artists", icon: Mic2 },
  { id: "albums", titleKey: "nav.albums", icon: Disc3 },
  { id: "tracks", titleKey: "nav.tracks", icon: Music },
  { id: "years", titleKey: "nav.years", icon: CalendarDays },
  { id: "folders", titleKey: "nav.folders", icon: Folder },
];

const RECENT_LIMIT = 8;

/** Tracks most recently added to the library, newest source modification first. */
const recentlyAdded = computed(() => {
  const indexed = player.tracks
    .map((track, index) => ({ track, index, time: Date.parse(track.modified ?? "") || 0 }))
    .filter((item) => item.track.path);
  indexed.sort((a, b) => (b.time - a.time) || (a.index - b.index));
  return indexed.slice(0, RECENT_LIMIT).map((item) => item.track);
});

function play(track: Track) { void player.playInQueue(player.tracks, track); }
function onCardButton(track: Track) {
  if (isActive(track)) void player.togglePlayback();
  else play(track);
}
function isActive(track: Track) { return track.id === player.currentTrack?.id; }
</script>

<template>
  <div class="w-full">
    <div class="mx-auto flex w-full max-w-6xl flex-col px-4 py-5 sm:px-6 sm:py-6">
      <!-- Header: title on the left, downloads entry on the right. -->
      <header class="flex items-center justify-between">
        <h1 class="truncate text-2xl font-black leading-none tracking-tight sm:text-3xl">{{ t("nav.collection") }}</h1>
        <button
          type="button"
          class="flex shrink-0 items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:text-fg"
          @click="emit('navigate', 'downloaded')"
        >
          <HardDriveDownload :size="16" />
          {{ t("nav.downloaded") }}
        </button>
      </header>

      <!-- Plain category list: accent line icon, title, trailing chevron, hairline dividers. -->
      <section class="mt-4 flex flex-col">
        <template v-for="(row, index) in rows" :key="row.id">
          <button
            type="button"
            class="flex items-center gap-4 py-3.5 text-left transition-colors hover:bg-surface/60"
            @click="emit('navigate', row.id)"
          >
            <component :is="row.icon" :size="26" :stroke-width="1.9" class="shrink-0 text-accent" />
            <span class="flex-1 truncate text-lg font-semibold">{{ t(row.titleKey) }}</span>
            <ChevronRight :size="18" class="shrink-0 text-dim" />
          </button>
          <div v-if="index < rows.length - 1" class="ml-[42px] h-px bg-line" />
        </template>
      </section>

      <!-- Recently added: square cover cards on a horizontal rail. -->
      <section v-if="recentlyAdded.length" class="mt-6">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-lg font-bold tracking-tight">{{ t("home.recentlyAdded") }}</h2>
          <button
            type="button"
            class="flex h-8 items-center rounded-full bg-surface px-3 text-xs font-medium text-muted transition-colors hover:text-fg"
            @click="emit('navigate', 'tracks')"
          >
            {{ t("home.allSongs") }}
          </button>
        </div>
        <div class="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
          <article
            v-for="track in recentlyAdded"
            :key="`add-${track.id}`"
            class="w-24 shrink-0 cursor-pointer"
            @click="play(track)"
          >
            <div class="ak-clip-tr relative aspect-square overflow-hidden" :style="{ backgroundColor: track.color }">
              <img v-if="track.cover" :src="track.cover" alt="" loading="lazy" decoding="async" class="absolute inset-0 h-full w-full object-cover" />
              <span v-else class="absolute inset-0 grid place-items-center text-3xl font-black text-white/90">{{ initial(track) }}</span>
              <button
                type="button"
                class="absolute bottom-2 left-2 grid h-8 w-8 place-items-center rounded-full bg-black/45 text-white transition-transform active:scale-95"
                :title="t('controls.play')"
                @click.stop="onCardButton(track)"
              >
                <Pause v-if="isActive(track) && player.isPlaying" :size="14" :stroke-width="2.2" />
                <Play v-else :size="14" :stroke-width="2.2" />
              </button>
            </div>
            <p class="mt-2 truncate text-sm font-medium">{{ track.title }}</p>
            <p class="truncate text-xs text-muted">{{ track.artist }}</p>
          </article>
        </div>
      </section>
    </div>
  </div>
</template>
