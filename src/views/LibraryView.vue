<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { AudioLines, LoaderCircle, Play, Plus, RefreshCw, X } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import { usePlayerStore } from "../stores/player";
import type { Track } from "../stores/player";
import { tracksForPaths, useProfileStore } from "../stores/profile";
import { coverPending, initial } from "../lib/format";
import { trackKey } from "../lib/sources";
import type { View } from "../lib/app";
import { RECENT_PLAYS_ID } from "../lib/app";
import PlaylistCover from "../components/PlaylistCover.vue";
import TrackContextMenu from "../components/TrackContextMenu.vue";

withDefaults(defineProps<{ loading: boolean; downloadingTrackId?: number | null }>(), { downloadingTrackId: null });
const emit = defineEmits<{ settings: []; downloadMetadata: [track: Track]; editLyrics: [track: Track]; editInfo: [track: Track]; showInfo: [track: Track]; navigate: [view: View]; openPlaylist: [id: string] }>();
const { t } = useI18n();
const player = usePlayerStore();
const profile = useProfileStore();
const contextTrack = ref<Track | null>(null);
const contextPosition = ref({ x: 0, y: 0 });

/** Randomly recommended tracks, held by path so a library re-list keeps the same picks with fresh metadata. */
const recommendedPaths = ref<string[]>([]);
const recommended = computed(() => tracksForPaths(recommendedPaths.value, player.tracks));
const creating = ref(false);
const newName = ref("");

const HOME_LIMIT = 8;

/** Tracks most recently added to the library, newest source modification first. */
const recentlyAdded = computed(() => {
  const indexed = player.tracks
    .map((track, index) => ({ track, index, time: Date.parse(track.modified ?? "") || 0 }))
    .filter((item) => item.track.path);
  indexed.sort((a, b) => (b.time - a.time) || (a.index - b.index));
  return indexed.slice(0, HOME_LIMIT).map((item) => item.track);
});
const recentTracks = computed(() => tracksForPaths(profile.recent, player.tracks).slice(0, HOME_LIMIT));

const EXT_LABEL: Record<string, string> = {
  mp3: "MP3", flac: "FLAC", ogg: "OGG", wav: "WAV", m4a: "M4A", aac: "AAC", opus: "OPUS", ape: "APE", wma: "WMA",
};
function extLabel(track: Track): string {
  const ext = (track.path ?? "").split(".").pop()?.toLowerCase() ?? "";
  return EXT_LABEL[ext] ?? (ext ? ext.toUpperCase().slice(0, 4) : "");
}

function pickRandom(list: Track[], count: number): Track[] {
  const pool = list.filter((track) => track.path);
  const used = new Set<number>();
  const result: Track[] = [];
  while (result.length < count && used.size < pool.length) {
    const index = Math.floor(Math.random() * pool.length);
    if (used.has(index)) continue;
    used.add(index);
    result.push(pool[index]);
  }
  return result;
}
function refreshRecommended() {
  recommendedPaths.value = pickRandom(player.tracks, HOME_LIMIT)
    .map((track) => trackKey(track))
    .filter((key): key is string => !!key);
}
/**
 * Fingerprint of the library's track paths. A remote re-list re-applies the same
 * library with fresh objects, so reshuffle only when the paths truly change
 * instead of on every `player.tracks` reassignment.
 */
const librarySignature = computed(() =>
  player.tracks.map((track) => trackKey(track)).filter((key): key is string => !!key).sort().join("\n"),
);
watch(librarySignature, refreshRecommended, { immediate: true });

function play(track: Track) { void player.playInQueue(player.tracks, track); }
function openContextMenu(event: MouseEvent, track: Track) { contextTrack.value = track; contextPosition.value = { x: event.clientX, y: event.clientY }; }
function downloadMetadata(track: Track) { emit("downloadMetadata", track); }

function selectPlaylist(id: string) { emit("openPlaylist", id); }
function startCreate() { creating.value = true; newName.value = ""; }
function confirmCreate() { const name = newName.value.trim(); if (name) profile.createPlaylist(name); creating.value = false; newName.value = ""; }

function isActive(track: Track) { return track.id === player.currentTrack?.id; }
</script>

