<!--
 Copyright 2026 Atemukesu
 SPDX-License-Identifier: GPL-3.0-only
-->

<script setup lang="ts">
import { computed, ref } from "vue";
import { Mic2, Search, X } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import { usePlayerStore } from "../stores/player";
import { groupTracks, isUnknownGroup, type GroupKind } from "../lib/grouping";
import type { View, MainTab } from "../lib/app";
import { useCollapsibleHeader } from "../composables/useCollapsibleHeader";
import RailSection, { type RailSectionCard } from "../components/RailSection.vue";

/**
 * Search page: keeps the top search input, then reuses the home three-rail
 * layout over library groups — artists (large cards), genres and years (small
 * cards). A card opens its group collection; the artist action opens the
 * artist list.
 */
const emit = defineEmits<{
  navigate: [view: View];
  openArtist: [artist: string];
  openAlbum: [album: string];
  openGroup: [kind: GroupKind, key: string];
  selectTab: [tab: MainTab];
}>();

const { t } = useI18n();
const player = usePlayerStore();
const query = ref("");
const scrollEl = ref<HTMLElement | null>(null);
useCollapsibleHeader(scrollEl);

const unknownKey: Record<GroupKind, string> = {
  artists: "library.collections.unknownArtist",
  albums: "library.collections.unknownAlbum",
  years: "library.collections.unknownYear",
  genres: "library.collections.unknownGenre",
};

function groupCards(kind: GroupKind): RailSectionCard[] {
  return groupTracks(player.tracks, kind).map((group) => {
    const coverTrack = group.tracks.find((track) => track.cover) ?? group.tracks[0];
    const name = isUnknownGroup(group.key) ? t(unknownKey[kind]) : group.key;
    return {
      key: group.key,
      title: name,
      subtitle: t("library.collections.trackCount", { count: group.tracks.length }),
      cover: coverTrack?.cover,
      color: coverTrack?.color,
      initial: name.charAt(0),
    };
  });
}

const artistCards = computed(() => groupCards("artists"));
const genreCards = computed(() => groupCards("genres"));
const yearCards = computed(() => groupCards("years"));

function clear() {
  query.value = "";
}
</script>

<template>
  <div ref="scrollEl" class="w-full">
    <div class="mx-auto flex w-full max-w-6xl flex-col px-4 pb-2 pt-5 sm:px-6 sm:pt-6">
      <!-- Search input lives in the content page, not the shared top bar. -->
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

      <!-- Artists: large cover cards; action opens the artist list. -->
      <RailSection
        titleKey="library.collections.artistsTitle"
        variant="large"
        :cards="artistCards"
        action-label-key="nav.artists"
        :action-icon="Mic2"
        @open="(card) => emit('openGroup', 'artists', card.key)"
        @action="emit('navigate', 'artists')"
      />

      <!-- Genres: small group cards. -->
      <RailSection
        titleKey="library.collections.genresTitle"
        variant="small"
        :cards="genreCards"
        @open="(card) => emit('openGroup', 'genres', card.key)"
      />

      <!-- Years: small group cards. -->
      <RailSection
        titleKey="library.collections.yearsTitle"
        variant="small"
        :cards="yearCards"
        @open="(card) => emit('openGroup', 'years', card.key)"
      />
    </div>
  </div>
</template>
