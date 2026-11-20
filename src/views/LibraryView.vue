<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { LayoutGrid, List, LoaderCircle, Play, RefreshCw, User } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import { usePlayerStore } from "../stores/player";
import type { Track } from "../stores/player";
import { tracksForPaths, useProfileStore } from "../stores/profile";
import { coverPending, initial } from "../lib/format";
import { trackKey } from "../lib/sources";
import type { View } from "../lib/app";
import { RECENT_PLAYS_ID } from "../lib/app";
import TrackContextMenu from "../components/TrackContextMenu.vue";

withDefaults(defineProps<{ downloadingTrackId?: number | null }>(), { downloadingTrackId: null });
const emit = defineEmits<{ settings: []; downloadMetadata: [track: Track]; editLyrics: [track: Track]; editInfo: [track: Track]; showInfo: [track: Track]; navigate: [view: View]; openPlaylist: [id: string] }>();
const { t } = useI18n();
const player = usePlayerStore();
const profile = useProfileStore();
const contextTrack = ref<Track | null>(null);
const contextPosition = ref({ x: 0, y: 0 });

/** Randomly recommended tracks, held by path so a library re-list keeps the same picks with fresh metadata. */
const recommendedPaths = ref<string[]>([]);
const recommended = computed(() => tracksForPaths(recommendedPaths.value, player.tracks));

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

/** Home section layout toggles: recent plays rail ↔ row list; recent adds rail ↔ album grid. */
const recentListMode = ref(false);
const addedGridMode = ref(false);

/** First nickname glyph for the home avatar; falls back to the person icon when unnamed. */
const avatarInitial = computed(() => {
  const name = profile.nickname.trim();
  return name ? Array.from(name)[0]?.toUpperCase() ?? "" : "";
});

/** Collapsing sticky header: once the list scrolls past a short peek, the large title
 *  and avatar tuck into a pinned top bar (mirrors Mornye's pinned SliverAppBar). */
const rootEl = ref<HTMLElement | null>(null);
const collapsed = ref(false);
let scroller: HTMLElement | null = null;
const HEADER_PEEK_PX = 12;

function syncCollapsed() {
  collapsed.value = (scroller?.scrollTop ?? 0) > HEADER_PEEK_PX;
}

onMounted(() => {
  let el: HTMLElement | null = rootEl.value?.parentElement ?? null;
  while (el) {
    const overflowY = getComputedStyle(el).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") { scroller = el; break; }
    el = el.parentElement;
  }
  scroller?.addEventListener("scroll", syncCollapsed, { passive: true });
  syncCollapsed();
});
onBeforeUnmount(() => scroller?.removeEventListener("scroll", syncCollapsed));

