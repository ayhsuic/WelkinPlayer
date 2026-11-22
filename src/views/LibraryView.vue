<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch, type Ref } from "vue";
import { Virtualizer } from "virtua/vue";
import { History, ListMusic, LoaderCircle, RefreshCw, User } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import { usePlayerStore } from "../stores/player";
import type { Track } from "../stores/player";
import { tracksForPaths, useProfileStore } from "../stores/profile";
import { coverPending, initial } from "../lib/format";
import { trackKey } from "../lib/sources";
import type { View, MainTab } from "../lib/app";
import { RECENT_PLAYS_ID, RECENTLY_ADDED_ID } from "../lib/app";
import { useCollapsibleHeader } from "../composables/useCollapsibleHeader";
import TrackContextMenu from "../components/TrackContextMenu.vue";

withDefaults(defineProps<{ downloadingTrackId?: number | null }>(), { downloadingTrackId: null });
const emit = defineEmits<{ settings: []; downloadMetadata: [track: Track]; editLyrics: [track: Track]; editInfo: [track: Track]; showInfo: [track: Track]; navigate: [view: View]; openPlaylist: [id: string]; selectTab: [tab: MainTab] }>();
const { t } = useI18n();
const player = usePlayerStore();
const profile = useProfileStore();
const contextTrack = ref<Track | null>(null);
const contextPosition = ref({ x: 0, y: 0 });

/** Tracks most recently added to the library, newest source modification first;
   the whole library participates, no count cap. */
const recentlyAdded = computed(() => {
  const indexed = player.tracks
    .map((track, index) => ({ track, index, time: Date.parse(track.modified ?? "") || 0 }))
    .filter((item) => item.track.path);
  indexed.sort((a, b) => (b.time - a.time) || (a.index - b.index));
  return indexed.map((item) => item.track);
});

/** Daily recommendation: a shuffled queue drawn from the recently added list.
   The queue is reseeded on demand (refresh button) or when the added set truly
   changes; a re-list that reapplies the same set keeps the current order. */
