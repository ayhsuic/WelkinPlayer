<!--
 Copyright 2026 Atemukesu
 SPDX-License-Identifier: GPL-3.0-only
-->

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ListChecks, Pencil, Play, RefreshCw, Sparkles, TrendingUp } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import { usePlayerStore } from "../stores/player";
import type { Track } from "../stores/player";
import { tracksForPaths, useProfileStore } from "../stores/profile";
import type { Playlist } from "../lib/profile";
import { useSmartTransitionStore } from "../stores/smartTransition";
import { useSourcesStore } from "../stores/sources";
import { RECENT_PLAYS_ID } from "../lib/app";
import { rankTracksByPlayCount } from "../lib/playRanking";
import { trackKey } from "../lib/sources";
import { pushToast } from "../lib/toast";
import { groupKeys, isUnknownGroup, type GroupKind } from "../lib/grouping";
import { sortTracks, titleLetterIndex, useTrackSort, type TrackSortContext } from "../lib/sort";
import TrackList from "../components/TrackList.vue";
import TrackContextMenu from "../components/TrackContextMenu.vue";
import TrackSortMenu from "../components/TrackSortMenu.vue";
import ViewModeToggle from "../components/ViewModeToggle.vue";
import PlaylistCover from "../components/PlaylistCover.vue";
import SmartTransitionDialog from "../components/SmartTransitionDialog.vue";
import { useCollapsibleHeader } from "../composables/useCollapsibleHeader";

const props = withDefaults(defineProps<{ playlistId?: string | null; artist?: string | null; album?: string | null; year?: string | null; genre?: string | null; sourceId?: string | null; loading: boolean; refreshing?: boolean; downloadingTrackId?: number | null }>(), { playlistId: null, artist: null, album: null, year: null, genre: null, sourceId: null, refreshing: false, downloadingTrackId: null });
const emit = defineEmits<{ refresh: []; edit: [id: string]; openArtist: [artist: string]; openAlbum: [album: string]; downloadMetadata: [track: Track]; editLyrics: [track: Track]; editInfo: [track: Track]; showInfo: [track: Track] }>();
const { t } = useI18n();
const player = usePlayerStore();
const profile = useProfileStore();
const smart = useSmartTransitionStore();
const sources = useSourcesStore();
const contextTrack = ref<Track | null>(null);
const contextPosition = ref({ x: 0, y: 0 });
const selectMode = ref(false);
const selected = ref<Set<string>>(new Set());
const scrollEl = ref<HTMLElement | null>(null);
const { collapsed, scroller } = useCollapsibleHeader(scrollEl);
const smartOpen = ref(false);

