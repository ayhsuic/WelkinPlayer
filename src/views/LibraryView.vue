<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch, type Ref } from "vue";
import { Virtualizer } from "virtua/vue";
import { ChevronLeft, History, ListMusic, LoaderCircle, RefreshCw, Search, User } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import { usePlayerStore } from "../stores/player";
import type { Track } from "../stores/player";
import { tracksForPaths, useProfileStore } from "../stores/profile";
import type { Playlist } from "../lib/profile";
import { groupTracks, groupKeys, isUnknownGroup, type GroupKind } from "../lib/grouping";
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

/** Search box text; drives the in-home search/detail shell. */
const query = ref("");

/** Time-of-day greeting shown beside the avatar, beside the optional nickname. */
const greeting = computed(() => {
  const h = new Date().getHours();
  if (h < 5) return t("home.greetingNight");
  if (h < 11) return t("home.greetingMorning");
  if (h < 13) return t("home.greetingNoon");
  if (h < 18) return t("home.greetingAfternoon");
  if (h < 23) return t("home.greetingEvening");
  return t("home.greetingNight");
});

/* ------------------------- shell state machine ------------------------- */

type DetailFrame = { kind: "artist" | "album" | "genre" | "year" | "playlist"; key: string };

/** Drill-down stack: opening an album from an artist detail pushes a frame;
 *  back pops the top frame. The shell stays in one view, no route change. */
const detailStack = ref<DetailFrame[]>([]);
/** Whether the collapsed search box has been tapped open into the index shell. */
const searchOpen = ref(false);
const searching = computed(() => query.value.trim().length > 0);
const detail = computed<DetailFrame | null>(() => detailStack.value[detailStack.value.length - 1] ?? null);
const mode = computed<"overview" | "index">(() =>
  detail.value || searchOpen.value || searching.value ? "index" : "overview",
);

/** Three index slots, each with its own in-place segment toggle. */
type SegA = "playlists" | "artists";
type SegB = "albums" | "years";
type SegC = "genres" | "tracks";
const segA = ref<SegA>("playlists");
const segB = ref<SegB>("albums");
const segC = ref<SegC>("tracks");

/** Standalone track detail (long-press), separate from the index stack. */
const trackDetail = ref<Track | null>(null);

const q = computed(() => query.value.trim().toLowerCase());
/** Match within a record's own text fields; each category filters itself. */
function matchesSelf(...fields: (string | undefined)[]) {
  if (!q.value) return true;
  return fields.some((f) => (f ?? "").toLowerCase().includes(q.value));
}

const unknownKey: Record<GroupKind, string> = {
  artists: "library.collections.unknownArtist",
  albums: "library.collections.unknownAlbum",
  years: "library.collections.unknownYear",
  genres: "library.collections.unknownGenre",
};

/** Map a detail frame back to its grouping kind. */
function frameGroupKind(kind: DetailFrame["kind"]): GroupKind {
  switch (kind) {
    case "album": return "albums";
    case "genre": return "genres";
    case "year": return "years";
    default: return "artists";
  }
}

/** Localized label for a stack frame, playlist frames resolved by name. */
function frameLabel(f: DetailFrame): string {
  if (f.kind === "playlist") {
    if (f.key === "favorites") return t("nav.favorites");
    if (f.key === "recent") return t("home.recent");
    if (f.key === "added") return t("home.recentlyAdded");
    return profile.playlists.find((p) => p.id === f.key)?.name ?? f.key;
  }
  return isUnknownGroup(f.key) ? t(unknownKey[frameGroupKind(f.kind)]) : f.key;
}

interface Crumb { kind: DetailFrame["kind"]; key: string; label: string; }

/** Breadcrumb trail mirroring the drill-down stack; one segment per frame. */
const detailCrumbs = computed<Crumb[]>(() =>
  detailStack.value.map((f) => ({ kind: f.kind, key: f.key, label: frameLabel(f) })),
);

/** Separator between index levels shown inside the search box text. */
const CRUMB_SEP = " > ";

/** Root label prefixed to every drill-down breadcrumb in the open search box. */
const rootLabel = computed(() => t("home.libraryRoot"));

