<!--
 Copyright 2026 Atemukesu
 SPDX-License-Identifier: GPL-3.0-only
-->

<script setup lang="ts">
import { computed, ref } from "vue";
import type { Component } from "vue";
import { CalendarDays, ChevronRight, HardDriveDownload, ListMusic, Mic2, Music, Server } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import { usePlayerStore } from "../stores/player";
import type { Track } from "../stores/player";
import { groupTracks, isUnknownGroup, type GroupKind } from "../lib/grouping";
import { useCollapsibleHeader } from "../composables/useCollapsibleHeader";
import type { View, MainTab } from "../lib/app";
import MainNavTabs from "../components/MainNavTabs.vue";

/**
 * Library ("媒体库") page: a category row list on top, followed by the full
 * album grid in the home-page cover-wall style. The album placeholder entry
 * card is gone — every album in the library is shown directly in the grid.
 */
const emit = defineEmits<{
  navigate: [view: View];
  openGroup: [kind: GroupKind, key: string];
  selectTab: [tab: MainTab];
}>();

const { t } = useI18n();
const player = usePlayerStore();

/** Collapsing sticky header, mirroring the home page. */
const rootEl = ref<HTMLElement | null>(null);
const { collapsed } = useCollapsibleHeader(rootEl);

interface CategoryRow {
  id: View;
  titleKey: string;
  icon: Component;
}

const rows: CategoryRow[] = [
  { id: "playlists", titleKey: "nav.playlists", icon: ListMusic },
  { id: "artists", titleKey: "nav.artists", icon: Mic2 },
  { id: "tracks", titleKey: "nav.tracks", icon: Music },
  { id: "years", titleKey: "nav.years", icon: CalendarDays },
  { id: "sources", titleKey: "nav.sources", icon: Server },
];

interface AlbumCard {
  key: string;
  name: string;
  count: number;
  coverTrack?: Track;
  time: number;
}

/** Every album in the library, newest modification first; no count cap. */
const albums = computed<AlbumCard[]>(() => {
  const list = groupTracks(player.tracks, "albums").map((group) => {
    const coverTrack = group.tracks.find((track) => track.cover) ?? group.tracks[0];
    const latest = group.tracks.slice().sort(
      (a, b) => (Date.parse(b.modified ?? "") || 0) - (Date.parse(a.modified ?? "") || 0),
    )[0];
    return {
      key: group.key,
      name: isUnknownGroup(group.key) ? t("library.collections.unknownAlbum") : group.key,
      count: group.tracks.length,
      coverTrack,
      time: Date.parse(latest?.modified ?? "") || 0,
    };
  });
  list.sort((a, b) => b.time - a.time);
  return list;
});

function openAlbum(key: string) {
  emit("openGroup", "albums", key);
}
</script>

<template>
  <div ref="rootEl" class="w-full">
    <div class="mx-auto flex w-full max-w-6xl flex-col px-4 py-5 sm:px-6 sm:py-6">
      <!-- Sticky header: plain-text tab row on the left, download entry on the right. -->
      <header
        class="sticky top-0 z-20 -mx-4 flex items-center justify-between gap-3 px-4 transition-[padding,background-color,border-color] duration-200 sm:-mx-6 sm:px-6"
        :class="collapsed ? 'border-b border-line bg-bg/95 py-2 backdrop-blur' : 'border-b border-transparent bg-transparent py-1'"
      >
        <MainNavTabs active="library" :collapsed="collapsed" @select="(tab) => emit('selectTab', tab)" />
        <button
          type="button"
          class="ak-clip flex shrink-0 items-center gap-1.5 border border-line bg-surface px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:text-fg"
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

      <!-- Full album grid: home-page cover cards, every album shown directly. -->
      <section v-if="albums.length" class="mt-6">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-lg font-bold tracking-tight">{{ t("nav.albums") }}</h2>
          <span class="text-xs text-muted">{{ t("library.collections.albumCount", { count: albums.length }) }}</span>
        </div>
        <div class="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3">
          <article
            v-for="album in albums"
            :key="album.key"
            class="album-grid-card group flex flex-col cursor-pointer"
            @click="openAlbum(album.key)"
          >
            <div class="flex w-full justify-start">
              <div class="home-card-cover ak-clip-tr relative aspect-square w-full overflow-hidden" :style="{ backgroundColor: album.coverTrack?.color ?? 'var(--accent)' }">
                <img v-if="album.coverTrack?.cover" :src="album.coverTrack.cover" alt="" loading="lazy" decoding="async" class="absolute inset-0 h-full w-full object-cover" />
                <span v-else class="home-card-initial absolute inset-0 grid place-items-center font-black text-white/90">{{ album.name.charAt(0) }}</span>
              </div>
            </div>
            <div class="home-mt-card w-full min-w-0">
              <p class="album-grid-card__title truncate font-medium">{{ album.name }}</p>
              <p class="album-grid-card__artist truncate text-muted">{{ t("library.collections.trackCount", { count: album.count }) }}</p>
            </div>
          </article>
        </div>
      </section>

      <section v-else class="ak-frame mt-8 grid shrink-0 place-items-center gap-4 border border-dashed border-line bg-surface/50 px-6 py-20 text-center">
        <Music :size="36" class="text-dim" />
        <p class="max-w-md text-sm text-muted">{{ t("library.collections.empty") }}</p>
      </section>
    </div>
  </div>
</template>