const activePlaylist = computed(() => props.playlistId ? profile.playlists.find((item) => item.id === props.playlistId) ?? null : null);
/** The generated play-ranking playlist: not stored, resolved from play counts. */
const smartPlays = computed(() => props.playlistId === RECENT_PLAYS_ID);
const rankedTracks = computed(() => rankTracksByPlayCount(player.tracks, profile.profile.playCounts));
/** A generated artist/album collection, selected from the classification views. */
const groupKind = computed<GroupKind>(() => (props.artist ? "artists" : props.album ? "albums" : props.year ? "years" : "genres"));
const groupKeyValue = computed(() => props.artist ?? props.album ?? props.year ?? props.genre ?? null);
const isGroup = computed(() => groupKeyValue.value !== null);
const sourceFilter = computed(() => props.sourceId ?? null);
const sourceName = computed(() => sources.sources.find((source) => source.id === sourceFilter.value)?.name ?? null);
const groupTracks = computed(() => {
  const key = groupKeyValue.value;
  if (key === null) return null;
  const kind = groupKind.value;
  return player.tracks.filter((track) => groupKeys(track, kind).includes(key));
});
const groupTitle = computed(() => {
  const key = groupKeyValue.value;
  if (key === null) return "";
  if (isUnknownGroup(key)) return t(props.artist ? "library.collections.unknownArtist" : props.album ? "library.collections.unknownAlbum" : props.year ? "library.collections.unknownYear" : "library.collections.unknownGenre");
  return key;
});
/** Representative cover for a generated collection: the first track that has artwork. */
const groupCoverTrack = computed(() => groupTracks.value?.find((track) => track.cover) ?? groupTracks.value?.[0]);
const sourceTracks = computed(() => {
  if (smartPlays.value) return rankedTracks.value.map((item) => item.track);
  if (activePlaylist.value) return tracksForPaths(activePlaylist.value.tracks, player.tracks);
  if (groupTracks.value) return groupTracks.value;
  if (sourceFilter.value) return player.tracks.filter((track) => track.sourceId === sourceFilter.value);
  return player.tracks;
});
/** Sort settings are per page: playlists, artists, albums and the full library remember their own. */
const sortContext = computed<TrackSortContext>(() => activePlaylist.value ? "playlist" : isGroup.value ? (groupKind.value === "artists" ? "artist" : "album") : "tracks");const sortKey = computed(() => useTrackSort(sortContext.value).key.value);
const sortDir = computed(() => useTrackSort(sortContext.value).dir.value);
/** Source order with the chosen sort applied; the play queue follows this so "next" matches the screen. */
const orderedTracks = computed(() => smartPlays.value ? sourceTracks.value : sortTracks(sourceTracks.value, sortKey.value, sortDir.value));
const tracks = computed(() => orderedTracks.value);
const smartEnabled = computed(() => activePlaylist.value?.smartTransition?.enabled === true);
const smartReady = computed(() => activePlaylist.value?.smartTransition?.status === "ready");
/** Smart transitions pin playback to the analysed order. */
const smartLocked = computed(() => smartEnabled.value && smartReady.value);
/** Tracks in the analysed order, when that document is loaded. */
const smartOrderTracks = computed<Track[] | null>(() => {
  const playlist = activePlaylist.value;
  const summary = playlist ? smart.summaryFor(playlist.id) : null;
  if (!playlist || !summary || summary.incomplete) return null;
  const byKey = new Map<string, Track>();
  for (const track of sourceTracks.value) {
    const key = trackKey(track);
    if (key) byKey.set(key, track);
  }
  const ordered: Track[] = [];
  for (const key of summary.order) {
    const track = byKey.get(key);
    if (track) ordered.push(track);
  }
  // Never drop tracks the analysis did not know about.
  for (const track of sourceTracks.value) {
    if (!ordered.includes(track)) ordered.push(track);
  }
  return ordered;
});
/**
 * The queue smart playback uses: the analysed order when locked, otherwise
 * the visible sort. This is why shuffle/sequential never diverge while smart
 * transitions are on.
 */
const queueTracks = computed(() => (smartLocked.value ? (smartOrderTracks.value ?? sourceTracks.value) : orderedTracks.value));
/** The A–Z rail, only on the pages that opted in while sorting by title. */
const letterIndex = computed(() => (sortKey.value === "title" && !smartPlays.value && !selectMode.value && (sortContext.value === "tracks" || sortContext.value === "playlist") ? titleLetterIndex(tracks.value) : null));

watch([() => props.playlistId, () => props.artist, () => props.album, () => props.year, () => props.genre], () => { selectMode.value = false; selected.value = new Set(); });
// Load the analysis document when opening an enabled playlist so playback can
// use its exact order even before the dialog is opened.
watch(
  () => props.playlistId,
  (id) => {
    if (!id) return;
    const playlist = profile.playlists.find((item) => item.id === id);
    if (playlist?.smartTransition?.enabled) void smart.load(id);
  },
  { immediate: true },
);

