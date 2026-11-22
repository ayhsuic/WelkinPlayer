<!--
 Copyright 2026 Atemukesu
 SPDX-License-Identifier: GPL-3.0-only
-->

<script setup lang="ts">
import { computed, ref } from "vue";
import { ChevronDown, ChevronUp, Music, Search, User, X } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import { usePlayerStore } from "../stores/player";
import type { Track } from "../stores/player";
import { groupTracks, isUnknownGroup, type GroupKind } from "../lib/grouping";
import { useCollapsibleHeader } from "../composables/useCollapsibleHeader";
import TrackList from "../components/TrackList.vue";
import MainNavTabs from "../components/MainNavTabs.vue";
import type { MainTab } from "../lib/app";

/**
 * Global library search, modelled on the lmusic search screen:
 * - an input bar at the top;
 *   - idle (empty query): a centered icon + hint;
 *   - no match: a centered empty hint;
 *   - results split into a collapsible songs group (track rows) and a
 *     collapsible artists group (artist rows).
 */
const emit = defineEmits<{
  openArtist: [artist: string];
  openAlbum: [album: string];
  openGroup: [kind: GroupKind, key: string];
  selectTab: [tab: MainTab];
}>();
const { t } = useI18n();
const player = usePlayerStore();
const query = ref("");
const scrollEl = ref<HTMLElement | null>(null);
const { collapsed, scroller } = useCollapsibleHeader(scrollEl);

const songs = computed<Track[]>(() => {
  const value = query.value.trim().toLocaleLowerCase();
  if (!value) return [];
  return player.tracks.filter((track) =>
    [track.title, track.artist, track.album]
      .some((field) => field?.toLocaleLowerCase().includes(value)),
  );
});

interface ArtistCard {
  key: string;
  name: string;
  count: number;
  color?: string;
}

const artists = computed<ArtistCard[]>(() => {
  const value = query.value.trim().toLocaleLowerCase();
  if (!value) return [];
  return groupTracks(player.tracks, "artists")
    .filter((group) => group.key.toLocaleLowerCase().includes(value))
    .map((group) => ({
      key: group.key,
      name: isUnknownGroup(group.key) ? t("library.collections.unknownArtist") : group.key,
      count: group.tracks.length,
      color: group.tracks[0]?.color,
    }));
});

const idle = computed(() => query.value.trim() === "");
const empty = computed(() => !idle.value && songs.value.length === 0 && artists.value.length === 0);

const songsCollapsed = ref(false);
const artistsCollapsed = ref(false);

function play(track: Track) {
  void player.playInQueue(songs.value, track);
}

function openArtistCard(key: string) {
  emit("openArtist", key);
}

function clear() {
  query.value = "";
}
</script>

<template>
  <div ref="scrollEl" class="w-full">
    <div class="mx-auto flex w-full max-w-6xl flex-col px-4 pb-2 pt-5 sm:px-6 sm:pt-6">
      <header
        class="sticky top-0 z-20 -mx-4 flex items-center justify-between gap-3 px-4 transition-[padding,background-color,border-color] duration-200 sm:-mx-6 sm:px-6"
        :class="collapsed ? 'border-b border-line bg-bg/95 py-2 backdrop-blur' : 'border-b border-transparent bg-transparent py-1'"
      >
        <label class="flex h-11 min-w-0 flex-1 items-center gap-3 border border-line bg-bg px-3">
          <Search :size="17" :stroke-width="2" class="shrink-0 text-dim" />
          <input
            v-model="query"
            type="search"
            class="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-dim"
            :placeholder="t('nav.searchPlaceholder')"
            :aria-label="t('nav.searchPlaceholder')"
          />
          <button v-if="query" type="button" class="grid h-8 w-8 shrink-0 place-items-center text-dim hover:text-fg" :aria-label="t('controls.collapse')" @click="clear">
            <X :size="16" :stroke-width="2" />
          </button>
        </label>
        <MainNavTabs active="search" :collapsed="collapsed" @select="(tab) => emit('selectTab', tab)" />
      </header>

      <!-- Idle: centered hint before any query. -->
      <div v-if="idle" class="grid min-h-[50vh] place-items-center">
        <div class="flex items-center gap-3 text-dim">
          <Search :size="24" />
          <span class="text-sm text-muted">{{ t("nav.searchIdle") }}</span>
        </div>
      </div>

      <!-- Empty: query entered but nothing matched. -->
      <div v-else-if="empty" class="grid min-h-[50vh] place-items-center">
        <span class="text-sm text-muted">{{ t("nav.noResult") }}</span>
      </div>

      <!-- Results: collapsible songs and artists groups. -->
      <div v-else class="mt-4 min-h-0 flex-1">
        <section v-if="songs.length" class="mb-6">
          <button type="button" class="mb-2 flex w-full items-center gap-2 px-1 text-left" @click="songsCollapsed = !songsCollapsed">
            <Music :size="20" class="shrink-0 text-fg" />
            <span class="flex-1 truncate text-base font-bold">{{ t("nav.songsResult") }} ({{ songs.length }})</span>
            <ChevronUp v-if="!songsCollapsed" :size="18" class="shrink-0 text-dim" />
            <ChevronDown v-else :size="18" class="shrink-0 text-dim" />
          </button>
          <TrackList
            v-if="!songsCollapsed"
            :tracks="songs"
            :scroller="scroller"
            empty-key="nav.searchEmpty"
            @play="play"
            @open-artist="emit('openArtist', $event)"
            @open-album="emit('openAlbum', $event)"
          />
        </section>

        <section v-if="artists.length">
          <button type="button" class="mb-2 flex w-full items-center gap-2 px-1 text-left" @click="artistsCollapsed = !artistsCollapsed">
            <User :size="20" class="shrink-0 text-fg" />
            <span class="flex-1 truncate text-base font-bold">{{ t("nav.artistsResult") }} ({{ artists.length }})</span>
            <ChevronUp v-if="!artistsCollapsed" :size="18" class="shrink-0 text-dim" />
            <ChevronDown v-else :size="18" class="shrink-0 text-dim" />
          </button>
          <div v-if="!artistsCollapsed" class="flex flex-col pt-1">
            <button
              v-for="artist in artists"
              :key="artist.key"
              type="button"
              class="flex w-full items-center gap-4 px-3 py-3 text-left transition-colors hover:bg-surface/60"
              @click="openArtistCard(artist.key)"
            >
              <span class="ak-clip-tr grid h-11 w-11 shrink-0 place-items-center text-lg font-black text-white/90" :style="{ backgroundColor: artist.color ?? 'var(--accent)' }">
                {{ artist.name.charAt(0) }}
              </span>
              <span class="min-w-0 flex-1 truncate text-sm font-semibold">{{ artist.name }}</span>
              <span class="shrink-0 text-xs text-muted">{{ t("library.collections.trackCount", { count: artist.count }) }}</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
