<!--
 Copyright 2026 Atemukesu
 SPDX-License-Identifier: GPL-3.0-only
-->

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
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

/**
 * The six library categories are one horizontal pager driven by a hand-written
 * transform animation. Swiping anywhere inside this component — including the
 * tab bar — moves the strip with the pointer; on release it animates to the
 * nearest page and then publishes the settled page. Clicking a tab or sidebar
 * item animates the strip to that page. No native horizontal scrolling is used,
 * so scroll events can never fight the animation.
 */
const strip = ref<HTMLElement | null>(null);
const position = ref(0); // translateX px of the strip (0 or negative)
const targetIndex = ref(0);
let stripWidth = 1;

function measure() {
  stripWidth = strip.value?.clientWidth ?? 1;
}

function currentIndexFromPosition() {
  return Math.max(0, Math.min(categoryViews.length - 1, Math.round(-position.value / stripWidth)));
}

function setTransition(enable: boolean) {
  const el = strip.value;
  if (el) el.style.transition = enable ? "transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)" : "none";
}

function goTo(index: number, animate: boolean) {
  targetIndex.value = Math.max(0, Math.min(categoryViews.length - 1, index));
  setTransition(animate);
  position.value = -(targetIndex.value * stripWidth);
}

/** Publish the settled page once its settle animation has finished. */
let settleTimer: ReturnType<typeof setTimeout> | null = null;
function settleAndPublish() {
  const index = currentIndexFromPosition();
  goTo(index, true);
  if (settleTimer) clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    const view = categoryViews[index];
    if (view && view !== props.kind) emit("navigate", view);
  }, 360);
}

// --- Pointer-driven drag (whole component area, touch / pen / mouse) ---
let dragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragStartPosition = 0;
let dragAxis: "x" | "y" | null = null;

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0) return;
  dragging = true;
  dragAxis = null;
  dragStartX = event.clientX;
  dragStartY = event.clientY;
  dragStartPosition = position.value;
  if (settleTimer) { clearTimeout(settleTimer); settleTimer = null; }
  setTransition(false);
}

function onPointerMove(event: PointerEvent) {
  if (!dragging) return;
  const dx = event.clientX - dragStartX;
  const dy = event.clientY - dragStartY;
  if (dragAxis === null) {
    if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) {
      dragAxis = "x";
      event.preventDefault();
    } else if (Math.abs(dy) > 6) {
      dragAxis = "y";
    }
  }
  if (dragAxis === "x") {
    event.preventDefault();
    position.value = dragStartPosition + dx;
  }
}

function onPointerEnd() {
  if (!dragging) return;
  dragging = false;
  dragAxis = null;
  settleAndPublish();
}

// External navigation (tab click / sidebar click) animates the strip.
watch(() => props.kind, (view) => {
  const index = categoryViews.indexOf(view);
  if (index >= 0) goTo(index, true);
});

// Keep alignment when the layout width changes (rotation, resize).
let resizeObserver: ResizeObserver | null = null;
onMounted(() => {
  measure();
  const index = categoryViews.indexOf(props.kind);
  if (index >= 0) goTo(index, false);
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => {
      measure();
      goTo(targetIndex.value, false);
    });
    if (strip.value) resizeObserver.observe(strip.value);
  }
});
onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  if (settleTimer) clearTimeout(settleTimer);
});

const stripStyle = computed(() => ({ transform: `translateX(${position.value}px)` }));

function openGroupFromPanel(view: View, key: string) {
  emit("openGroup", view as GroupKind, key);
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col" style="touch-action: pan-y" @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerEnd" @pointercancel="onPointerEnd">
    <CategoryTabs :active="kind" @navigate="emit('navigate', $event)" />
    <div class="relative min-h-0 w-full flex-1 overflow-hidden">
      <div ref="strip" class="flex h-full w-full" :style="stripStyle">
        <section v-for="view in categoryViews" :key="view" class="h-full w-full shrink-0 overflow-y-auto overscroll-contain">
          <PlaylistsView v-if="view === 'playlists'" @open-playlist="emit('openPlaylist', $event)" @edit-playlist="emit('editPlaylist', $event)" @create-playlist="emit('createPlaylist')" @navigate="emit('navigate', $event)" />
          <GroupedLibraryView v-else-if="view !== 'tracks'" :kind="view as GroupKind" :loading="loading" @open="openGroupFromPanel(view, $event)" />
          <TracksView v-else :loading="loading" :refreshing="refreshing" :downloading-track-id="downloadingTrackId" @refresh="emit('refresh')" @download-metadata="emit('downloadMetadata', $event)" @edit-lyrics="emit('editLyrics', $event)" @edit-info="emit('editInfo', $event)" @show-info="emit('showInfo', $event)" @open-artist="emit('openArtist', $event)" @open-album="emit('openAlbum', $event)" />
        </section>
      </div>
    </div>
  </div>
</template>