function toggleSelectMode() {
  selectMode.value = !selectMode.value;
  if (!selectMode.value) selected.value = new Set();
}
/** Install smart-transition plans for the playlist that is now playing. */
async function armTransition() {
  const playlist = activePlaylist.value;
  if (!playlist) return;
  if (smartLocked.value) {
    // The queue is already pinned to the analysed order; plans match it.
    await smart.armPlayback(playlist.id);
    return;
  }
  if (sortKey.value !== "default" || player.shuffle) {
    // The audible order differs from the analysed order, so the plans would be
    // wrong. Clear them and fall back to hard transitions.
    await smart.clearPlans();
    return;
  }
  await smart.armPlayback(playlist.id);
}
async function play(track: Track) {
  await ensureSmartSummary();
  await player.playInQueue(queueTracks.value, track, smartLocked.value);
  // `playback_set_queue` clears old plans, so arm after the queue is installed.
  await armTransition();
}
async function playFirst() {
  await ensureSmartSummary();
  const pool = (smartLocked.value ? queueTracks.value : tracks.value).filter((track) => track.path);
  if (pool.length === 0) return;
  // Smart playback always starts at the first analysed track; shuffle only
  // applies to normal queues.
  const first = !smartLocked.value && player.shuffle ? pool[Math.floor(Math.random() * pool.length)] : pool[0];
  await player.playInQueue(queueTracks.value, first, smartLocked.value);
  await armTransition();
}
/** Make sure the analysed order is loaded before building a smart queue. */
async function ensureSmartSummary(): Promise<void> {
  const playlist = activePlaylist.value;
  if (!playlist || !smartLocked.value) return;
  if (!smart.summaryFor(playlist.id)) await smart.load(playlist.id);
}
/** Whether the live queue is exactly this playlist. */
function isCurrentQueue(playlist: Playlist): boolean {
  const playlistKeys = new Set(
    tracksForPaths(playlist.tracks, player.tracks).map(trackKey).filter((key): key is string => !!key),
  );
  if (playlistKeys.size === 0) return false;
  const current = trackKey(player.currentTrack);
  if (!current || !playlistKeys.has(current)) return false;
  const queueKeys = player.queue.map(trackKey).filter((key): key is string => !!key);
  return queueKeys.length > 0 && queueKeys.every((key) => playlistKeys.has(key));
}
/** Turn smart transitions on/off from the playlist header. */
async function toggleSmart() {
  const playlist = activePlaylist.value;
  if (!playlist) return;
  if (smartEnabled.value) {
    smart.disable(playlist.id);
    // Only drop the installed plans when they belong to this queue; another
    // playlist may be the one currently playing.
    if (isCurrentQueue(playlist)) await smart.clearPlans();
    pushToast("info", t("library.playlists.smart.disabled"));
    return;
  }
  let summary = smart.summaryFor(playlist.id);
  if (!summary) summary = await smart.load(playlist.id);
  if (!summary || summary.incomplete || playlist.smartTransition?.status === "stale") {
    // Nothing trustworthy to enable yet: open the dialog to analyse or refresh.
    smartOpen.value = true;
    return;
  }
  if (!smart.applyOrder(playlist.id)) {
    smartOpen.value = true;
    return;
  }
  useTrackSort("playlist").key.value = "default";
  pushToast("success", t("library.playlists.smart.applied"));
}
// Applying the analysed order (from the header switch or the dialog) pins the
// live queue too, without restarting the current track.
watch(smartLocked, async (locked) => {
  if (!locked) return;
  const playlist = activePlaylist.value;
  if (!playlist || !isCurrentQueue(playlist)) return;
  let summary = smart.summaryFor(playlist.id);
  if (!summary) summary = await smart.load(playlist.id);
  if (!summary || summary.incomplete) return;
  await player.reorderQueue(summary.order);
  await armTransition();
});
function openSmart() { smartOpen.value = true; }
function openContextMenu(event: MouseEvent, track: Track) { contextTrack.value = track; contextPosition.value = { x: event.clientX, y: event.clientY }; }
function downloadMetadata(track: Track) { emit("downloadMetadata", track); }
</script>

