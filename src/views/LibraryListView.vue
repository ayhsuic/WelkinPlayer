<!--
 Copyright 2026 Atemukesu
 SPDX-License-Identifier: GPL-3.0-only
-->

<script setup lang="ts">
import { computed } from "vue";
import { Disc3, Music, Plus } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import { usePlayerStore } from "../stores/player";
import type { Track } from "../stores/player";
import { useProfileStore } from "../stores/profile";
import { initial } from "../lib/format";
import type { View, MainTab } from "../lib/app";
import RailSection, { type RailSectionCard } from "../components/RailSection.vue";

/**
 * Library ("媒体库") page: reuses the home three-rail layout.
 * - Large rail: user playlists (cover card opens the playlist; action creates one).
 * - Small rail: every track in the library; action opens the full track list.
 * - Small rail: recently added tracks; action opens the album collection.
 */
const emit = defineEmits<{
  navigate: [view: View];
  openGroup: [kind: "artists" | "albums" | "years" | "genres", key: string];
  openPlaylist: [id: string];
  createPlaylist: [];
  selectTab: [tab: MainTab];
}>();

const { t } = useI18n();
const player = usePlayerStore();
const profile = useProfileStore();

/** Recently added: newest source modification first. */
const recentlyAdded = computed(() => {
  const indexed = player.tracks
    .map((track, index) => ({ track, index, time: Date.parse(track.modified ?? "") || 0 }))
    .filter((item) => item.track.path);
  indexed.sort((a, b) => b.time - a.time || a.index - b.index);
  return indexed.map((item) => item.track);
});

const playlistCards = computed<RailSectionCard[]>(() =>
  profile.playlists.map((playlist) => ({
    key: playlist.id,
    title: playlist.name,
    subtitle: t("library.collections.trackCount", { count: playlist.tracks.length }),
    playlist,
  })),
);

function trackCard(track: Track): RailSectionCard {
  return {
    key: String(track.id),
    title: track.title,
    subtitle: track.artist,
    cover: track.cover,
    color: track.color,
    initial: initial(track),
  };
}

const allTrackCards = computed<RailSectionCard[]>(() =>
  player.tracks.filter((track) => track.path).map(trackCard),
);
const addedCards = computed<RailSectionCard[]>(() => recentlyAdded.value.map(trackCard));

function onOpen(card: RailSectionCard) {
  if (card.playlist) {
    emit("openPlaylist", card.playlist.id);
    return;
  }
  const track = player.tracks.find((item) => String(item.id) === card.key);
  if (track) player.playInQueue(player.tracks, track);
}
</script>

<template>
  <div class="w-full">
    <div class="mx-auto flex w-full max-w-6xl flex-col px-4 pt-5 sm:px-6 sm:pt-6">
      <!-- Playlists: large cover cards; action creates a new playlist. -->
      <RailSection
        titleKey="home.playlists"
        variant="large"
        :cards="playlistCards"
        action-label-key="playlistsPage.create"
        :action-icon="Plus"
        @open="onOpen"
        @action="emit('createPlaylist')"
      />

      <!-- Every track: small track cards; action opens the full track list. -->
      <RailSection
        titleKey="home.allSongs"
        variant="small"
        :cards="allTrackCards"
        action-label-key="home.library"
        :action-icon="Music"
        @open="onOpen"
        @action="emit('navigate', 'tracks')"
      />

      <!-- Recently added: small track cards; action opens the album collection. -->
      <RailSection
        titleKey="home.recentlyAdded"
        variant="small"
        :cards="addedCards"
        action-label-key="nav.albums"
        :action-icon="Disc3"
        @open="onOpen"
        @action="emit('navigate', 'albums')"
      />
    </div>
  </div>
</template>
