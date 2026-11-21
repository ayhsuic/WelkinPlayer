<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { History, ListMusic, LoaderCircle, RefreshCw, User } from "@lucide/vue";
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
/** Recently played shows one extra row; the recommendation and added lists keep HOME_LIMIT. */
const RECENT_LIMIT = 9;

/** Tracks most recently added to the library, newest source modification first. */
const recentlyAdded = computed(() => {
  const indexed = player.tracks
    .map((track, index) => ({ track, index, time: Date.parse(track.modified ?? "") || 0 }))
    .filter((item) => item.track.path);
  indexed.sort((a, b) => (b.time - a.time) || (a.index - b.index));
  return indexed.slice(0, HOME_LIMIT).map((item) => item.track);
});
const recentTracks = computed(() => tracksForPaths(profile.recent, player.tracks).slice(0, RECENT_LIMIT));

/** Home section layout toggles: recent plays rail ↔ row list; recent adds rail ↔ album grid.
 *  Persisted locally so the chosen layout survives an app restart. */
const RECENT_LIST_KEY = "welkin.home.recentListMode";
const ADDED_GRID_KEY = "welkin.home.addedGridMode";
function readStoredFlag(key: string, fallback: boolean): boolean {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === "1";
}
const recentListMode = ref(readStoredFlag(RECENT_LIST_KEY, false));
const addedGridMode = ref(readStoredFlag(ADDED_GRID_KEY, false));
watch(recentListMode, (value) => localStorage.setItem(RECENT_LIST_KEY, value ? "1" : "0"));
watch(addedGridMode, (value) => localStorage.setItem(ADDED_GRID_KEY, value ? "1" : "0"));

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
onBeforeUnmount(() => {
  scroller?.removeEventListener("scroll", syncCollapsed);
});

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

function play(track: Track) {
  if (isActive(track)) { void player.togglePlayback(); return; }
  void player.playInQueue(player.tracks, track);
}
function openContextMenu(event: MouseEvent, track: Track) { contextTrack.value = track; contextPosition.value = { x: event.clientX, y: event.clientY }; }
function downloadMetadata(track: Track) { emit("downloadMetadata", track); }

function isActive(track: Track) { return track.id === player.currentTrack?.id; }
</script>