/** Hi-Res: above the 48 kHz ceiling, or 24-bit and up. */
function isHiRes(track: Track): boolean {
  return (track.sampleRate ?? 0) > 48000 || (track.bitDepth ?? 0) >= 24;
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

function isActive(track: Track) { return track.id === player.currentTrack?.id; }
</script>

<template>
  <div ref="rootEl" class="mx-auto w-full max-w-6xl px-6 py-6">
    <!-- Home header: title on the left, avatar entry to settings on the right.
         Sticky: scrolling tucks the large title and avatar into a pinned top bar. -->
    <header
      class="sticky top-0 z-20 -mx-6 flex items-center justify-between px-6 transition-[padding,background-color,border-color] duration-200"
      :class="collapsed ? 'border-b border-line bg-bg/95 py-2 backdrop-blur' : 'border-b border-transparent bg-transparent py-1'"
    >
      <h1
        class="truncate font-black tracking-tight transition-[font-size] duration-200"
        :class="collapsed ? 'text-base' : 'text-2xl'"
      >{{ t("nav.home") }}</h1>
      <button
        type="button"
        class="grid shrink-0 place-items-center rounded-full border border-line bg-surface text-accent transition-[width,height,font-size] duration-200 active:scale-95"
        :class="collapsed ? 'h-9 w-9' : 'h-11 w-11'"
        :aria-label="t('nav.settings')"
        :title="t('nav.settings')"
        @click="emit('settings')"
      >
        <span v-if="avatarInitial" class="font-bold leading-none" :class="collapsed ? 'text-sm' : 'text-base'">{{ avatarInitial }}</span>
        <User v-else :size="collapsed ? 18 : 20" />
      </button>
    </header>

      <!-- Daily recommendation: square cover cards on a horizontal rail. -->
      <section v-if="recommended.length">
        <div class="mb-3 mt-2 flex items-center justify-between">
          <h2 class="text-lg font-bold tracking-tight">{{ t("home.dailyRecommend") }}</h2>
          <button type="button" class="ak-clip flex h-8 items-center gap-1.5 border border-line bg-surface px-3 text-xs font-medium text-muted transition-colors hover:text-fg" @click="refreshRecommended">
            <RefreshCw :size="13" />{{ t("home.refresh") }}
          </button>
        </div>
        <div class="no-scrollbar -mx-6 flex gap-4 overflow-x-auto px-6 pb-2">
          <article
            v-for="track in recommended"
            :key="`rec-${track.id}`"
            class="ak-clip-tr group relative aspect-square w-[62%] max-w-[260px] shrink-0 cursor-pointer overflow-hidden"
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

      <!-- Recently played: tap the title to toggle the horizontal rail ↔ row list. -->
      <section v-if="recentTracks.length">
        <div class="mb-3 mt-6 flex items-center justify-between">
          <button
            type="button"
            class="flex items-center gap-1.5 text-lg font-bold tracking-tight transition-colors hover:text-accent"
            :title="t('home.recent')"
            @click="recentListMode = !recentListMode"
          >
            {{ t("home.recent") }}
            <List v-if="!recentListMode" :size="16" class="text-dim" />
            <LayoutGrid v-else :size="16" class="text-dim" />
          </button>
          <button type="button" class="ak-clip flex h-8 items-center border border-line bg-surface px-3 text-xs font-medium text-muted transition-colors hover:text-fg" @click="emit('openPlaylist', RECENT_PLAYS_ID)">{{ t("home.history") }}</button>
        </div>

        <!-- Row list: square cover, title + artist, trailing play glyph. -->
        <div v-if="recentListMode" class="flex flex-col">
          <article
            v-for="track in recentTracks"
            :key="`hist-row-${track.id}`"
            class="flex cursor-pointer items-center gap-3 py-2.5"
            @click="play(track)"
            @contextmenu.prevent="openContextMenu($event, track)"
          >
            <div class="ak-clip-tr relative h-14 w-14 shrink-0 overflow-hidden" :style="{ backgroundColor: track.color }">
              <img v-if="track.cover" :src="track.cover" alt="" loading="lazy" decoding="async" class="absolute inset-0 h-full w-full object-cover" />
              <LoaderCircle v-else-if="coverPending(track)" :size="20" :stroke-width="2" class="absolute inset-0 m-auto animate-spin text-white/90" />
              <span v-else class="absolute inset-0 grid place-items-center text-2xl font-black text-white/90">{{ initial(track) }}</span>
              <span v-if="isActive(track) && player.isPlaying" class="absolute bottom-1.5 left-1.5 grid h-6 w-6 place-items-center bg-black/45 text-white"><span class="ak-eq"><i></i><i></i><i></i></span></span>
            </div>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-semibold" :class="isActive(track) ? 'text-accent' : ''">{{ track.title }}</p>
              <p class="truncate text-xs text-muted">{{ track.artist }}</p>
            </div>
            <Play :size="18" class="shrink-0 text-dim" />
          </article>
        </div>

        <!-- Horizontal rail: small square covers. -->
        <div v-else class="no-scrollbar -mx-6 flex gap-4 overflow-x-auto px-6 pb-2">
          <article
            v-for="track in recentTracks"
            :key="`hist-${track.id}`"
            class="w-24 shrink-0 cursor-pointer"
            @click="play(track)"
            @contextmenu.prevent="openContextMenu($event, track)"
          >
            <div class="ak-clip-tr relative aspect-square overflow-hidden" :style="{ backgroundColor: track.color }">
              <img v-if="track.cover" :src="track.cover" alt="" loading="lazy" decoding="async" class="absolute inset-0 h-full w-full object-cover" />
              <LoaderCircle v-else-if="coverPending(track)" :size="22" :stroke-width="2" class="absolute inset-0 m-auto animate-spin text-white/90" />
              <span v-else class="absolute inset-0 grid place-items-center text-3xl font-black text-white/90">{{ initial(track) }}</span>
              <span v-if="isActive(track) && player.isPlaying" class="absolute bottom-1.5 left-1.5 grid h-6 w-6 place-items-center bg-black/45 text-white"><span class="ak-eq"><i></i><i></i><i></i></span></span>
            </div>
            <p class="mt-2 truncate text-sm font-medium">{{ track.title }}</p>
            <p class="truncate text-xs text-muted">{{ track.artist }}</p>
          </article>
        </div>
      </section>

      <!-- Recently added: tap the title to toggle the horizontal rail ↔ two-column album grid. -->
      <section v-if="recentlyAdded.length">
        <div class="mb-3 mt-6 flex items-center justify-between">
          <button
            type="button"
            class="flex items-center gap-1.5 text-lg font-bold tracking-tight transition-colors hover:text-accent"
            :title="t('home.recentlyAdded')"
            @click="addedGridMode = !addedGridMode"
          >
            {{ t("home.recentlyAdded") }}
            <LayoutGrid v-if="!addedGridMode" :size="16" class="text-dim" />
            <List v-else :size="16" class="text-dim" />
          </button>
          <button type="button" class="ak-clip flex h-8 items-center border border-line bg-surface px-3 text-xs font-medium text-muted transition-colors hover:text-fg" @click="emit('navigate', 'tracks')">{{ t("home.allSongs") }}</button>
        </div>

        <!-- Two-column album grid, laid out vertically with the page scroll. -->
        <div v-if="addedGridMode" class="grid grid-cols-2 gap-x-4 gap-y-6">
          <article
            v-for="track in recentlyAdded"
            :key="`add-grid-${track.id}`"
            class="cursor-pointer"
            @click="play(track)"
            @contextmenu.prevent="openContextMenu($event, track)"
          >
            <div class="ak-clip-tr relative aspect-square overflow-hidden" :style="{ backgroundColor: track.color }">
              <img v-if="track.cover" :src="track.cover" alt="" loading="lazy" decoding="async" class="absolute inset-0 h-full w-full object-cover" />
              <LoaderCircle v-else-if="coverPending(track)" :size="22" :stroke-width="2" class="absolute inset-0 m-auto animate-spin text-white/90" />
              <span v-else class="absolute inset-0 grid place-items-center text-3xl font-black text-white/90">{{ initial(track) }}</span>
              <span v-if="isActive(track) && player.isPlaying" class="absolute bottom-1.5 left-1.5 grid h-6 w-6 place-items-center bg-black/45 text-white"><span class="ak-eq"><i></i><i></i><i></i></span></span>
              <span v-if="isHiRes(track)" class="absolute bottom-2 right-2 rounded bg-amber-400/95 px-1.5 py-0.5 text-[9px] font-bold leading-none tracking-wide text-black">HR</span>
            </div>
            <p class="mt-2 truncate text-sm font-medium">{{ track.title }}</p>
            <p class="truncate text-xs text-muted">{{ track.artist }}</p>
          </article>
        </div>

        <!-- Horizontal rail: tap the cover to play directly. -->
        <div v-else class="no-scrollbar -mx-6 flex gap-4 overflow-x-auto px-6 pb-2">
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
              <span v-if="isActive(track) && player.isPlaying" class="absolute bottom-1.5 left-1.5 grid h-6 w-6 place-items-center bg-black/45 text-white"><span class="ak-eq"><i></i><i></i><i></i></span></span>
              <span v-if="isHiRes(track)" class="absolute bottom-2 right-2 rounded bg-amber-400/95 px-1.5 py-0.5 text-[9px] font-bold leading-none tracking-wide text-black">HR</span>
            </div>
            <p class="mt-2 truncate text-sm font-medium">{{ track.title }}</p>
            <p class="truncate text-xs text-muted">{{ track.artist }}</p>
          </article>
        </div>
      </section>

    <TrackContextMenu v-if="contextTrack" :track="contextTrack" :x="contextPosition.x" :y="contextPosition.y" :downloading="downloadingTrackId === contextTrack.id" @close="contextTrack = null" @download-metadata="downloadMetadata" @edit-lyrics="emit('editLyrics', $event)" @edit-info="emit('editInfo', $event)" @show-info="emit('showInfo', $event)" />
  </div>
</template>