<template>
  <div ref="scrollEl" class="w-full">
    <div class="mx-auto flex w-full max-w-6xl flex-col px-6 py-6">
      <header
        class="sticky top-0 z-20 -mx-6 mb-4 mt-2 px-6 transition-[padding,background-color,border-color] duration-200"
        :class="collapsed ? 'border-b border-line bg-bg/95 py-2 backdrop-blur' : 'border-b border-transparent bg-transparent py-1'"
      >
        <div class="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-6">
          <PlaylistCover v-if="activePlaylist && !collapsed" :playlist="activePlaylist" class="ak-frame h-32 w-32 shrink-0 border border-line text-5xl" :icon-size="40" />
          <span v-else-if="smartPlays && !collapsed" class="ak-frame grid h-32 w-32 shrink-0 place-items-center border border-line bg-accent/10 text-accent"><TrendingUp :size="40" :stroke-width="2" /></span>
          <span v-else-if="isGroup && !collapsed" class="ak-frame grid h-32 w-32 shrink-0 place-items-center overflow-hidden border border-line text-5xl font-black text-white/90" :style="{ backgroundColor: groupCoverTrack?.color ?? 'var(--accent)' }">
            <img v-if="groupCoverTrack?.cover" :src="groupCoverTrack.cover" alt="" decoding="async" class="h-full w-full object-cover" />
            <template v-else>{{ groupTitle.charAt(0) }}</template>
          </span>
          <div class="@container flex min-w-0 flex-col sm:flex-1">
            <template v-if="activePlaylist">
              <h1 class="truncate font-black tracking-tight transition-[font-size] duration-200" :class="collapsed ? 'text-base' : 'text-2xl'">{{ activePlaylist.name }}</h1>
              <p v-if="!collapsed" class="mt-1 text-sm text-muted">{{ t("library.playlists.count", { count: activePlaylist.tracks.length }) }}</p>
            </template>
            <template v-else-if="smartPlays">
              <h1 class="truncate font-black tracking-tight transition-[font-size] duration-200" :class="collapsed ? 'text-base' : 'text-2xl'">{{ t("playlistsPage.recentTitle") }}</h1>
              <p v-if="!collapsed" class="mt-1 text-sm text-muted">{{ t("library.tracks", { count: sourceTracks.length }) }}</p>
            </template>
            <template v-else-if="isGroup">
              <h1 class="truncate font-black tracking-tight transition-[font-size] duration-200" :class="collapsed ? 'text-base' : 'text-2xl'">{{ groupTitle }}</h1>
              <p v-if="!collapsed" class="mt-1 text-sm text-muted">{{ t("library.tracks", { count: sourceTracks.length }) }}</p>
            </template>
            <template v-else>
              <h1 class="truncate font-black tracking-tight transition-[font-size] duration-200" :class="collapsed ? 'text-base' : 'text-2xl'">{{ sourceFilter ? (sourceName ?? t("nav.tracks")) : t("nav.tracks") }}</h1>
              <p v-if="!collapsed" class="mt-1 text-sm text-muted">{{ t("library.tracks", { count: sourceTracks.length }) }}</p>
            </template>

            <div class="mt-auto flex flex-wrap items-center gap-3 pt-4">
              <div class="flex w-full min-w-0 items-center gap-3 @2xl:order-2 @2xl:ml-auto @2xl:w-auto" :class="activePlaylist || smartPlays ? 'order-2' : 'order-1'">
                <button v-if="!activePlaylist && !smartPlays && !isGroup" type="button" class="grid h-10 w-10 shrink-0 place-items-center border border-line text-dim transition-colors hover:border-accent hover:text-accent disabled:opacity-50" :title="t('library.refresh')" :disabled="refreshing" @click="emit('refresh')"><RefreshCw :size="16" :stroke-width="2" :class="refreshing ? 'animate-spin' : ''" /></button>
              </div>
              <div v-if="activePlaylist || smartPlays || isGroup" class="flex items-center gap-3 @2xl:order-1" :class="activePlaylist || smartPlays ? 'order-1' : 'order-2'">
                <template v-if="activePlaylist || smartPlays">
                  <button type="button" class="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-accent px-3.5 text-xs font-semibold text-accent-fg transition-transform active:scale-95 disabled:opacity-50" :disabled="!tracks.length" @click="playFirst"><Play :size="14" :stroke-width="2.2" />{{ t("library.play") }}</button>
                  <button v-if="activePlaylist" type="button" class="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-surface px-3.5 text-xs font-medium text-muted transition-colors hover:text-fg" @click="emit('edit', activePlaylist.id)"><Pencil :size="14" />{{ t("library.edit") }}</button>
                  <button v-if="activePlaylist" type="button" class="flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-medium transition-colors" :class="activePlaylist.smartTransition?.enabled ? 'bg-accent-soft text-accent' : 'bg-surface text-muted hover:text-fg'" :title="t('library.playlists.smart.buttonHint')" @click="openSmart">
                    <Sparkles :size="15" />
                    {{ activePlaylist.smartTransition?.status === 'ready' ? t('library.playlists.smart.badgeReady') : t('library.playlists.smart.button') }}
                    <span v-if="activePlaylist.smartTransition?.status === 'stale'" class="border border-amber-500/50 px-1.5 text-[10px] font-mono uppercase text-amber-400">{{ t('library.playlists.smart.badgeStale') }}</span>
                  </button>
                  <button
                    v-if="activePlaylist"
                    type="button"
                    role="switch"
                    :aria-checked="smartEnabled"
                    :title="t('library.playlists.smart.toggleHint')"
                    class="flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors"
                    :class="smartEnabled ? 'bg-accent-soft text-accent' : 'bg-surface text-muted hover:text-fg'"
                    @click="toggleSmart"
                  >
                    <span class="relative inline-flex h-4 w-8 shrink-0 rounded-full transition-colors" :class="smartEnabled ? 'bg-accent/70' : 'bg-line'">
                      <span class="absolute top-0.5 h-3 w-3 rounded-full bg-bg transition-transform" :class="smartEnabled ? 'translate-x-[18px]' : 'translate-x-0.5'" />
                    </span>
                    {{ smartEnabled ? t('library.playlists.smart.toggleOn') : t('library.playlists.smart.toggleOff') }}
                  </button>
                </template>
                <button v-else type="button" class="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-accent px-3.5 text-xs font-semibold text-accent-fg transition-transform active:scale-95 disabled:opacity-50" :disabled="!tracks.length" @click="playFirst"><Play :size="14" :stroke-width="2.2" />{{ t("library.collections.playAll") }}</button>
              </div>
              <div class="order-3 flex items-center gap-3">
                <TrackSortMenu v-if="!smartPlays" :context="sortContext" />
                <ViewModeToggle />
                <button type="button" class="grid h-10 w-10 shrink-0 place-items-center border transition-colors" :class="selectMode ? 'border-accent bg-accent text-accent-fg' : 'border-line text-dim hover:border-accent hover:text-accent'" :title="t('library.selectMode')" @click="toggleSelectMode"><ListChecks :size="16" :stroke-width="2" /></button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div v-if="player.tracks.length === 0" class="ak-frame grid shrink-0 place-items-center gap-4 border border-dashed border-line bg-surface/50 px-6 py-20 text-center">
        <template v-if="loading"><span class="ak-pulse"></span><p class="text-sm font-semibold uppercase tracking-[0.2em] text-muted">{{ t("library.loading") }}</p></template>
        <template v-else><p class="max-w-md text-sm text-muted">{{ t("library.emptyDesc") }}</p></template>
      </div>
      <div v-else class="min-h-0 flex-1"><TrackList v-model:selected="selected" :tracks="tracks" :scroller="scroller" :letter-index="letterIndex" empty-key="library.playlists.noTracks" :selectable="selectMode" @play="play" @menu="openContextMenu" @open-artist="emit('openArtist', $event)" @open-album="emit('openAlbum', $event)" /></div>

      <TrackContextMenu v-if="contextTrack" :track="contextTrack" :x="contextPosition.x" :y="contextPosition.y" :selected-paths="[...selected]" :playlist-id="activePlaylist?.id ?? null" :downloading="downloadingTrackId === contextTrack.id" @close="contextTrack = null" @download-metadata="downloadMetadata" @edit-lyrics="emit('editLyrics', $event)" @edit-info="emit('editInfo', $event)" @show-info="emit('showInfo', $event)" />
      <SmartTransitionDialog v-if="activePlaylist" :playlist-id="activePlaylist.id" :open="smartOpen" @close="smartOpen = false" />
    </div>
  </div>
</template>