<template>
  <div ref="rootEl" class="home-root-pad mx-auto w-full">
    <!-- Home header: title on the left, avatar entry to settings on the right.
         Sticky: scrolling tucks the large title and avatar into a pinned top bar. -->
    <header
      class="home-header home-scroll-pad sticky top-0 z-20 flex items-center justify-between transition-[padding,background-color,border-color] duration-200"
      :class="[collapsed ? 'is-collapsed border-b border-line bg-bg/95 backdrop-blur' : 'border-b border-transparent bg-transparent']"
    >
      <h1
        class="home-header__title truncate font-black tracking-tight transition-[font-size] duration-200"
      >{{ t("nav.home") }}</h1>
      <button
        type="button"
        class="home-header__avatar grid shrink-0 place-items-center rounded-full border border-line bg-surface text-accent transition-[width,height,font-size] duration-200 active:scale-95"
        :aria-label="t('nav.settings')"
        :title="t('nav.settings')"
        @click="emit('settings')"
      >
        <span v-if="avatarInitial" class="home-header__initial font-bold leading-none">{{ avatarInitial }}</span>
        <User v-else class="home-header__icon" :size="collapsed ? 18 : 20" />
      </button>
    </header>

      <!-- Daily recommendation: square cover cards on a horizontal rail. -->
      <section v-if="recommended.length">
        <div class="home-mb-title home-mt-card flex items-center justify-between">
          <h2 class="home-section-title font-bold tracking-tight">{{ t("home.dailyRecommend") }}</h2>
          <button type="button" class="home-chip ak-clip flex items-center border border-line bg-surface font-medium text-muted transition-colors hover:text-fg" @click="refreshRecommended">
            <RefreshCw :size="13" class="home-chip__icon" />{{ t("home.refresh") }}
          </button>
        </div>
        <div class="home-scroll-pad home-gap-x home-pb-rail no-scrollbar flex overflow-x-auto">
          <article
            v-for="track in recommended"
            :key="`rec-${track.id}`"
            class="home-rec-card ak-clip-tr group relative aspect-square shrink-0 cursor-pointer overflow-hidden"
            :style="{ backgroundColor: track.color }"
            @click="play(track)"
            @contextmenu.prevent="openContextMenu($event, track)"
          >
            <img v-if="track.cover" :src="track.cover" alt="" loading="lazy" decoding="async" class="absolute inset-0 h-full w-full object-cover" />
            <LoaderCircle v-else-if="coverPending(track)" :size="26" :stroke-width="2" class="home-rec-spinner absolute inset-0 m-auto animate-spin text-white/90" />
            <span v-else class="home-rec-initial absolute inset-0 grid place-items-center font-black text-white/90">{{ initial(track) }}</span>
            <div class="home-pad-cover absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent">
              <p class="home-rec-title truncate font-semibold text-white">{{ track.title }}</p>
              <p class="home-rec-artist home-mt-caption truncate text-white/75">{{ track.artist }}</p>
            </div>
          </article>
        </div>
      </section>

      <!-- Recently played: tap the title to toggle the three-column rail ↔ row list. -->
      <section v-if="recentTracks.length">
        <div class="home-mb-title home-mt-section flex items-center justify-between">
          <button
            type="button"
            class="home-section-title font-bold tracking-tight transition-colors hover:text-accent"
            :title="t('home.recent')"
            @click="recentListMode = !recentListMode"
          >
            {{ t("home.recent") }}
          </button>
          <button type="button" class="home-chip ak-clip flex items-center border border-line bg-surface font-medium text-muted transition-colors hover:text-fg" @click="emit('openPlaylist', RECENT_PLAYS_ID)">
            <History :size="13" class="home-chip__icon" />{{ t("home.history") }}
          </button>
        </div>

        <!-- List mode: one column in portrait, two equal columns in landscape. -->
        <div v-if="recentListMode" class="home-scroll-pad home-pb-rail">
          <div class="home-recent-columns">
            <article
              v-for="track in recentTracks"
              :key="`hist-list-${track.id}`"
              class="home-list-item flex min-w-0 cursor-pointer items-center"
              @click="play(track)"
              @contextmenu.prevent="openContextMenu($event, track)"
            >
              <div class="home-list-caption min-w-0 flex-1">
                <p class="home-card-title truncate font-semibold" :class="isActive(track) ? 'text-accent' : ''">{{ track.title }}</p>
                <p class="home-card-artist home-mt-caption min-w-0 truncate text-muted">{{ track.artist }}</p>
              </div>
              <div class="home-list-cover ak-clip-tr relative shrink-0 overflow-hidden" :style="{ backgroundColor: track.color }">
                <img v-if="track.cover" :src="track.cover" alt="" loading="lazy" decoding="async" class="absolute inset-0 h-full w-full object-cover" />
                <LoaderCircle v-else-if="coverPending(track)" :size="18" :stroke-width="2" class="home-list-spinner absolute inset-0 m-auto animate-spin text-white/90" />
                <span v-else class="home-list-initial absolute inset-0 grid place-items-center font-black text-white/90">{{ initial(track) }}</span>
                <span v-if="isActive(track) && player.isPlaying" class="absolute home-eq-badge-list text-white"><span class="ak-eq"><i></i><i></i><i></i></span></span>
                <span v-if="isHiRes(track)" class="home-list-hr absolute rounded bg-amber-400/95 font-bold leading-none tracking-wide text-black">HR</span>
              </div>
            </article>
          </div>
        </div>

        <!-- Rail: single horizontal row of smaller square cards; cover + caption stay within 1/4 height. -->
        <div v-else class="home-scroll-pad home-gap-x home-pb-rail no-scrollbar flex overflow-x-auto">
          <article
            v-for="track in recentTracks"
            :key="`hist-${track.id}`"
            class="home-rail-card flex shrink-0 cursor-pointer flex-col"
            @click="play(track)"
            @contextmenu.prevent="openContextMenu($event, track)"
          >
            <div class="flex justify-start">
              <div class="home-card-cover ak-clip-tr relative aspect-square overflow-hidden" :style="{ backgroundColor: track.color }">
                <img v-if="track.cover" :src="track.cover" alt="" loading="lazy" decoding="async" class="absolute inset-0 h-full w-full object-cover" />
                <LoaderCircle v-else-if="coverPending(track)" :size="22" :stroke-width="2" class="home-card-spinner absolute inset-0 m-auto animate-spin text-white/90" />
                <span v-else class="home-card-initial absolute inset-0 grid place-items-center font-black text-white/90">{{ initial(track) }}</span>
                <span v-if="isActive(track) && player.isPlaying" class="absolute home-eq-badge text-white"><span class="ak-eq"><i></i><i></i><i></i></span></span>
                <span v-if="isHiRes(track)" class="home-card-hr absolute rounded bg-amber-400/95 font-bold leading-none tracking-wide text-black">HR</span>
              </div>
            </div>
            <div class="home-mt-card w-full min-w-0">
              <p class="home-card-title truncate font-medium">{{ track.title }}</p>
              <p class="home-card-artist truncate text-muted">{{ track.artist }}</p>
            </div>
          </article>
        </div>
      </section>

      <!-- Recently added: tap the title to toggle the horizontal rail ↔ two-column album grid. -->
      <section v-if="recentlyAdded.length">
        <div class="home-mb-title home-mt-section flex items-center justify-between">
          <button
            type="button"
            class="home-section-title font-bold tracking-tight transition-colors hover:text-accent"
            :title="t('home.recentlyAdded')"
            @click="addedGridMode = !addedGridMode"
          >
            {{ t("home.recentlyAdded") }}
          </button>
          <button type="button" class="home-chip ak-clip flex items-center border border-line bg-surface font-medium text-muted transition-colors hover:text-fg" @click="emit('navigate', 'tracks')">
            <ListMusic :size="13" class="home-chip__icon" />{{ t("home.allSongs") }}
          </button>
        </div>

        <!-- Responsive album grid: columns auto-fill from the minimum cover edge; cover keeps a 1:1 square. -->
        <div v-if="addedGridMode" class="album-wall home-added-wall home-gap-y-grid">
          <article
            v-for="track in recentlyAdded"
            :key="`add-grid-${track.id}`"
            class="album-grid-card flex flex-col cursor-pointer"
            @click="play(track)"
            @contextmenu.prevent="openContextMenu($event, track)"
          >
            <div class="flex w-full justify-start">
              <div class="home-card-cover ak-clip-tr relative aspect-square w-full overflow-hidden" :style="{ backgroundColor: track.color }">
                <img v-if="track.cover" :src="track.cover" alt="" loading="lazy" decoding="async" class="absolute inset-0 h-full w-full object-cover" />
                <LoaderCircle v-else-if="coverPending(track)" :size="22" :stroke-width="2" class="home-card-spinner absolute inset-0 m-auto animate-spin text-white/90" />
                <span v-else class="home-card-initial absolute inset-0 grid place-items-center font-black text-white/90">{{ initial(track) }}</span>
                <span v-if="isActive(track) && player.isPlaying" class="absolute home-eq-badge text-white"><span class="ak-eq"><i></i><i></i><i></i></span></span>
                <span v-if="isHiRes(track)" class="home-card-hr absolute rounded bg-amber-400/95 font-bold leading-none tracking-wide text-black">HR</span>
              </div>
            </div>
            <div class="home-mt-card w-full min-w-0">
              <p class="album-grid-card__title truncate font-medium">{{ track.title }}</p>
              <p class="album-grid-card__artist truncate text-muted">{{ track.artist }}</p>
            </div>
          </article>
        </div>

        <!-- Rail: single horizontal row of smaller square cards; cover + caption stay within 1/4 height. -->
        <div v-else class="home-scroll-pad home-gap-x home-pb-rail no-scrollbar flex overflow-x-auto">
          <article
            v-for="track in recentlyAdded"
            :key="`add-${track.id}`"
            class="home-rail-card flex shrink-0 cursor-pointer flex-col"
            @click="play(track)"
            @contextmenu.prevent="openContextMenu($event, track)"
          >
            <div class="flex justify-start">
              <div class="home-card-cover ak-clip-tr relative aspect-square overflow-hidden" :style="{ backgroundColor: track.color }">
                <img v-if="track.cover" :src="track.cover" alt="" loading="lazy" decoding="async" class="absolute inset-0 h-full w-full object-cover" />
                <LoaderCircle v-else-if="coverPending(track)" :size="22" :stroke-width="2" class="home-card-spinner absolute inset-0 m-auto animate-spin text-white/90" />
                <span v-else class="home-card-initial absolute inset-0 grid place-items-center font-black text-white/90">{{ initial(track) }}</span>
                <span v-if="isActive(track) && player.isPlaying" class="absolute home-eq-badge text-white"><span class="ak-eq"><i></i><i></i><i></i></span></span>
                <span v-if="isHiRes(track)" class="home-card-hr absolute rounded bg-amber-400/95 font-bold leading-none tracking-wide text-black">HR</span>
              </div>
            </div>
            <div class="home-mt-card w-full min-w-0">
              <p class="home-card-title truncate font-medium">{{ track.title }}</p>
              <p class="home-card-artist truncate text-muted">{{ track.artist }}</p>
            </div>
          </article>
        </div>
      </section>

    <TrackContextMenu v-if="contextTrack" :track="contextTrack" :x="contextPosition.x" :y="contextPosition.y" :downloading="downloadingTrackId === contextTrack.id" @close="contextTrack = null" @download-metadata="downloadMetadata" @edit-lyrics="emit('editLyrics', $event)" @edit-info="emit('editInfo', $event)" @show-info="emit('showInfo', $event)" />
  </div>
</template>