/** Search box text: root label once opened, breadcrumb trail once framed, live query otherwise. */
const searchBoxText = computed(() => {
  if (detail.value) return [rootLabel.value, ...detailCrumbs.value.map((c) => c.label)].join(CRUMB_SEP);
  if (searchOpen.value) return rootLabel.value;
  return query.value;
});
function onSearchInput(event: Event) {
  if (detail.value) return;
  query.value = (event.target as HTMLInputElement).value;
}

/** Tap the collapsed square search icon: open the index shell over the home page. */
function openSearch() { searchOpen.value = true; }
/** Fold the search box back to the square icon and return to the overview. */
function closeSearch() { searchOpen.value = false; closeDetail(); }

function openDetail(kind: DetailFrame["kind"], key: string) {
  const top = detailStack.value[detailStack.value.length - 1];
  if (top && top.kind === kind && top.key === key) return;
  detailStack.value = [...detailStack.value, { kind, key }];
}
function popDetail() {
  detailStack.value = detailStack.value.slice(0, -1);
}
function closeDetail() {
  detailStack.value = [];
  query.value = "";
}
function backDetail() {
  if (detailStack.value.length > 1) popDetail();
  else if (detailStack.value.length === 1) closeDetail();
  else closeSearch();
}

/* ------------------------- grouped / playlist cards ------------------------- */

interface ShellCard {
  key: string;
  title: string;
  subtitle?: string;
  cover?: string | null;
  color?: string;
  initial?: string;
  playlist?: Playlist;
}

function cardsFrom(tracks: Track[], kind: GroupKind): ShellCard[] {
  // Each category filters itself: artists match the artist name, albums the album
  // name, genres the genre, years the year number — no cross-field mixing.
  return groupTracks(tracks, kind)
    .filter((g) => matchesSelf(g.key))
    .map((g) => {
      const coverTrack = g.tracks.find((x) => x.cover) ?? g.tracks[0];
      const name = isUnknownGroup(g.key) ? t(unknownKey[kind]) : g.key;
      return {
        key: g.key,
        title: name,
        subtitle: t("library.collections.trackCount", { count: g.tracks.length }),
        cover: coverTrack?.cover,
        color: coverTrack?.color,
        initial: name.charAt(0),
      };
    });
}

const favoritesTracks = computed(() => tracksForPaths(profile.favorites, player.tracks));

/** Playlist wall: the three built-in collections, then user playlists, then a
 *  create-new card. */
const playlistCards = computed<ShellCard[]>(() => {
  const fixed: ShellCard[] = [
    { key: "favorites", title: t("nav.favorites"), subtitle: t("library.collections.trackCount", { count: favoritesTracks.value.length }), initial: "♥", color: "#e63946" },
    { key: "recent", title: t("home.recent"), subtitle: t("library.collections.trackCount", { count: recentTracks.value.length }), initial: "⏱", color: "#ff6a00" },
    { key: "added", title: t("home.recentlyAdded"), subtitle: t("library.collections.trackCount", { count: recentlyAdded.value.length }), initial: "+", color: "#16c79a" },
  ];
  const custom: ShellCard[] = profile.playlists.map((playlist) => ({
    key: playlist.id,
    title: playlist.name,
    subtitle: t("library.collections.trackCount", { count: playlist.tracks.length }),
    playlist,
  }));
  const create: ShellCard = { key: "__new__", title: t("home.newPlaylist"), initial: "+", color: "var(--accent)" };
  return [...fixed, ...custom, create];
});

/** Resolve a built-in or user playlist to its tracks. */
function playlistTracksByKey(key: string): Track[] {
  if (key === "favorites") return favoritesTracks.value;
  if (key === "recent") return recentTracks.value;
  if (key === "added") return recentlyAdded.value;
  const pl = profile.playlists.find((p) => p.id === key);
  return pl ? tracksForPaths(pl.tracks, player.tracks) : [];
}

/**
 * Tracks under the drill-down stack: each frame narrows the pool in turn, so
 * parent and child frames are AND-combined (e.g. an artist then an album keeps
 * only tracks under that artist in that album). A playlist frame resets the
 * pool to its own tracks; an empty stack is the whole library.
 */
