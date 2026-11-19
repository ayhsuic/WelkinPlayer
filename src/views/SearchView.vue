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
import TrackList from "../components/TrackList.vue";

/**
 * Global library search. Matches title / artist / album against the loaded
 * tracks; tapping a result plays that track inside the filtered list. This
 * replaces the per-page inline filter boxes, which no longer live in the
 * library categories.
 */
const emit = defineEmits<{ openArtist: [artist: string]; openAlbum: [album: string] }>();
const { t } = useI18n();
const player = usePlayerStore();
const query = ref("");
const scrollEl = ref<HTMLElement | null>(null);

const filtered = computed<Track[]>(() => {
  const value = query.value.trim().toLocaleLowerCase();
  if (!value) return [];
  return player.tracks.filter((track) =>
    [track.title, track.artist, track.album]
      .some((field) => field?.toLocaleLowerCase().includes(value)),
  );
});

function play(track: Track) {
  void player.playInQueue(filtered.value, track);
}

function clear() {
  query.value = "";
}
</script>

<template>
  <div ref="scrollEl" class="h-full w-full overflow-y-auto">
    <div class="mx-auto flex w-full max-w-6xl flex-col px-4 py-5 sm:px-6 sm:py-6">
      <header class="shrink-0 border-b border-line py-4">
        <p class="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.35em] text-accent"><span class="h-2 w-2 bg-accent"></span>{{ t("nav.search") }}</p>
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
      </header>

      <div class="mt-4 min-h-0 flex-1">
        <TrackList
          :tracks="filtered"
          :scroller="scrollEl"
          empty-key="nav.searchEmpty"
          @play="play"
          @open-artist="emit('openArtist', $event)"
          @open-album="emit('openAlbum', $event)"
        />
      </div>
    </div>
  </div>
</template>