<template>
  <div class="mx-auto w-full max-w-6xl px-6 py-6">
    <div v-if="player.tracks.length === 0" class="ak-frame grid place-items-center gap-4 border border-dashed border-line bg-surface/50 px-6 py-24 text-center">
      <template v-if="loading"><span class="ak-pulse"></span><p class="text-sm font-semibold uppercase tracking-[0.2em] text-muted">{{ t("library.loading") }}</p></template>
      <template v-else><AudioLines :size="36" class="text-dim" /><p class="text-base font-semibold uppercase tracking-[0.2em]">{{ t("library.emptyTitle") }}</p><p class="max-w-md text-sm text-muted">{{ t("library.emptyDesc") }}</p><button type="button" class="ak-clip-tr h-10 bg-accent px-5 text-[13px] font-bold uppercase tracking-[0.25em] text-accent-fg" @click="emit('settings')">{{ t("library.emptyAction") }}</button></template>
    </div>

    <template v-else>
      <!-- Daily recommendation: wide cover cards on a horizontal rail. -->
      <section v-if="recommended.length">
        <div class="mb-3 mt-2 flex items-center justify-between">
          <h2 class="text-lg font-bold tracking-tight">{{ t("home.dailyRecommend") }}</h2>
          <button type="button" class="flex h-8 items-center gap-1.5 rounded-full bg-surface px-3 text-xs font-medium text-muted transition-colors hover:text-fg" @click="refreshRecommended">
            <RefreshCw :size="13" />{{ t("home.refresh") }}
          </button>
        </div>
        <div class="no-scrollbar -mx-6 flex gap-4 overflow-x-auto px-6 pb-2">
          <article
            v-for="track in recommended"
            :key="`rec-${track.id}`"
            class="ak-clip-tr group relative aspect-[4/5] w-[62%] max-w-[260px] shrink-0 cursor-pointer overflow-hidden"
            :style="{ backgroundColor: track.color }"
            @click="play(track)"
            @contextmenu.prevent="openContextMenu($event, track)"
          >
            <img v-if="track.cover" :src="track.cover" alt="" loading="lazy" decoding="async" class="absolute inset-0 h-full w-full object-cover" />
            <LoaderCircle v-else-if="coverPending(track)" :size="26" :stroke-width="2" class="absolute inset-0 m-auto animate-spin text-white/90" />
            <span v-else class="absolute inset-0 grid place-items-center text-4xl font-black text-white/90">{{ initial(track) }}</span>
            <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent p-4">
              <p class="truncate text-base font-semibold text-white">{{ track.title }}</p>
              <p class="mt-0.5 truncate text-xs text-white/75">{{ track.artist }}</p>
            </div>
          </article>
        </div>
      </section>

      <!-- Recently added: square cover cards on a horizontal rail. -->
      <section v-if="recentlyAdded.length">
        <div class="mb-3 mt-6 flex items-center justify-between">
          <h2 class="text-lg font-bold tracking-tight">{{ t("home.recentlyAdded") }}</h2>
          <button type="button" class="flex h-8 items-center rounded-full bg-surface px-3 text-xs font-medium text-muted transition-colors hover:text-fg" @click="emit('navigate', 'tracks')">{{ t("home.allSongs") }}</button>
        </div>
        <div class="no-scrollbar -mx-6 flex gap-4 overflow-x-auto px-6 pb-2">
          <article
            v-for="track in recentlyAdded"
            :key="`add-${track.id}`"
            class="w-24 shrink-0 cursor-pointer"
            @click="play(track)"
            @contextmenu.prevent="openContextMenu($event, track)"
          >
            <div class="ak-clip-tr relative aspect-square overflow-hidden" :style="{ backgroundColor: track.color }">
              <img v-if="track.cover" :src="track.cover" alt="" loading="lazy" decoding="async" class="absolute inset-0 h-full w-full object-cover" />
              <LoaderCircle v-else-if="coverPending(track)" :size="22" :stroke-width="2" class="absolute inset-0 m-auto animate-spin text-white/90" />
              <span v-else class="absolute inset-0 grid place-items-center text-3xl font-black text-white/90">{{ initial(track) }}</span>
              <button
                type="button"
                class="absolute inset-0 m-auto grid h-10 w-10 place-items-center rounded-full bg-black/45 text-white transition-transform active:scale-95"
                :title="t('controls.play')"
                @click.stop="play(track)"
              >
                <span v-if="isActive(track) && player.isPlaying" class="ak-eq"><i></i><i></i><i></i></span>
                <Play v-else :size="16" />
              </button>
            </div>
            <p class="mt-2 truncate text-sm font-medium">{{ track.title }}</p>
            <p class="truncate text-xs text-muted">{{ track.artist }}</p>
          </article>
        </div>
      </section>

      <!-- Recently played: compact rows with format badge, duration and thumb. -->
      <section v-if="recentTracks.length">
        <div class="mb-1 mt-6 flex items-center justify-between">
          <h2 class="text-lg font-bold tracking-tight">{{ t("home.recent") }}</h2>
          <button type="button" class="flex h-8 items-center rounded-full bg-surface px-3 text-xs font-medium text-muted transition-colors hover:text-fg" @click="emit('openPlaylist', RECENT_PLAYS_ID)">{{ t("home.history") }}</button>
        </div>
        <div class="flex flex-col">
          <button
            v-for="track in recentTracks"
            :key="`hist-${track.id}`"
            type="button"
            class="ak-hover flex w-full items-center gap-3 py-3 text-left"
            :class="isActive(track) ? 'text-accent' : ''"
            @click="play(track)"
            @contextmenu.prevent="openContextMenu($event, track)"
          >
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-semibold" :class="isActive(track) ? 'text-accent' : 'text-fg'">{{ track.title }}</p>
              <p class="mt-0.5 truncate text-xs text-muted">{{ track.artist }}</p>
            </div>
            <span v-if="extLabel(track)" class="shrink-0 rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-muted">{{ extLabel(track) }}</span>
            <span class="shrink-0 font-mono text-xs tabular-nums text-muted">{{ track.duration }}</span>
            <span class="grid h-12 w-12 shrink-0 place-items-center overflow-hidden" :style="{ backgroundColor: track.color }">
              <img v-if="track.cover" :src="track.cover" alt="" loading="lazy" decoding="async" class="h-full w-full object-cover" />
              <LoaderCircle v-else-if="coverPending(track)" :size="18" :stroke-width="2" class="animate-spin text-white/90" />
              <span v-else class="text-xl font-black text-white/90">{{ initial(track) }}</span>
            </span>
          </button>
        </div>
      </section>

      <section class="mt-8">
        <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h2 class="flex items-center gap-3 text-sm font-bold uppercase tracking-[0.25em]"><span class="h-3 w-1 bg-accent"></span>{{ t("home.playlists") }}</h2>
          <div class="flex flex-wrap items-center gap-4">
            <button v-if="!creating" type="button" class="text-[12px] font-semibold uppercase tracking-[0.2em] text-dim transition-colors hover:text-fg" @click="emit('navigate', 'playlists')">{{ t("library.playlists.viewAll") }}</button>
            <form v-if="creating" class="flex items-center gap-2" @submit.prevent="confirmCreate">
              <input v-model="newName" autofocus :placeholder="t('library.playlists.namePlaceholder')" class="h-8 border border-line bg-bg px-2 text-[13px] outline-none focus:border-accent" />
              <button type="submit" class="ak-clip-tr h-8 bg-accent px-3 text-[12px] font-bold text-accent-fg">{{ t("library.playlists.create") }}</button>
              <button type="button" class="grid h-8 w-8 place-items-center text-dim hover:text-fg" @click="creating = false"><X :size="15" /></button>
            </form>
            <button v-else type="button" class="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.2em] text-dim transition-colors hover:text-fg" @click="startCreate"><Plus :size="14" />{{ t("library.playlists.new") }}</button>
          </div>
        </div>
        <p v-if="profile.playlists.length === 0 && !creating" class="text-sm text-muted">{{ t("library.playlists.empty") }}</p>
        <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <article v-for="playlist in profile.playlists" :key="playlist.id" class="flex cursor-pointer items-center gap-3 border border-line bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-accent" @click="selectPlaylist(playlist.id)">
            <PlaylistCover :playlist="playlist" class="h-11 w-11" :icon-size="20" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-semibold">{{ playlist.name }}</p>
              <p class="font-mono text-[11px] uppercase tracking-[0.15em] text-dim">{{ t("library.playlists.count", { count: playlist.tracks.length }) }}</p>
            </div>
          </article>
        </div>
      </section>
    </template>

    <TrackContextMenu v-if="contextTrack" :track="contextTrack" :x="contextPosition.x" :y="contextPosition.y" :downloading="downloadingTrackId === contextTrack.id" @close="contextTrack = null" @download-metadata="downloadMetadata" @edit-lyrics="emit('editLyrics', $event)" @edit-info="emit('editInfo', $event)" @show-info="emit('showInfo', $event)" />
  </div>
</template>