const contextTracks = computed<Track[]>(() => {
  if (detailStack.value.length === 0) return player.tracks;
  let pool = player.tracks;
  for (const frame of detailStack.value) {
    if (frame.kind === "playlist") {
      pool = playlistTracksByKey(frame.key);
    } else {
      const kind = frameGroupKind(frame.kind);
      pool = pool.filter((x) => groupKeys(x, kind).includes(frame.key));
    }
  }
  return pool;
});

/** Slot A: the top-level chooser (playlist/artist wall) stays live for every
 *  framed condition. A pushed frame only narrows the shared pool; it never
 *  replaces this wall with a read-only hero card. */
const slotACards = computed<ShellCard[]>(() =>
  segA.value === "playlists" ? playlistCards.value : cardsFrom(contextTracks.value, "artists"),
);
/** Slot B: albums ↔ years, filtered by the current context. */
const slotBCards = computed<ShellCard[]>(() =>
  segB.value === "albums" ? cardsFrom(contextTracks.value, "albums") : cardsFrom(contextTracks.value, "years"),
);
/** Slot C: genres ↔ tracks, filtered by the current context. */
const slotCCards = computed<ShellCard[]>(() => cardsFrom(contextTracks.value, "genres"));
const slotCTracks = computed<Track[]>(() => contextTracks.value);

/* --- Index shell slots: reuse the home rail/grid budgets below; only the data
       source and hosts differ. Index arrays back the same virtualizers. --- */
const slotAIndexes = computed(() => slotACards.value.map((_, i) => i));
const slotBIndexes = computed(() => slotBCards.value.map((_, i) => i));
const slotCGenreIndexes = computed(() => slotCCards.value.map((_, i) => i));
const slotCTrackRows = computed(() =>
  Array.from({ length: Math.ceil(slotCTracks.value.length / addCols.value) }, (_, i) => i),
);
function slotCTrackAt(row: number, col: number): Track | undefined {
  return slotCTracks.value[row * addCols.value + col - 1];
}

/** Collapsing sticky header: once the list scrolls past a short peek, the large title
 *  and avatar tuck into a pinned top bar (mirrors Mornye's pinned SliverAppBar). */
const rootEl = ref<HTMLElement | null>(null);
const { scroller } = useCollapsibleHeader(rootEl);

/* --- Daily recommendation: horizontal virtualized open rail. --- */
const recOpenHost = ref<HTMLElement | null>(null);
const slotAHost = ref<HTMLElement | null>(null);
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
function measureRecRail(host: HTMLElement | null = recOpenHost.value) {
  if (!host) return;
  const ch = parseFloat(getComputedStyle(host).getPropertyValue("--ch"));
  const cw = parseFloat(getComputedStyle(host).getPropertyValue("--cw"));
  if (!Number.isNaN(ch)) recCh.value = ch;
  if (!Number.isNaN(cw)) recCw.value = cw;
}

