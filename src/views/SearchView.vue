<!--
 Copyright 2026 Atemukesu
 SPDX-License-Identifier: GPL-3.0-only
-->

<script setup lang="ts">
import { computed, ref } from "vue";
import { Search, X } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import { usePlayerStore } from "../stores/player";
import type { Track } from "../stores/player";
import { groupTracks, isUnknownGroup, type GroupKind } from "../lib/grouping";
import { useCollapsibleHeader } from "../composables/useCollapsibleHeader";
import TrackList from "../components/TrackList.vue";

/**
 * Global library search. Matches title / artist / album against the loaded
 * tracks; tapping a result plays that track inside the filtered list. The genre
 * chips sit permanently under the search box and drill into a genre-filtered
 * track list.
 */
const emit = defineEmits<{
  openArtist: [artist: string];
  openAlbum: [album: string];
  openGroup: [kind: GroupKind, key: string];
}>();
const { t } = useI18n();
const player = usePlayerStore();
const query = ref("");
const scrollEl = ref<HTMLElement | null>(null);
const { collapsed, scroller } = useCollapsibleHeader(scrollEl);

const filtered = computed<Track[]>(() => {
  const value = query.value.trim().toLocaleLowerCase();
  if (!value) return [];
  return player.tracks.filter((track) =>
    [track.title, track.artist, track.album]
      .some((field) => field?.toLocaleLowerCase().includes(value)),
  );
});

interface GenreChip {
  key: string;
  name: string;
}

const genres = computed<GenreChip[]>(() =>
  groupTracks(player.tracks, "genres").map((group) => ({
    key: group.key,
    name: isUnknownGroup(group.key) ? t("library.collections.unknownGenre") : group.key,
  })),
);

function openGenre(key: string) {
  emit("openGroup", "genres", key);
}

function play(track: Track) {
  void player.playInQueue(filtered.value, track);
}

function clear() {
  query.value = "";
}
</script>

<template>
  <div ref="scrollEl" class="w-full">
    <div class="mx-auto flex w-full max-w-6xl flex-col px-4 pb-2 pt-5 sm:px-6 sm:pt-6">
      <header
        class="sticky top-0 z-20 -mx-4 px-4 transition-[padding,background-color,border-color] duration-200 sm:-mx-6 sm:px-6"
        :class="collapsed ? 'border-b border-line bg-bg/95 py-2 backdrop-blur' : 'border-b border-transparent bg-transparent py-1'"
      >
        <p v-if="!collapsed" class="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.35em] text-accent"><span class="h-2 w-2 bg-accent"></span>{{ t("nav.search") }}</p>
        <label class="mt-3 flex h-11 items-center gap-3 border border-line bg-bg px-3">
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
        <div v-if="!collapsed && genres.length" class="mt-3">
          <p class="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-dim">{{ t("nav.genres") }}</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="genre in genres"
              :key="genre.key"
              type="button"
              class="rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-muted transition-colors hover:text-fg"
              @click="openGenre(genre.key)"
            >
              {{ genre.name }}
            </button>
          </div>
        </div>
      </header>

      <div class="mt-4 min-h-0 flex-1">
        <TrackList
          :tracks="filtered"
          :scroller="scroller"
          empty-key="nav.searchEmpty"
          @play="play"
          @open-artist="emit('openArtist', $event)"
          @open-album="emit('openAlbum', $event)"
        />
      </div>
    </div>
  </div>
</template>
