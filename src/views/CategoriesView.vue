<!--
 Copyright 2026 Atemukesu
 SPDX-License-Identifier: GPL-3.0-only
-->

<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { categoryViews, type View } from "../lib/app";
import type { GroupKind } from "../lib/grouping";
import type { Track } from "../stores/player";
import CategoryTabs from "../components/CategoryTabs.vue";
import PlaylistsView from "./PlaylistsView.vue";
import GroupedLibraryView from "./GroupedLibraryView.vue";
import TracksView from "./TracksView.vue";

const props = withDefaults(defineProps<{ kind: View; loading: boolean; refreshing?: boolean; downloadingTrackId?: number | null }>(), { refreshing: false, downloadingTrackId: null });
const emit = defineEmits<{
  navigate: [view: View];
  openPlaylist: [id: string];
  editPlaylist: [id: string];
  createPlaylist: [];
  openGroup: [kind: GroupKind, key: string];
  refresh: [];
  downloadMetadata: [track: Track];
  editLyrics: [track: Track];
  editInfo: [track: Track];
  showInfo: [track: Track];
  openArtist: [artist: string];
  openAlbum: [album: string];
}>();

/** Horizontal snap scroller holding the six category panels. */
const scroller = ref<HTMLElement | null>(null);

function scrollToView(view: View, smooth: boolean) {
  const el = scroller.value;
  if (!el) return;
  const index = categoryViews.indexOf(view);
  if (index < 0) return;
  const left = index * el.clientWidth;
  if (Math.abs(el.scrollLeft - left) < 2) return;
  el.scrollTo({ left, behavior: smooth ? "smooth" : "auto" });
}

/** Publish the settled panel as the active category after a swipe; never pulls the scroller back. */
let settleTimer: ReturnType<typeof setTimeout> | null = null;
function onScroll() {
  const el = scroller.value;
  if (!el) return;
  if (settleTimer) clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    const index = Math.round(el.scrollLeft / el.clientWidth);
    const view = categoryViews[index];
    if (view && view !== props.kind) emit("navigate", view);
  }, 400);
}

function openGroupFromPanel(view: View, key: string) {
  emit("openGroup", view as GroupKind, key);
}

watch(() => props.kind, (view) => scrollToView(view, true));
onMounted(() => scrollToView(props.kind, false));
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <CategoryTabs :active="kind" @navigate="emit('navigate', $event)" />
    <div ref="scroller" class="min-h-0 w-full flex-1 overflow-x-auto overscroll-x-contain snap-x snap-mandatory" @scroll.passive="onScroll">
      <div class="flex h-full w-full">
        <section v-for="view in categoryViews" :key="view" class="h-full min-w-full shrink-0 snap-start overflow-y-auto overscroll-contain">
          <PlaylistsView v-if="view === 'playlists'" @open-playlist="emit('openPlaylist', $event)" @edit-playlist="emit('editPlaylist', $event)" @create-playlist="emit('createPlaylist')" @navigate="emit('navigate', $event)" />
          <GroupedLibraryView v-else-if="view !== 'tracks'" :kind="view as GroupKind" :loading="loading" @open="openGroupFromPanel(view, $event)" />
          <TracksView v-else :loading="loading" :refreshing="refreshing" :downloading-track-id="downloadingTrackId" @refresh="emit('refresh')" @download-metadata="emit('downloadMetadata', $event)" @edit-lyrics="emit('editLyrics', $event)" @edit-info="emit('editInfo', $event)" @show-info="emit('showInfo', $event)" @open-artist="emit('openArtist', $event)" @open-album="emit('openAlbum', $event)" />
        </section>
      </div>
    </div>
  </div>
</template>