const recommended = ref<Track[]>([]);
function shuffleQueue(list: Track[]): Track[] {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function refreshRecommended() {
  recommended.value = shuffleQueue(recentlyAdded.value);
}
// Reseed only when the added track set truly changes; a re-list with the same
// set keeps the current queue. The refresh button reshuffles on demand.
const addedSignature = computed(() => recentlyAdded.value.map((track) => trackKey(track)).join("\n"));
watch(addedSignature, refreshRecommended, { immediate: true });
const recentTracks = computed(() => tracksForPaths(profile.recent, player.tracks));

/** Recently played folded list: three rows per column, columns virtualized
   horizontally over the shared scroller. Column width derives from the row
   height and a fixed entry ratio, capped to the content width. */
const RECENT_ROWS = 3;
const recentHost = ref<HTMLElement | null>(null);
const recentCh = ref(0);
const recentCw = ref(0);
const recentWallW = ref(0);
let recentResizeObs: ResizeObserver | undefined;

const recentColIndexes = computed(() =>
  Array.from({ length: Math.ceil(recentTracks.value.length / RECENT_ROWS) }, (_, i) => i),
);
const recentRowH = computed(() => Math.round((recentCh.value || window.innerHeight) * 0.25 / 3));
const recentColBaseW = computed(() => Math.round(recentRowH.value * 4.7));
const recentColW = computed(() =>
  recentWallW.value ? Math.min(recentColBaseW.value, recentWallW.value) : recentColBaseW.value,
);
const recentColGap = computed(() => Math.min(Math.round((recentCw.value || 312) * 0.067), Math.round((recentCh.value || 840) * 0.029)));
const recentRowGap = computed(() => Math.round((recentCh.value || 840) * 0.016));
// The virtualizer measures each item's content box, so the column gap is reserved
// inside the slot width (entry capped to colW, trailing slot = gap). The last
// column carries no trailing gap: otherwise that dead strip becomes its own
// snap target on a mandatory scroller and pulls the rest position off.
const recentColSlotW = computed(() => recentColW.value + recentColGap.value);
const recentColSize = computed(() => recentColSlotW.value);
const recentColCount = computed(() => recentColIndexes.value.length);
function recentTrackAt(col: number, row: number): Track | undefined {
  return recentTracks.value[col * RECENT_ROWS + row];
}
function measureRecentList() {
  const host = recentHost.value;
  if (!host) return;
  const ch = parseFloat(getComputedStyle(host).getPropertyValue("--ch"));
  const cw = parseFloat(getComputedStyle(host).getPropertyValue("--cw"));
  if (!Number.isNaN(ch)) recentCh.value = ch;
  if (!Number.isNaN(cw)) recentCw.value = cw;
  recentWallW.value = host.clientWidth || Math.round(host.getBoundingClientRect().width);
}

/** Home section layout toggles: recent plays rail ↔ row list; recent adds rail ↔ album grid.
 *  Persisted locally so the chosen layout survives an app restart. */
const RECENT_LIST_KEY = "welkin.home.recentListMode";
const ADDED_GRID_KEY = "welkin.home.addedGridMode";
const REC_BLEED_KEY = "welkin.home.recBleedMode";
function readStoredFlag(key: string, fallback: boolean): boolean {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === "1";
}
const recentListMode = ref(readStoredFlag(RECENT_LIST_KEY, false));
const addedGridMode = ref(readStoredFlag(ADDED_GRID_KEY, false));
// Daily recommendation rail: true = bleed off the right edge (negative margin,
// cards run to the screen edge); false = clipped inside the content width, the
// last card aligns to the content right edge. Toggled from the section title.
const recBleedMode = ref(readStoredFlag(REC_BLEED_KEY, true));
watch(recentListMode, (value) => localStorage.setItem(RECENT_LIST_KEY, value ? "1" : "0"));
watch(addedGridMode, (value) => localStorage.setItem(ADDED_GRID_KEY, value ? "1" : "0"));
watch(recBleedMode, (value) => localStorage.setItem(REC_BLEED_KEY, value ? "1" : "0"));

/** First nickname glyph for the home avatar; falls back to the person icon when unnamed. */
const avatarInitial = computed(() => {
  const name = profile.nickname.trim();
  return name ? Array.from(name)[0]?.toUpperCase() ?? "" : "";
});

/** Collapsing sticky header: once the list scrolls past a short peek, the large title
 *  and avatar tuck into a pinned top bar (mirrors Mornye's pinned SliverAppBar). */
const rootEl = ref<HTMLElement | null>(null);
const { scroller } = useCollapsibleHeader(rootEl);

/* --- Daily recommendation: horizontal virtualized open rail. --- */
const recOpenHost = ref<HTMLElement | null>(null);
const recCh = ref(0);
const recCw = ref(0);
let recResizeObs: ResizeObserver | undefined;
const recIndexes = computed(() => recommended.value.map((_, i) => i));
// Big card edge follows the recommend-card height cap (ch×0.25); the slot
// reserves the rail gap inside the item so the virtualizer measures it correctly.
const recCardW = computed(() => Math.round((recCh.value || window.innerHeight) * 0.25));
const recGap = computed(() => Math.min(Math.round((recCw.value || 312) * 0.044), Math.round((recCh.value || 840) * 0.02)));
const recSlotW = computed(() => recCardW.value + recGap.value);
function recTrackAt(index: number): Track | undefined {
  return recommended.value[index];
}
function measureRecRail() {
  const host = recOpenHost.value;
  if (!host) return;
  const ch = parseFloat(getComputedStyle(host).getPropertyValue("--ch"));
  const cw = parseFloat(getComputedStyle(host).getPropertyValue("--cw"));
  if (!Number.isNaN(ch)) recCh.value = ch;
  if (!Number.isNaN(cw)) recCw.value = cw;
}

/* --- Rail small cards (recent plays / recently added): horizontal virtualized. --- */
const recentRailHost = ref<HTMLElement | null>(null);
const addedRailHost = ref<HTMLElement | null>(null);
const railCh = ref(0);
const railCw = ref(0);
let railResizeObs: ResizeObserver | undefined;
const recentRailIndexes = computed(() => recentTracks.value.map((_, i) => i));
const addedRailIndexes = computed(() => recentlyAdded.value.map((_, i) => i));
const railGap = computed(() => Math.min(Math.round((railCw.value || 312) * 0.044), Math.round((railCh.value || 840) * 0.02)));
// Vertical card: square cover on top (edge matches the folded-list row cover,
// one third of the recommend-card height), caption slot full-width below.
const railCover = computed(() => Math.round(Math.min((railCh.value || window.innerHeight) * 0.25 / 3, (railCw.value || 312) * 0.3)));
const railCardW = computed(() => railCover.value);
const railTextSlot = computed(() => {
  const ch = railCh.value || window.innerHeight;
  const cw = railCw.value || window.innerWidth;
  const titleFs = Math.min(cw * 0.036, ch * 0.026);
  const artistFs = Math.min(cw * 0.03, ch * 0.022);
  return Math.round(titleFs * 1.5 + ch * 0.01 + artistFs * 1.5);
});
const railSlotW = computed(() => railCardW.value + railGap.value);
// Fixed host height so the horizontal virtualizer's 100%-height root does not
// collapse the cross-axis; card height = square cover + caption slot.
const railCardH = computed(() => railCardW.value + railTextSlot.value);
function measureRailBudget(host: HTMLElement | null) {
  if (!host) return;
  const ch = parseFloat(getComputedStyle(host).getPropertyValue("--ch"));
  const cw = parseFloat(getComputedStyle(host).getPropertyValue("--cw"));
  if (!Number.isNaN(ch)) railCh.value = ch;
  if (!Number.isNaN(cw)) railCw.value = cw;
}

/* --- Recently added open wall: row-based vertical virtualization over the shared scroller. --- */
const addWallHost = ref<HTMLElement | null>(null);
const addWallWidth = ref(0);
const addCh = ref(0);
const addCw = ref(0);
const addStartMargin = ref(0);
let addResizeObs: ResizeObserver | undefined;

const addColGap = computed(() =>
  Math.min(Math.round((addCw.value || 312) * 0.033), Math.round((addCh.value || window.innerHeight) * 0.015)),
);
const addCols = computed(() => {
  const ch = addCh.value || window.innerHeight;
  const cap = ch * 0.25;
  // The minimum column edge must not exceed the cover cap; otherwise the slot
  // stays wider than the capped cover and leaves dead space on its right.
  const minCol = Math.min(Math.max(110, ch * 0.16), cap);
  const w = addWallWidth.value || 312;
  return Math.max(1, Math.floor((w + addColGap.value) / (minCol + addColGap.value)));
});
const addRowIndexes = computed(() =>
  Array.from({ length: Math.ceil(recentlyAdded.value.length / addCols.value) }, (_, i) => i),
);
const addRowGap = computed(() => Math.round((addCh.value || window.innerHeight) * 0.022));
// Text slot under the cover: title line + top margin + artist line, derived from
// the same font-size budget as the CSS instead of a fixed px.
const addTextSlot = computed(() => {
  const ch = addCh.value || window.innerHeight;
  const cw = addCw.value || window.innerWidth;
  const titleFs = Math.min(cw * 0.036, ch * 0.026);
  const artistFs = Math.min(cw * 0.03, ch * 0.022);
  return Math.round(titleFs * 1.5 + ch * 0.01 + artistFs * 1.5);
});
const addRowHeight = computed(() => {
  const slot = (addWallWidth.value - addColGap.value * (addCols.value - 1)) / addCols.value;
  // Cover edge capped at the recommend-card edge (ch×0.25); the caption
  // column shares the same cap so it cannot run past the cover's right edge.
  const cover = Math.min(slot, (addCh.value || window.innerHeight) * 0.25);
  return Math.round(cover + addTextSlot.value + addRowGap.value);
});
function addTrack(row: number, col: number): Track | undefined {
  return recentlyAdded.value[row * addCols.value + col];
}
function measureAddWall() {
  const host = addWallHost.value;
  if (!host) return;
  const rect = host.getBoundingClientRect();
  addWallWidth.value = host.clientWidth || Math.round(rect.width);
  const ch = parseFloat(getComputedStyle(host).getPropertyValue("--ch"));
  const cw = parseFloat(getComputedStyle(host).getPropertyValue("--cw"));
  if (!Number.isNaN(ch)) addCh.value = ch;
  if (!Number.isNaN(cw)) addCw.value = cw;
  if (scroller.value) {
    const top = host.getBoundingClientRect().top - scroller.value.getBoundingClientRect().top + scroller.value.scrollTop;
    addStartMargin.value = Math.max(0, top);
  }
}

// Observe a host (and its parent, whose box can change without the host resizing)
// and re-measure the budget whenever either changes.
function observeHost(hostRef: Ref<HTMLElement | null>, measure: () => void, obs: { current?: ResizeObserver | undefined }) {
  watch(hostRef, (host: HTMLElement | null) => {
    measure();
    if (typeof ResizeObserver === "undefined") return;
    obs.current?.disconnect();
    obs.current = new ResizeObserver(measure);
    if (host) {
      obs.current.observe(host);
      if (host.parentElement) obs.current.observe(host.parentElement);
    }
  }, { immediate: true });
}

watch(recentListMode, () => void nextTick(measureRecentList));
observeHost(recentHost, measureRecentList, { current: recentResizeObs });
watch(recOpenHost, (target) => {
  measureRecRail();
  if (typeof ResizeObserver === "undefined") return;
  recResizeObs?.disconnect();
  recResizeObs = new ResizeObserver(measureRecRail);
  if (target) {
    recResizeObs.observe(target);
    if (target.parentElement) recResizeObs.observe(target.parentElement);
  }
}, { immediate: true });
watch([recentRailHost, addedRailHost], ([h1, h2]) => {
  const target = h1 ?? h2 ?? null;
  measureRailBudget(target);
  if (typeof ResizeObserver === "undefined") return;
  railResizeObs?.disconnect();
  railResizeObs = new ResizeObserver(() => measureRailBudget(recentRailHost.value ?? addedRailHost.value));
  if (target) {
    railResizeObs.observe(target);
    if (target.parentElement) railResizeObs.observe(target.parentElement);
  }
}, { immediate: true });
watch(addedGridMode, () => void nextTick(measureAddWall));
observeHost(addWallHost, measureAddWall, { current: addResizeObs });

onBeforeUnmount(() => {
  recentResizeObs?.disconnect();
  recResizeObs?.disconnect();
  railResizeObs?.disconnect();
  addResizeObs?.disconnect();
});

/** Hi-Res: above the 48 kHz ceiling, or 24-bit and up. */
function isHiRes(track: Track): boolean {
  return (track.sampleRate ?? 0) > 48000 || (track.bitDepth ?? 0) >= 24;
}

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
    <!-- Home content header: avatar/settings entry lives in the content page,
         not the shared top bar. -->
    <div class="home-mt-card flex items-center justify-end">
      <button
        type="button"
        class="home-header__avatar ak-clip-tr grid shrink-0 place-items-center border border-line bg-surface text-accent transition-[width,height,font-size] duration-200 active:scale-95"
        :aria-label="t('nav.settings')"
        :title="t('nav.settings')"
        @click="emit('settings')"
      >
        <span v-if="avatarInitial" class="home-header__initial font-bold leading-none">{{ avatarInitial }}</span>
        <User v-else class="home-header__icon" :size="20" />
      </button>
    </div>

      <!-- Daily recommendation: square cover cards on a horizontal rail. -->
      <section v-if="recommended.length">
        <div class="home-mb-title home-mt-card flex items-center justify-between">
          <button
            type="button"
            class="home-section-title font-bold tracking-tight transition-colors hover:text-fg"
            :title="recBleedMode ? t('home.recNoBleed') : t('home.recBleed')"
            @click="recBleedMode = !recBleedMode"
          >{{ t("home.dailyRecommend") }}</button>
          <button type="button" class="home-chip ak-clip flex items-center border border-line bg-surface font-medium text-muted transition-colors hover:text-fg" @click="refreshRecommended">
            <RefreshCw :size="13" class="home-chip__icon" />{{ t("home.refresh") }}
          </button>
        </div>

        <!-- Open rail: natural horizontal row on a baseline scroll host; virtualized horizontally. -->
        <div
          ref="recOpenHost"
          class="home-scroll-pad home-gap-x home-pb-rail no-scrollbar flex overflow-x-auto"
          :class="recBleedMode ? 'rec-host--bleed' : 'rec-host--inline'"
          :style="{ height: `${recCardW}px` }"
        >
          <Virtualizer horizontal :data="recIndexes" :item-size="recSlotW">
            <template #default="{ item: i }">
              <div v-if="recTrackAt(i)" :style="{ width: `${recSlotW}px` }">
                <article
                  :key="`rec-open-${recTrackAt(i)!.id}`"
                  class="home-rec-card ak-clip-tr group relative aspect-square shrink-0 cursor-pointer overflow-hidden"
                  :style="{ width: `${recCardW}px`, backgroundColor: recTrackAt(i)!.color }"
                  @click="play(recTrackAt(i)!)"
                  @contextmenu.prevent="openContextMenu($event, recTrackAt(i)!)"
                >
                  <img v-if="recTrackAt(i)!.cover" :src="recTrackAt(i)!.cover" alt="" loading="lazy" decoding="async" class="absolute inset-0 h-full w-full object-cover" />
                  <LoaderCircle v-else-if="coverPending(recTrackAt(i)!)" :size="26" :stroke-width="2" class="home-rec-spinner absolute inset-0 m-auto animate-spin text-white/90" />
                  <span v-else class="home-rec-initial absolute inset-0 grid place-items-center font-black text-white/90">{{ initial(recTrackAt(i)!) }}</span>
                  <div class="home-pad-cover absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent">
                    <p class="home-rec-title truncate font-semibold text-white">{{ recTrackAt(i)!.title }}</p>
                    <p class="home-rec-artist home-mt-caption truncate text-white/75">{{ recTrackAt(i)!.artist }}</p>
                  </div>
                </article>
              </div>
            </template>
          </Virtualizer>
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

        <!-- List mode: three rows per column; columns virtualized horizontally. -->
        <div v-if="recentListMode" class="home-scroll-pad home-pb-rail">
          <div ref="recentHost" class="home-recent-columns">
            <Virtualizer horizontal :data="recentColIndexes" :item-size="recentColSize">
              <template #default="{ item: col }">
                <div class="home-recent-col" :style="{ width: `${col === recentColCount - 1 ? recentColW : recentColSlotW}px`, rowGap: `${recentRowGap}px` }">
                  <template v-for="row in RECENT_ROWS" :key="row">
                    <article
                      v-if="recentTrackAt(col, row - 1)"
                      :key="`hist-list-${recentTrackAt(col, row - 1)!.id}`"
                      class="home-list-item flex min-w-0 cursor-pointer items-center"
                      :style="{ maxWidth: `${recentColW}px` }"
                      @click="play(recentTrackAt(col, row - 1)!)"
                      @contextmenu.prevent="openContextMenu($event, recentTrackAt(col, row - 1)!)"
                    >
                      <div class="home-list-cover ak-clip-tr relative shrink-0 overflow-hidden" :style="{ backgroundColor: recentTrackAt(col, row - 1)!.color }">
                        <img v-if="recentTrackAt(col, row - 1)!.cover" :src="recentTrackAt(col, row - 1)!.cover" alt="" loading="lazy" decoding="async" class="absolute inset-0 h-full w-full object-cover" />
                        <LoaderCircle v-else-if="coverPending(recentTrackAt(col, row - 1)!)" :size="18" :stroke-width="2" class="home-list-spinner absolute inset-0 m-auto animate-spin text-white/90" />
                        <span v-else class="home-list-initial absolute inset-0 grid place-items-center font-black text-white/90">{{ initial(recentTrackAt(col, row - 1)!) }}</span>
                        <span v-if="isActive(recentTrackAt(col, row - 1)!) && player.isPlaying" class="absolute home-eq-badge-list text-white"><span class="ak-eq"><i></i><i></i><i></i></span></span>
                        <span v-if="isHiRes(recentTrackAt(col, row - 1)!)" class="home-list-hr absolute bg-amber-400/95 font-bold leading-none tracking-wide text-black">HR</span>
                      </div>
                      <div class="home-list-caption min-w-0 flex-1">
                        <p class="home-card-title truncate font-semibold" :class="isActive(recentTrackAt(col, row - 1)!) ? 'text-accent' : ''">{{ recentTrackAt(col, row - 1)!.title }}</p>
                        <p class="home-card-artist home-mt-caption min-w-0 truncate text-muted">{{ recentTrackAt(col, row - 1)!.artist }}</p>
                      </div>
                    </article>
                  </template>
                </div>
              </template>
            </Virtualizer>
          </div>
        </div>

        <!-- Rail: single horizontal row of smaller square cards; virtualized horizontally. -->
        <div v-else ref="recentRailHost" class="home-scroll-pad home-gap-x home-pb-rail no-scrollbar flex overflow-x-auto rail-host--inline" :style="{ height: `${railCardH}px` }">
          <Virtualizer horizontal :data="recentRailIndexes" :item-size="railSlotW">
            <template #default="{ item: i }">
              <div v-if="recentTracks[i]" :style="{ width: `${railSlotW}px` }">
                <article
                  :key="`hist-v-${recentTracks[i]!.id}`"
                  class="home-rail-card flex shrink-0 cursor-pointer flex-col"
                  :style="{ width: `${railCardW}px` }"
                  @click="play(recentTracks[i]!)"
                  @contextmenu.prevent="openContextMenu($event, recentTracks[i]!)"
                >
                  <div class="flex justify-start">
                    <div class="home-card-cover ak-clip-tr relative aspect-square overflow-hidden" :style="{ height: `${railCover}px`, backgroundColor: recentTracks[i]!.color }">
                      <img v-if="recentTracks[i]!.cover" :src="recentTracks[i]!.cover" alt="" loading="lazy" decoding="async" class="absolute inset-0 h-full w-full object-cover" />
                      <LoaderCircle v-else-if="coverPending(recentTracks[i]!)" :size="22" :stroke-width="2" class="home-card-spinner absolute inset-0 m-auto animate-spin text-white/90" />
                      <span v-else class="home-card-initial absolute inset-0 grid place-items-center font-black text-white/90">{{ initial(recentTracks[i]!) }}</span>
                      <span v-if="isActive(recentTracks[i]!) && player.isPlaying" class="absolute home-eq-badge text-white"><span class="ak-eq"><i></i><i></i><i></i></span></span>
                      <span v-if="isHiRes(recentTracks[i]!)" class="home-card-hr absolute bg-amber-400/95 font-bold leading-none tracking-wide text-black">HR</span>
                    </div>
                  </div>
                  <div class="home-mt-card w-full min-w-0">
                    <p class="home-card-title truncate font-medium">{{ recentTracks[i]!.title }}</p>
                    <p class="home-card-artist truncate text-muted">{{ recentTracks[i]!.artist }}</p>
                  </div>
                </article>
              </div>
            </template>
          </Virtualizer>
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
          <button type="button" class="home-chip ak-clip flex items-center border border-line bg-surface font-medium text-muted transition-colors hover:text-fg" @click="emit('openPlaylist', RECENTLY_ADDED_ID)">
            <ListMusic :size="13" class="home-chip__icon" />{{ t("home.viewAll") }}
          </button>
        </div>

        <!-- Responsive album grid: rows virtualized vertically over the shared scroller. -->
        <div v-if="addedGridMode" ref="addWallHost" class="home-added-wall home-gap-y-grid">
          <Virtualizer
            :data="addRowIndexes"
            :item-size="addRowHeight"
            :scroll-ref="scroller ?? undefined"
            :start-margin="addStartMargin"
          >
            <template #default="{ item: row }">
              <div class="grid" :style="{ gridTemplateColumns: `repeat(${addCols}, minmax(0, 1fr))`, columnGap: `${addColGap}px`, paddingBottom: `${addRowGap}px` }">
                <template v-for="col in addCols" :key="col">
                  <article
                    v-if="addTrack(row, col)"
                    :key="`add-grid-${addTrack(row, col)!.id}`"
                    class="album-grid-card flex flex-col cursor-pointer"
                    @click="play(addTrack(row, col)!)"
                    @contextmenu.prevent="openContextMenu($event, addTrack(row, col)!)"
                  >
                    <div class="flex w-full justify-start">
                      <div class="home-card-cover ak-clip-tr relative aspect-square w-full overflow-hidden" :style="{ backgroundColor: addTrack(row, col)!.color }">
                        <img v-if="addTrack(row, col)!.cover" :src="addTrack(row, col)!.cover" alt="" loading="lazy" decoding="async" class="absolute inset-0 h-full w-full object-cover" />
                        <LoaderCircle v-else-if="coverPending(addTrack(row, col)!)" :size="22" :stroke-width="2" class="home-card-spinner absolute inset-0 m-auto animate-spin text-white/90" />
                        <span v-else class="home-card-initial absolute inset-0 grid place-items-center font-black text-white/90">{{ initial(addTrack(row, col)!) }}</span>
                        <span v-if="isActive(addTrack(row, col)!) && player.isPlaying" class="absolute home-eq-badge text-white"><span class="ak-eq"><i></i><i></i><i></i></span></span>
                        <span v-if="isHiRes(addTrack(row, col)!)" class="home-card-hr absolute bg-amber-400/95 font-bold leading-none tracking-wide text-black">HR</span>
                      </div>
                    </div>
                    <div class="home-mt-card w-full min-w-0">
                      <p class="album-grid-card__title truncate font-medium">{{ addTrack(row, col)!.title }}</p>
                      <p class="album-grid-card__artist truncate text-muted">{{ addTrack(row, col)!.artist }}</p>
                    </div>
                  </article>
                </template>
              </div>
            </template>
          </Virtualizer>
        </div>

        <!-- Rail: single horizontal row of smaller square cards; virtualized horizontally. -->
        <div v-else ref="addedRailHost" class="home-scroll-pad home-gap-x home-pb-rail no-scrollbar flex overflow-x-auto rail-host--inline" :style="{ height: `${railCardH}px` }">
          <Virtualizer horizontal :data="addedRailIndexes" :item-size="railSlotW">
            <template #default="{ item: i }">
              <div v-if="recentlyAdded[i]" :style="{ width: `${railSlotW}px` }">
                <article
                  :key="`add-v-${recentlyAdded[i]!.id}`"
                  class="home-rail-card flex shrink-0 cursor-pointer flex-col"
                  :style="{ width: `${railCardW}px` }"
                  @click="play(recentlyAdded[i]!)"
                  @contextmenu.prevent="openContextMenu($event, recentlyAdded[i]!)"
                >
                  <div class="flex justify-start">
                    <div class="home-card-cover ak-clip-tr relative aspect-square overflow-hidden" :style="{ height: `${railCover}px`, backgroundColor: recentlyAdded[i]!.color }">
                      <img v-if="recentlyAdded[i]!.cover" :src="recentlyAdded[i]!.cover" alt="" loading="lazy" decoding="async" class="absolute inset-0 h-full w-full object-cover" />
                      <LoaderCircle v-else-if="coverPending(recentlyAdded[i]!)" :size="22" :stroke-width="2" class="home-card-spinner absolute inset-0 m-auto animate-spin text-white/90" />
                      <span v-else class="home-card-initial absolute inset-0 grid place-items-center font-black text-white/90">{{ initial(recentlyAdded[i]!) }}</span>
                      <span v-if="isActive(recentlyAdded[i]!) && player.isPlaying" class="absolute home-eq-badge text-white"><span class="ak-eq"><i></i><i></i><i></i></span></span>
                      <span v-if="isHiRes(recentlyAdded[i]!)" class="home-card-hr absolute bg-amber-400/95 font-bold leading-none tracking-wide text-black">HR</span>
                    </div>
                  </div>
                  <div class="home-mt-card w-full min-w-0">
                    <p class="home-card-title truncate font-medium">{{ recentlyAdded[i]!.title }}</p>
                    <p class="home-card-artist truncate text-muted">{{ recentlyAdded[i]!.artist }}</p>
                  </div>
                </article>
              </div>
            </template>
          </Virtualizer>
        </div>
      </section>

    <TrackContextMenu v-if="contextTrack" :track="contextTrack" :x="contextPosition.x" :y="contextPosition.y" :downloading="downloadingTrackId === contextTrack.id" @close="contextTrack = null" @download-metadata="downloadMetadata" @edit-lyrics="emit('editLyrics', $event)" @edit-info="emit('editInfo', $event)" @show-info="emit('showInfo', $event)" />
  </div>
</template>
