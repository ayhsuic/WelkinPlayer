<!--
 Copyright 2026 Atemukesu
 SPDX-License-Identifier: GPL-3.0-only
-->

<script setup lang="ts">
import { computed } from "vue";
import type { Component } from "vue";
import { CalendarDays, ChevronRight, Disc3, Folder, Heart, ListMusic, Mic2, Music, Plus, Tag } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import { usePlayerStore } from "../stores/player";
import { useProfileStore, tracksForPaths } from "../stores/profile";
import { groupTracks, type TrackGroup } from "../lib/grouping";
import type { View } from "../lib/app";

/**
 * Library ("资料库") entry, modelled on the reference screenshot: a favorites
 * row on top, then a vertical list of category rows (tracks / albums / artists /
 * genres / folders / release date / playlists). Each row opens the matching
 * classification inside the drawer; it replaces the old horizontal pager.
 */
const emit = defineEmits<{
  navigate: [view: View];
  openPlaylist: [id: string];
  createPlaylist: [];
}>();

const { t } = useI18n();
const player = usePlayerStore();
const profile = useProfileStore();

const favoriteTracks = computed(() => tracksForPaths(profile.favorites, player.tracks));

interface CategoryRow {
  id: View;
  titleKey: string;
  subtitle: string;
  icon: Component;
  color: string;
  covers: string[];
}

const artistGroups = computed(() => groupTracks(player.tracks, "artists"));
const albumGroups = computed(() => groupTracks(player.tracks, "albums"));
const genreGroups = computed(() => groupTracks(player.tracks, "genres"));

function coversOf(groups: TrackGroup[] | undefined, limit = 3): string[] {
  if (!groups) return [];
  return groups
    .map((group) => group.tracks.find((track) => track.cover)?.cover)
    .filter((cover): cover is string => !!cover)
    .slice(0, limit);
}

const rows = computed<CategoryRow[]>(() => [
  {
    id: "tracks",
    titleKey: "nav.tracks",
    subtitle: t("library.collections.trackCount", { count: player.tracks.length }),
    icon: Music,
    color: "#1f8fff",
    covers: player.tracks.filter((track) => track.cover).slice(0, 3).map((track) => track.cover as string),
  },
  {
    id: "albums",
    titleKey: "nav.albums",
    subtitle: t("library.collections.albumCount", { count: albumGroups.value.length }),
    icon: Disc3,
    color: "#b04df0",
    covers: coversOf(albumGroups.value),
  },
  {
    id: "artists",
    titleKey: "nav.artists",
    subtitle: t("library.collections.artistCount", { count: artistGroups.value.length }),
    icon: Mic2,
    color: "#f04d6e",
    covers: coversOf(artistGroups.value),
  },
  {
    id: "genres",
    titleKey: "nav.genres",
    subtitle: t("library.collections.genreCount", { count: genreGroups.value.length }),
    icon: Tag,
    color: "#18c8c8",
    covers: [],
  },
  {
    id: "folders",
    titleKey: "nav.foldersTitle",
    subtitle: t("library.collections.trackCount", { count: player.tracks.length }),
    icon: Folder,
    color: "#f59331",
    covers: [],
  },
  {
    id: "years",
    titleKey: "nav.yearsTitle",
    subtitle: t("nav.yearsHint"),
    icon: CalendarDays,
    color: "#7a7af0",
    covers: [],
  },
  {
    id: "playlists",
    titleKey: "nav.playlistsTitle",
    subtitle: t("nav.playlistCount", { count: profile.playlists.length }),
    icon: ListMusic,
    color: "#f04d4d",
    covers: [],
  },
]);
</script>

<template>
  <div class="h-full w-full overflow-y-auto">
    <div class="mx-auto flex w-full max-w-6xl flex-col px-4 py-5 sm:px-6 sm:py-6">
      <h1 class="text-3xl font-black leading-none tracking-tight sm:text-4xl">{{ t("nav.collection") }}</h1>

      <template v-if="player.tracks.length === 0">
        <p class="ak-frame mt-8 border border-dashed border-line bg-surface/50 px-6 py-16 text-center text-sm text-muted">{{ t("nav.emptyCollection") }}</p>
      </template>

      <template v-else>
        <section class="mt-6">
          <div class="mb-3 flex items-center justify-between">
            <h2 class="text-base font-bold">{{ t("nav.favoritesSection") }}</h2>
            <button type="button" class="flex items-center gap-1 text-xs font-semibold text-dim transition-colors hover:text-fg" @click="emit('navigate', 'favorites')">
              {{ t("nav.browseAll") }}<ChevronRight :size="14" />
            </button>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <button type="button" class="ak-frame flex flex-col gap-3 border border-line bg-surface p-4 text-left" @click="emit('navigate', 'favorites')">
              <span class="grid aspect-square w-full place-items-center bg-[#f04d6e] text-white">
                <Heart :size="34" :stroke-width="2.2" />
              </span>
              <span>
                <span class="block text-sm font-semibold">{{ t("nav.myFavorites") }}</span>
                <span class="mt-1 block text-xs text-muted">{{ t("nav.favoritesTracks", { count: favoriteTracks.length }) }}</span>
              </span>
            </button>
            <button type="button" class="ak-frame flex flex-col gap-3 border border-dashed border-line bg-surface/50 p-4 text-left" @click="emit('createPlaylist')">
              <span class="grid aspect-square w-full place-items-center text-dim">
                <Plus :size="34" :stroke-width="2.2" />
              </span>
              <span>
                <span class="block text-sm font-semibold">{{ t("nav.addFavorite") }}</span>
                <span class="mt-1 block text-xs text-muted">{{ t("nav.favoritesTracks", { count: 1 }) }}</span>
              </span>
            </button>
          </div>
        </section>

        <section class="mt-6 flex flex-col gap-3">
          <button v-for="row in rows" :key="row.id" type="button" class="ak-frame flex items-center gap-4 border border-line bg-surface p-4 text-left transition-colors hover:border-accent" @click="emit('navigate', row.id)">
            <span class="grid h-11 w-11 shrink-0 place-items-center text-white" :style="{ backgroundColor: row.color }">
              <component :is="row.icon" :size="20" :stroke-width="2.1" />
            </span>
            <span class="grid min-w-0 flex-1 gap-1">
              <strong class="truncate text-sm font-semibold">{{ t(row.titleKey) }}</strong>
              <small class="truncate text-xs text-muted">{{ row.subtitle }}</small>
            </span>
            <span v-if="row.covers.length" class="flex shrink-0 items-center">
              <img v-for="(cover, index) in row.covers" :key="`${row.id}-${index}`" :src="cover" alt="" loading="lazy" decoding="async" class="h-9 w-9 rounded-md object-cover" :class="index > 0 ? '-ml-2' : ''" />
            </span>
            <ChevronRight :size="16" class="shrink-0 text-dim" />
          </button>
        </section>
      </template>
    </div>
  </div>
</template>