/* --- Rail small cards (recent plays / recently added): horizontal virtualized. --- */
const recentRailHost = ref<HTMLElement | null>(null);
const addedRailHost = ref<HTMLElement | null>(null);
const slotBHost = ref<HTMLElement | null>(null);
const slotCGenreHost = ref<HTMLElement | null>(null);
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
const slotGridHost = ref<HTMLElement | null>(null);
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
  return recentlyAdded.value[row * addCols.value + col - 1];
}
function measureAddWall(host: HTMLElement | null = addWallHost.value) {
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
watch([recOpenHost, slotAHost], ([h1, h2]) => {
  const target = h1 ?? h2 ?? null;
  measureRecRail(target);
  if (typeof ResizeObserver === "undefined") return;
  recResizeObs?.disconnect();
  recResizeObs = new ResizeObserver(() => measureRecRail(recOpenHost.value ?? slotAHost.value));
  if (target) {
    recResizeObs.observe(target);
    if (target.parentElement) recResizeObs.observe(target.parentElement);
  }
}, { immediate: true });
watch([recentRailHost, addedRailHost, slotBHost, slotCGenreHost], (hosts) => {
  const target = hosts.find((h) => h) ?? null;
  measureRailBudget(target);
  if (typeof ResizeObserver === "undefined") return;
  railResizeObs?.disconnect();
  railResizeObs = new ResizeObserver(() => measureRailBudget(recentRailHost.value ?? addedRailHost.value ?? slotBHost.value ?? slotCGenreHost.value));
  if (target) {
    railResizeObs.observe(target);
    if (target.parentElement) railResizeObs.observe(target.parentElement);
  }
}, { immediate: true });
watch(addedGridMode, () => void nextTick(measureAddWall));
observeHost(addWallHost, () => measureAddWall(), { current: addResizeObs });
watch(slotGridHost, (target) => {
  measureAddWall(target);
  if (typeof ResizeObserver === "undefined") return;
  if (target) {
    if (!addResizeObs) addResizeObs = new ResizeObserver(() => measureAddWall(addWallHost.value ?? slotGridHost.value));
    addResizeObs.observe(target);
    if (target.parentElement) addResizeObs.observe(target.parentElement);
  }
}, { immediate: true });

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

/** Long-press opens the standalone track detail; a plain tap plays. The fired
 *  flag suppresses the synthetic click that follows a committed long-press. */
const LONG_PRESS_MS = 500;
let pressTimer: ReturnType<typeof setTimeout> | undefined;
let pressFired = false;
function clearPress() {
  if (pressTimer) { clearTimeout(pressTimer); pressTimer = undefined; }
}
function openTrackDetail(track: Track) { trackDetail.value = track; }
function closeTrackDetail() { trackDetail.value = null; }
function onPressDown(track: Track) {
  pressFired = false;
  clearPress();
  pressTimer = setTimeout(() => {
    pressFired = true;
    openTrackDetail(track);
  }, LONG_PRESS_MS);
}
function onPressEnd() { clearPress(); }
function onTrackTap(track: Track) {
  if (pressFired) { pressFired = false; return; }
  play(track);
}
function downloadMetadata(track: Track) { emit("downloadMetadata", track); }

function isActive(track: Track) { return track.id === player.currentTrack?.id; }

/* ------------------------- card tap handlers ------------------------- */

function onPlaylistCard(card: ShellCard) {
  if (card.key === "__new__") { emit("navigate", "playlist-new"); return; }
  openDetail("playlist", card.key);
}
function onArtistCard(card: ShellCard) { openDetail("artist", card.key); }
function onAlbumCard(card: ShellCard) { openDetail("album", card.key); }
function onGenreCard(card: ShellCard) { openDetail("genre", card.key); }
function onYearCard(card: ShellCard) { openDetail("year", card.key); }

/** Slot A tap: route by the active segment; the chooser stays live under any
 *  framed condition. */
function onSlotACard(card: ShellCard) {
  if (segA.value === "artists") onArtistCard(card);
  else onPlaylistCard(card);
}
/** Slot B tap routes to the active segment's kind. */
function onSlotBCard(card: ShellCard) {
  if (segB.value === "albums") onAlbumCard(card);
  else onYearCard(card);
}
</script>

<template>
  <div ref="rootEl" class="home-root-pad mx-auto w-full">
    <!-- Home content header: avatar/settings entry lives in the content page,
         not the shared top bar. -->
    <div class="home-mt-card flex items-center gap-3">
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
      <div v-if="mode === 'overview'" class="min-w-0 flex-1">
        <p class="home-section-title truncate font-bold tracking-tight">
          {{ greeting }}<span v-if="profile.nickname" class="home-card-artist home-mt-caption"> · {{ profile.nickname }}</span>
        </p>
      </div>
      <!-- Overview: collapsed square search button, same edge as the avatar. -->
      <button
        v-if="mode === 'overview'"
        type="button"
        class="home-header__avatar home-search-toggle ak-clip-tr ml-auto grid shrink-0 place-items-center border border-line bg-surface text-accent active:scale-95"
        :aria-label="t('nav.searchPlaceholder')"
        :title="t('nav.searchPlaceholder')"
        @click="openSearch"
      >
        <Search :size="17" :stroke-width="2" class="text-dim" />
      </button>
      <!-- Index: expanded search bar carrying the breadcrumb path and back action. -->
      <label v-else class="lib-search flex min-w-0 flex-1 items-center gap-3 border border-line bg-surface px-3 ak-clip-tr">
        <button
          type="button"
          class="grid shrink-0 place-items-center text-dim hover:text-fg"
          :aria-label="t('controls.collapse')"
          @click="backDetail"
        >
          <ChevronLeft :size="18" :stroke-width="2" />
        </button>
        <Search :size="17" :stroke-width="2" class="shrink-0 text-dim" />
        <input
          :value="searchBoxText"
          :readonly="!!detail"
          type="search"
          class="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-dim"
          :placeholder="rootLabel"
          :aria-label="t('nav.searchPlaceholder')"
          @input="onSearchInput"
        />
      </label>
    </div>

      <!-- Standalone track detail (long-press): a secondary page over the shell. -->
      <template v-if="trackDetail">
        <div class="home-mb-title home-mt-card flex items-center gap-3">
          <button type="button" class="grid h-9 w-9 shrink-0 place-items-center text-dim hover:text-fg" :aria-label="t('controls.collapse')" @click="closeTrackDetail">
            <ChevronLeft :size="20" :stroke-width="2" />
          </button>
          <div class="min-w-0 flex-1">
            <p class="home-section-title truncate font-bold tracking-tight">{{ trackDetail.title }}</p>
            <p class="home-card-artist home-mt-caption truncate text-muted">{{ trackDetail.artist }}</p>
          </div>
        </div>

        <div class="home-mt-card">
          <div class="home-rec-card ak-clip-tr relative aspect-square w-full overflow-hidden" :style="{ backgroundColor: trackDetail.color }">
            <img v-if="trackDetail.cover" :src="trackDetail.cover" alt="" loading="lazy" decoding="async" class="absolute inset-0 h-full w-full object-cover" />
            <span v-else class="home-rec-initial absolute inset-0 grid place-items-center font-black text-white/90">{{ initial(trackDetail) }}</span>
          </div>
        </div>

        <section class="home-mt-section">
          <div class="home-pb-rail">
            <article
              class="lib-list-item flex min-w-0 cursor-pointer items-center"
              @click="play(trackDetail)"
              @contextmenu.prevent="openContextMenu($event, trackDetail)"
            >
              <div class="min-w-0 flex-1">
                <p class="home-card-title truncate font-semibold" :class="isActive(trackDetail) ? 'text-accent' : ''">{{ trackDetail.title }}</p>
                <p class="home-card-artist home-mt-caption min-w-0 truncate text-muted">{{ trackDetail.artist }}<span v-if="trackDetail.album"> · {{ trackDetail.album }}</span></p>
              </div>
              <div class="lib-list-cover ak-clip-tr relative shrink-0 overflow-hidden" :style="{ backgroundColor: trackDetail.color }">
                <img v-if="trackDetail.cover" :src="trackDetail.cover" alt="" loading="lazy" decoding="async" class="absolute inset-0 h-full w-full object-cover" />
                <LoaderCircle v-else-if="coverPending(trackDetail)" :size="18" :stroke-width="2" class="home-list-spinner absolute inset-0 m-auto animate-spin text-white/90" />
                <span v-else class="home-list-initial absolute inset-0 grid place-items-center font-black text-white/90">{{ initial(trackDetail) }}</span>
              </div>
            </article>
          </div>
        </section>
      </template>

      <template v-else-if="mode === 'overview'">
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
                  @click="onTrackTap(recTrackAt(i)!)"
                  @pointerdown="onPressDown(recTrackAt(i)!)"
                  @pointerup="onPressEnd"
                  @pointercancel="onPressEnd"
                  @pointerleave="onPressEnd"
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
                      class="lib-list-item flex min-w-0 cursor-pointer items-center"
                      :style="{ maxWidth: `${recentColW}px` }"
                      @click="onTrackTap(recentTrackAt(col, row - 1)!)"
                      @pointerdown="onPressDown(recentTrackAt(col, row - 1)!)"
                      @pointerup="onPressEnd"
                      @pointercancel="onPressEnd"
                      @pointerleave="onPressEnd"
                      @contextmenu.prevent="openContextMenu($event, recentTrackAt(col, row - 1)!)"
                    >
                      <div class="home-list-caption min-w-0 flex-1">
                        <p class="home-card-title truncate font-semibold" :class="isActive(recentTrackAt(col, row - 1)!) ? 'text-accent' : ''">{{ recentTrackAt(col, row - 1)!.title }}</p>
                        <p class="home-card-artist home-mt-caption min-w-0 truncate text-muted">{{ recentTrackAt(col, row - 1)!.artist }}</p>
                      </div>
                      <div class="lib-list-cover ak-clip-tr relative shrink-0 overflow-hidden" :style="{ backgroundColor: recentTrackAt(col, row - 1)!.color }">
                        <img v-if="recentTrackAt(col, row - 1)!.cover" :src="recentTrackAt(col, row - 1)!.cover" alt="" loading="lazy" decoding="async" class="absolute inset-0 h-full w-full object-cover" />
                        <LoaderCircle v-else-if="coverPending(recentTrackAt(col, row - 1)!)" :size="18" :stroke-width="2" class="home-list-spinner absolute inset-0 m-auto animate-spin text-white/90" />
                        <span v-else class="home-list-initial absolute inset-0 grid place-items-center font-black text-white/90">{{ initial(recentTrackAt(col, row - 1)!) }}</span>
                        <span v-if="isActive(recentTrackAt(col, row - 1)!) && player.isPlaying" class="absolute home-eq-badge-list text-white"><span class="ak-eq"><i></i><i></i><i></i></span></span>
                        <span v-if="isHiRes(recentTrackAt(col, row - 1)!)" class="home-list-hr absolute bg-amber-400/95 font-bold leading-none tracking-wide text-black">HR</span>
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
                  @click="onTrackTap(recentTracks[i]!)"
                  @pointerdown="onPressDown(recentTracks[i]!)"
                  @pointerup="onPressEnd"
                  @pointercancel="onPressEnd"
                  @pointerleave="onPressEnd"
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
                    @click="onTrackTap(addTrack(row, col)!)"
                    @pointerdown="onPressDown(addTrack(row, col)!)"
                    @pointerup="onPressEnd"
                    @pointercancel="onPressEnd"
                    @pointerleave="onPressEnd"
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
                  @click="onTrackTap(recentlyAdded[i]!)"
                  @pointerdown="onPressDown(recentlyAdded[i]!)"
                  @pointerup="onPressEnd"
                  @pointercancel="onPressEnd"
                  @pointerleave="onPressEnd"
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
      </template>

      <!-- Index mode: three in-place slots (A wall / B albums-years / C genres-tracks). -->
      <template v-else>
        <!-- Slot A: playlist/artist chooser wall; stays live under any condition. -->
        <section class="home-mt-section">
          <div class="home-mb-title home-mt-card flex items-center justify-between">
            <div class="flex gap-3">
              <button
                type="button"
                class="home-section-title tracking-tight font-bold text-fg transition-colors hover:text-accent"
                :title="segA === 'playlists' ? t('nav.artists') : t('nav.playlists')"
                @click="segA = segA === 'playlists' ? 'artists' : 'playlists'"
              >{{ segA === 'playlists' ? t("nav.playlists") : t("nav.artists") }}</button>
            </div>
          </div>
          <div ref="slotAHost" class="home-scroll-pad home-gap-x home-pb-rail no-scrollbar flex overflow-x-auto rec-host--inline" :style="{ height: `${recCardW}px` }">
            <Virtualizer horizontal :data="slotAIndexes" :item-size="recSlotW">
              <template #default="{ item: i }">
                <div v-if="slotACards[i]" :style="{ width: `${recSlotW}px` }">
                  <button
                    :key="slotACards[i]!.key"
                    type="button"
                    class="home-rec-card ak-clip-tr group relative aspect-square shrink-0 overflow-hidden text-left"
                    :style="{ width: `${recCardW}px`, backgroundColor: slotACards[i]!.color ?? 'var(--accent)' }"
                    @click="onSlotACard(slotACards[i]!)"
                  >
                    <img v-if="slotACards[i]!.cover" :src="slotACards[i]!.cover" alt="" loading="lazy" decoding="async" class="absolute inset-0 h-full w-full object-cover" />
                    <span v-else class="home-rec-initial absolute inset-0 grid place-items-center font-black text-white/90">{{ slotACards[i]!.initial ?? slotACards[i]!.title.charAt(0) }}</span>
                    <div class="home-pad-cover absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent">
                      <p class="home-rec-title truncate font-semibold text-white">{{ slotACards[i]!.title }}</p>
                      <p v-if="slotACards[i]!.subtitle" class="home-rec-artist home-mt-caption truncate text-white/75">{{ slotACards[i]!.subtitle }}</p>
                    </div>
                  </button>
                </div>
              </template>
            </Virtualizer>
          </div>
        </section>

        <!-- Slot B: albums ↔ years, filtered by context. -->
        <section class="home-mt-section">
          <div class="home-mb-title home-mt-card flex items-center justify-between">
            <div class="flex gap-3">
              <button
                type="button"
                class="home-section-title tracking-tight font-bold text-fg transition-colors hover:text-accent"
                :title="segB === 'albums' ? t('nav.years') : t('nav.albums')"
                @click="segB = segB === 'albums' ? 'years' : 'albums'"
              >{{ segB === 'albums' ? t("nav.albums") : t("nav.years") }}</button>
            </div>
          </div>
          <div ref="slotBHost" class="home-scroll-pad home-gap-x home-pb-rail no-scrollbar flex overflow-x-auto rail-host--inline" :style="{ height: `${railCardH}px` }">
            <Virtualizer horizontal :data="slotBIndexes" :item-size="railSlotW">
              <template #default="{ item: i }">
                <div v-if="slotBCards[i]" :style="{ width: `${railSlotW}px` }">
                  <button :key="slotBCards[i]!.key" type="button" class="home-rail-card flex shrink-0 cursor-pointer flex-col text-left" :style="{ width: `${railCardW}px` }" @click="onSlotBCard(slotBCards[i]!)">
                    <div class="flex justify-start">
                      <div class="home-card-cover ak-clip-tr relative aspect-square overflow-hidden" :style="{ height: `${railCover}px`, backgroundColor: slotBCards[i]!.color ?? 'var(--accent)' }">
                        <img v-if="slotBCards[i]!.cover" :src="slotBCards[i]!.cover" alt="" loading="lazy" decoding="async" class="absolute inset-0 h-full w-full object-cover" />
                        <span v-else class="home-card-initial absolute inset-0 grid place-items-center font-black text-white/90">{{ slotBCards[i]!.initial ?? slotBCards[i]!.title.charAt(0) }}</span>
                      </div>
                    </div>
                    <div class="home-mt-card w-full min-w-0">
                      <p class="home-card-title truncate font-medium">{{ slotBCards[i]!.title }}</p>
                      <p class="home-card-artist truncate text-muted">{{ slotBCards[i]!.subtitle }}</p>
                    </div>
                  </button>
                </div>
              </template>
            </Virtualizer>
          </div>
        </section>

        <!-- Slot C: genres ↔ tracks, filtered by context. -->
        <section class="home-mt-section">
          <div class="home-mb-title home-mt-card flex items-center justify-between">
            <div class="flex gap-3">
              <button
                type="button"
                class="home-section-title tracking-tight font-bold text-fg transition-colors hover:text-accent"
                :title="segC === 'genres' ? t('nav.tracks') : t('nav.genres')"
                @click="segC = segC === 'genres' ? 'tracks' : 'genres'"
              >{{ segC === 'genres' ? t("nav.genres") : t("nav.tracks") }}</button>
            </div>
          </div>
          <div v-if="segC === 'genres'" ref="slotCGenreHost" class="home-scroll-pad home-gap-x home-pb-rail no-scrollbar flex overflow-x-auto rail-host--inline" :style="{ height: `${railCardH}px` }">
            <Virtualizer horizontal :data="slotCGenreIndexes" :item-size="railSlotW">
              <template #default="{ item: i }">
                <div v-if="slotCCards[i]" :style="{ width: `${railSlotW}px` }">
                  <button :key="slotCCards[i]!.key" type="button" class="home-rail-card flex shrink-0 cursor-pointer flex-col text-left" :style="{ width: `${railCardW}px` }" @click="onGenreCard(slotCCards[i]!)">
                    <div class="flex justify-start">
                      <div class="home-card-cover ak-clip-tr relative aspect-square overflow-hidden" :style="{ height: `${railCover}px`, backgroundColor: slotCCards[i]!.color ?? 'var(--accent)' }">
                        <img v-if="slotCCards[i]!.cover" :src="slotCCards[i]!.cover" alt="" loading="lazy" decoding="async" class="absolute inset-0 h-full w-full object-cover" />
                        <span v-else class="home-card-initial absolute inset-0 grid place-items-center font-black text-white/90">{{ slotCCards[i]!.initial ?? slotCCards[i]!.title.charAt(0) }}</span>
                      </div>
                    </div>
                    <div class="home-mt-card w-full min-w-0">
                      <p class="home-card-title truncate font-medium">{{ slotCCards[i]!.title }}</p>
                      <p class="home-card-artist truncate text-muted">{{ slotCCards[i]!.subtitle }}</p>
                    </div>
                  </button>
                </div>
              </template>
            </Virtualizer>
          </div>
          <div v-else ref="slotGridHost" class="home-added-wall home-gap-y-grid">
            <Virtualizer
              :data="slotCTrackRows"
              :item-size="addRowHeight"
              :scroll-ref="scroller ?? undefined"
              :start-margin="addStartMargin"
            >
              <template #default="{ item: row }">
                <div class="grid" :style="{ gridTemplateColumns: `repeat(${addCols}, minmax(0, 1fr))`, columnGap: `${addColGap}px`, paddingBottom: `${addRowGap}px` }">
                  <template v-for="col in addCols" :key="col">
                    <article
                      v-if="slotCTrackAt(row, col)"
                      :key="`slot-grid-${slotCTrackAt(row, col)!.id}`"
                      class="album-grid-card flex flex-col cursor-pointer"
                      @click="onTrackTap(slotCTrackAt(row, col)!)"
                      @pointerdown="onPressDown(slotCTrackAt(row, col)!)"
                      @pointerup="onPressEnd"
                      @pointercancel="onPressEnd"
                      @pointerleave="onPressEnd"
                      @contextmenu.prevent="openContextMenu($event, slotCTrackAt(row, col)!)"
                    >
                      <div class="flex w-full justify-start">
                        <div class="home-card-cover ak-clip-tr relative aspect-square w-full overflow-hidden" :style="{ backgroundColor: slotCTrackAt(row, col)!.color }">
                          <img v-if="slotCTrackAt(row, col)!.cover" :src="slotCTrackAt(row, col)!.cover" alt="" loading="lazy" decoding="async" class="absolute inset-0 h-full w-full object-cover" />
                          <LoaderCircle v-else-if="coverPending(slotCTrackAt(row, col)!)" :size="22" :stroke-width="2" class="home-card-spinner absolute inset-0 m-auto animate-spin text-white/90" />
                          <span v-else class="home-card-initial absolute inset-0 grid place-items-center font-black text-white/90">{{ initial(slotCTrackAt(row, col)!) }}</span>
                          <span v-if="isActive(slotCTrackAt(row, col)!) && player.isPlaying" class="absolute home-eq-badge text-white"><span class="ak-eq"><i></i><i></i><i></i></span></span>
                          <span v-if="isHiRes(slotCTrackAt(row, col)!)" class="home-card-hr absolute bg-amber-400/95 font-bold leading-none tracking-wide text-black">HR</span>
                        </div>
                      </div>
                      <div class="home-mt-card w-full min-w-0">
                        <p class="album-grid-card__title truncate font-medium">{{ slotCTrackAt(row, col)!.title }}</p>
                        <p class="album-grid-card__artist truncate text-muted">{{ slotCTrackAt(row, col)!.artist }}</p>
                      </div>
                    </article>
                  </template>
                </div>
              </template>
            </Virtualizer>
          </div>
        </section>
      </template>

    <TrackContextMenu v-if="contextTrack" :track="contextTrack" :x="contextPosition.x" :y="contextPosition.y" :downloading="downloadingTrackId === contextTrack.id" @close="contextTrack = null" @download-metadata="downloadMetadata" @edit-lyrics="emit('editLyrics', $event)" @edit-info="emit('editInfo', $event)" @show-info="emit('showInfo', $event)" />
  </div>
</template>
