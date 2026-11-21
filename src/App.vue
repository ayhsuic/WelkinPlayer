<!--
 Copyright 2026 Atemukesu
 SPDX-License-Identifier: GPL-3.0-only
-->

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, watchEffect } from "vue";
import { useI18n } from "vue-i18n";
import { describeError, invoke } from "./api";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { initAudio, resumeAt } from "./lib/audio";
import { accents, mainNavTabs, type MainTab } from "./lib/app";
import type { Accent, Theme, View } from "./lib/app";
import { albumKey, primaryArtist } from "./lib/grouping";
import { trackKey, type SourceKind } from "./lib/sources";
import { flushReadings, loadReadings } from "./lib/readings";
import { useLibrary } from "./composables/useLibrary";
import { startMediaControl, stopMediaControl } from "./lib/mediaControl";

/** OS media controls are best-effort; a failure must not break app boot. */
function bootMediaControl() {
  try {
    startMediaControl();
  } catch (error) {
    console.warn("[welkin] media controls failed to start", error);
  }
}
import { pushToast } from "./lib/toast";
import { usePlayerStore } from "./stores/player";
import type { Track, PlaybackSnapshot } from "./stores/player";
import { useSourcesStore } from "./stores/sources";
import { useProfileStore, tracksForPaths } from "./stores/profile";
import { useSmartTransitionStore } from "./stores/smartTransition";
import { usePlaybackStore } from "./stores/playback";
import { useLyricsStore } from "./stores/lyrics";
import { useMetadataStore } from "./stores/metadata";
import { useNetworkStore } from "./stores/network";
import { useCacheStore } from "./stores/cache";
import PlayerBar from "./components/PlayerBar.vue";
import PlayerNavBar from "./components/PlayerNavBar.vue";
import MobileNavSheet from "./components/MobileNavSheet.vue";
import MobileTabBar from "./components/MobileTabBar.vue";
import WallView from "./components/wall/WallView.vue";
import AudioQualityModal from "./components/AudioQualityModal.vue";
import MeteredPlaybackModal from "./components/MeteredPlaybackModal.vue";
import ToastStack from "./components/ToastStack.vue";
import LibraryView from "./views/LibraryView.vue";
import PlayerView from "./views/PlayerView.vue";
import SettingsView from "./views/SettingsView.vue";
import TracksView from "./views/TracksView.vue";
import FavoritesView from "./views/FavoritesView.vue";
import CategoriesView from "./views/CategoriesView.vue";
import SearchView from "./views/SearchView.vue";
import LibraryListView from "./views/LibraryListView.vue";
import type { GroupKind } from "./lib/grouping";
import DownloadingView from "./views/DownloadingView.vue";
import DownloadedView from "./views/DownloadedView.vue";
import SourcesView from "./views/SourcesView.vue";
import SourceBrowserView from "./views/SourceBrowserView.vue";
import PlaylistEditorView from "./views/PlaylistEditorView.vue";
import LyricsEditorView from "./views/LyricsEditorView.vue";
import TrackEditorView from "./views/TrackEditorView.vue";
import TrackInfoView from "./views/TrackInfoView.vue";
import SourceConfigView from "./views/SourceConfigView.vue";

/** Hash routes the app can restore on boot; must be initialised before `view` calls `getViewFromHash`. */
const VIEW_ROUTES: ReadonlySet<string> = new Set(["wall", "settings", "player", "tracks", "search", "favorites", "artists", "albums", "years", "genres", "sources", "folders", "webdav", "source-config", "source-browser", "playlists", "playlist-new", "lyrics-edit", "track-edit", "track-info", "downloading", "downloaded"]);
const { t, locale } = useI18n();
const player = usePlayerStore();
const sources = useSourcesStore();
const profile = useProfileStore();
const smart = useSmartTransitionStore();
const playback = usePlaybackStore();
const lyrics = useLyricsStore();
const metadata = useMetadataStore();
const network = useNetworkStore();
const cache = useCacheStore();
const { loadingLibrary, refreshing, friendlyError, loadCachedLibrary, loadRemoteLibrary, refreshLibrary, downloadTrackMetadata } = useLibrary();
const view = ref<View>(getViewFromHash());
/** Views that sit on top of the current page as overlays and must not replace `baseView`. */
const OVERLAY_VIEWS: ReadonlySet<View> = new Set(["player", "track-info", "lyrics-edit", "track-edit"]);
const baseView = ref<View>(OVERLAY_VIEWS.has(view.value) ? "library" : view.value);
const theme = ref<Theme>(localStorage.getItem("welkin-theme") === "dark" ? "dark" : "light");
const accent = ref<Accent>(readAccent());
const downloadingTrackId = ref<number | null>(null);
const booted = ref(false);
const playlistFilter = ref<string | null>(null);
const artistFilter = ref<string | null>(null);
const albumFilter = ref<string | null>(null);
const yearFilter = ref<string | null>(null);
const genreFilter = ref<string | null>(null);
const sourceFilter = ref<string | null>(null);
/** Kind of the source being browsed, so "back" returns to the split page it came from. */
const browseSourceKind = ref<SourceKind>("local");
/** Kind the source editor is scoped to; `null` means every source (Settings). */
const sourceConfigKind = ref<SourceKind | null>(null);
/** The kind the current source page shows; `undefined` means the merged all-sources page. */
const sourcesPageKind = computed<SourceKind | undefined>(() => {
  if (baseView.value === "webdav") return "webdav";
  if (baseView.value === "source-browser") return browseSourceKind.value;
  if (baseView.value === "sources") return undefined;
  return "local";
});

/** The six library categories share one swipeable container while one of them is active (no drill-down). */
const categoryActive = computed(() =>
  ["playlists", "artists", "years", "genres", "albums"].includes(baseView.value) ||
  (baseView.value === "tracks" && !playlistFilter.value && !artistFilter.value && !albumFilter.value && !yearFilter.value && !genreFilter.value && !sourceFilter.value),
);
const browseSourceId = ref<string | null>(null);
const sourceConfigReturn = ref<View>("sources");
const editingPlaylist = ref<string | null>(null);
const editingLyricsTrack = ref<Track | null>(null);
const editingTrack = ref<Track | null>(null);
const viewingTrack = ref<Track | null>(null);
/** The bottom drawer the mobile navigation strip pulls up. */
const sheetOpen = ref(false);
/** Active main tab inside the drawer; independent from the underlying wall view. */
const sheetTab = ref<MainTab>("home");
/** Which bottom tab matches the current drawer page. */
const navTab = computed<MainTab>(() => sheetTab.value);

/* ------------------------------------------------------- split (landscape) */

/**
 * Wide-by-proportion, not a fixed breakpoint: the split two-pane layout opens
 * when the viewport is clearly wider than tall (tablet landscape / wide window).
 * Portrait keeps the mobile wall + bottom drawer.
 */
const isLandscape = ref(false);
/**
 * Rail width follows the short edge (height in landscape), measured from the real
 * viewport rather than a fixed pixel value. Rail width:height is clamped between
 * 9:16 (narrowest) and 3:2 (widest); the wall keeps a minimum 9:21 width:height.
 * Below the 9:21 hide line the rail collapses and the wall goes full-screen.
 */
/** Default rail width as a fraction of the short edge: 1 = the full portrait width. */
const RAIL_BASE_H_RATIO = 1;
const RAIL_MIN_H_RATIO = 9 / 16;
const RAIL_MAX_H_RATIO = 3 / 2;
const WALL_MIN_H_RATIO = 9 / 21;
const RAIL_HIDE_H_RATIO = 9 / 21;
const HANDLE_W = 18;

function railMaxWidth(): number {
  const W = window.innerWidth;
  const H = Math.max(1, window.innerHeight);
  const byRatio = H * RAIL_MAX_H_RATIO;
  const byWall = W - H * WALL_MIN_H_RATIO - HANDLE_W;
  return Math.max(H * RAIL_MIN_H_RATIO, Math.min(byRatio, byWall));
}
function baseRailWidth(): number {
  return Math.max(1, window.innerHeight) * RAIL_BASE_H_RATIO;
}
function clampRail(w: number): number {
  const H = Math.max(1, window.innerHeight);
  const min = H * RAIL_MIN_H_RATIO;
  return Math.min(railMaxWidth(), Math.max(min, w));
}

const NAV_SCALE_KEY = "welkin-nav-scale";
const baseW = ref(baseRailWidth());
/** User width factor relative to the computed base; persisted across restarts. */
const railScale = ref(Number(localStorage.getItem(NAV_SCALE_KEY)) || 1);
const navWidth = ref(Math.round(clampRail(baseW.value * railScale.value)));

/** Short-edge / long-edge ratio of the current viewport (≤1). */
const railRatio = computed(() => {
  const W = window.innerWidth;
  const H = Math.max(1, window.innerHeight);
  return Math.min(1, H / W);
});

/**
 * Element scale for the landscape rail: follows the viewport ratio, nudges with
 * the dragged rail width, capped at 1 (never larger than the portrait base).
 * No floor: elements shrink proportionally with the viewport. Portrait is 1.
 * Driven by the viewport, not screen metrics.
 */
const railElementScale = computed(() => {
  if (!isLandscape.value) return 1;
  const base = Math.max(1, window.innerHeight);
  const byWidth = Math.min(1, navWidth.value / base);
  return Math.min(railRatio.value, byWidth);
});
/** Whether the landscape rail is shown; hidden state lets the wall go full-screen. */
const navVisible = ref(true);
/** Last usable size, kept so reopening restores a comfortable width. */
let lastWidth = navWidth.value;
let lastScale = railScale.value;

function updateLandscape() {
  isLandscape.value = window.innerWidth / Math.max(1, window.innerHeight) >= 1.15;
  baseW.value = baseRailWidth();
  navWidth.value = Math.round(clampRail(baseW.value * railScale.value));
}

let navDrag: { startX: number; startWidth: number } | null = null;
function onHandleDown(event: PointerEvent) {
  navDrag = { startX: event.clientX, startWidth: navWidth.value };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}
function onHandleMove(event: PointerEvent) {
  if (!navDrag) return;
  navWidth.value = Math.round(clampRail(navDrag.startWidth + (event.clientX - navDrag.startX)));
}
function onHandleUp() {
  if (!navDrag) return;
  navDrag = null;
  const H = Math.max(1, window.innerHeight);
  if (navWidth.value < H * RAIL_HIDE_H_RATIO) {
    // Collapse: keep the previous comfortable size for the next open.
    navVisible.value = false;
    navWidth.value = lastWidth;
    railScale.value = lastScale;
  } else {
    lastWidth = navWidth.value;
    railScale.value = navWidth.value / baseW.value;
    lastScale = railScale.value;
    localStorage.setItem(NAV_SCALE_KEY, String(railScale.value));
  }
}
/** Reopen the landscape rail from the full-screen wall (pull-up on the seek bar). */
function openSplitNav() {
  navVisible.value = true;
}

/** Drill-down pages rendered inside the drawer instead of one of the main tab pages. */
const DRAWER_SUB_VIEWS: ReadonlySet<View> = new Set([
  "tracks", "favorites", "artists", "albums", "years", "genres",
  "sources", "folders", "webdav", "source-browser", "source-config", "playlists",
  "playlist-new", "downloading", "downloaded",
]);
const drawerSubView = computed<View | null>(() => (DRAWER_SUB_VIEWS.has(baseView.value) ? baseView.value : null));
/** Bumped to ask the cover wall to re-centre on the playing track. */
const wallFocusToken = ref(0);
let restoringPlayback = false;
let lastPositionSavedAt = 0;
/** Once the user starts playback, a late cloud resume point must be ignored. */
let userTookOver = false;
/** Signature of the resume point already applied, to avoid redundant re-seeks. */
let resumeSignature = "";
/** Track key already resumed; later progress writes must not re-trigger it. */
let resumedKey = "";
/** Local-only safety-net cadence (ms) for periodic progress writes while playing. */
const POSITION_SAVE_INTERVAL_MS = 30_000;

/** Listener for the Rust `playback:changed` snapshot that mirrors into the store. */
let unlistenPlayback: UnlistenFn | null = null;

// The full-screen player, track-info and the track editors are overlays that
// sit on top of whatever page was open, so they must not change `baseView`;
// everything else (including the folder browser) becomes the
// underlying page when opened. Keeping the underlying page mounted preserves its
// scroll position and the source browser's current folder across the overlay.
watch(view, (next) => { if (!OVERLAY_VIEWS.has(next)) baseView.value = next; });

// Reload the library shortly after a source is added, removed or reconfigured,
// so configuring a source in Settings takes effect without a manual refresh.
let sourceReloadTimer = 0;
watch(() => sources.revision, () => {
  if (!booted.value || !sources.hasSources) return;
  window.clearTimeout(sourceReloadTimer);
  sourceReloadTimer = window.setTimeout(() => void loadRemoteLibrary({ silent: true }), 400);
});
watchEffect(() => { document.documentElement.classList.toggle("dark", theme.value === "dark"); document.documentElement.dataset.accent = accent.value; localStorage.setItem("welkin-theme", theme.value); localStorage.setItem("welkin-accent", accent.value); });
watchEffect(() => { document.documentElement.lang = locale.value; localStorage.setItem("welkin-locale", locale.value); });

watch(() => trackKey(player.currentTrack), (key) => { if (booted.value && key && player.isPlaying) profile.recordPlay(key); });

// The playing track's metadata is wanted immediately, regardless of visibility.
// Rust-created placeholders all use id=-1, so use the stable source/path key
// to ensure every newly selected track gets a metadata request.
watch(() => trackKey(player.currentTrack), () => metadata.request(player.currentTrack));

// Keep lyrics loaded and the active line synced for the playing track even
// when the cover wall (not the full player view) is on screen; the wall card
// reads the mirrored lines directly, so this wiring lives at the app level.
watch(
  () => trackKey(player.currentTrack),
  () => { void lyrics.loadForTrack(player.currentTrack ?? undefined); },
);

watch(
  () => player.position,
  (position) => { if (Number.isFinite(position)) lyrics.sync(position); },
);

// Resume the last track/position once the playback state and library are ready.
// The local copy lands first; the authoritative remote copy may arrive later.
// Keep accepting it until the user starts playing, then ignore any late reply
// so it cannot yank playback out from under them.
//
// The play queue and selection now live in Rust: we hand the persisted queue to
// `player.restoreQueue`, which pushes it into the Rust context via
// `playback_restore`. Rust mirrors the result back through `playback:changed`,
// which fills the store (currentTrack, queue, isPlaying, …). We only apply the
// *resume position* here, which `audio.ts` clamps once the track's real
// duration is known.
watch(
  [() => playback.ready, () => player.tracks.length, () => playback.path, () => playback.position],
  () => {
    if (userTookOver || !playback.ready || player.tracks.length === 0 || player.isPlaying) return;
    const stored = playback.path;
    if (!stored) return;
    // Once this track has been resumed, further position updates come from our
    // own progress saving (or a duplicate copy of the same state); re-applying
    // them would seek back a second time. A zero position is not a resume, so it
    // may still be replaced by the authoritative copy that arrives later.
    if (stored === resumedKey) return;
    const track = findTrackByKey(stored);
    if (!track) return;
    const signature = `${stored}|${Math.round(playback.position)}`;
    if (signature === resumeSignature) return;
    resumeSignature = signature;
    if (playback.position > 0) resumedKey = stored;
    restoringPlayback = true;
    // Prefer the saved play queue so the exact playlist/context resumes; fall
    // back to just the track when no queue was stored (older state).
    if (playback.queue.length > 0) {
      void player.restoreQueue(playback.queue, playback.queueIndex, stored).then((ok) => {
        if (ok) void armRestoredSmart(playback.queue);
      });
    } else if (track) {
      void player.playInQueue([track], track);
    }
    const position = playback.position;
    // Hand the saved position to `audio.ts`, which applies it once the load
    // reports the real duration and clamps it into range.
    resumeAt(position);
    window.setTimeout(() => { restoringPlayback = false; }, 1200);
  },
);

/** Resolve a stored playback key to its track. */
function findTrackByKey(key: string): Track | undefined {
  return player.tracks.find((item) => trackKey(item) === key);
}

/**
 * Re-arm smart transitions after restoring the last queue. The saved order was
 * already the analysed order while the playlist was locked, so we only need to
 * find the matching playlist, re-install the order and pin it again.
 */
async function armRestoredSmart(keys: string[]) {
  if (keys.length === 0) return;
  const wanted = new Set(keys);
  const playlist = profile.playlists.find((item) => {
    if (!item.smartTransition?.enabled || item.smartTransition.status !== "ready") return false;
    const playlistKeys = tracksForPaths(item.tracks, player.tracks)
      .map(trackKey)
      .filter((key): key is string => !!key);
    return playlistKeys.length === wanted.size && playlistKeys.every((key) => wanted.has(key));
  });
  if (!playlist) return;
  const summary = await smart.load(playlist.id);
  if (!summary || summary.incomplete) return;
  await player.reorderQueue(summary.order);
  await smart.armPlayback(playlist.id);
}

// Persist the playback position: on track changes, on pause/seek/hide/exit, and
// as a low-frequency safety net while audio keeps playing.
function savePlaybackPosition(force = false) {
  const key = trackKey(player.currentTrack);
  if (!booted.value || restoringPlayback || !key) return;
  lastPositionSavedAt = Date.now();
  playback.record(key, player.position);
  if (force) void playback.flush();
}
function savePlaybackPositionOnLeave() { savePlaybackPosition(true); void flushReadings(); }
function onVisibilityChange() { if (document.visibilityState === "hidden") savePlaybackPosition(true); }

watch(() => trackKey(player.currentTrack), (key) => {
  if (!booted.value || restoringPlayback || !key) return;
  lastPositionSavedAt = Date.now();
  playback.record(key, 0);
});
watch(() => player.position, (position, previous) => {
  if (!booted.value || restoringPlayback) return;
  // A large jump between two timeupdate samples means the user seeked; save it
  // right away instead of waiting for the periodic safety net.
  const jumped = typeof previous === "number" && Math.abs(position - previous) > 2;
  if (!jumped && Date.now() - lastPositionSavedAt < POSITION_SAVE_INTERVAL_MS) return;
  savePlaybackPosition();
});
watch(() => player.isPlaying, (playing) => {
  if (playing) {
    // The user took over before a slow cloud reply landed: keep their state and
    // make sure a later reply cannot override it.
    userTookOver = true;
    playback.lockRemote();
    return;
  }
  if (!booted.value || restoringPlayback) return;
  savePlaybackPosition(true);
});

// Persist the play queue whenever its contents or current position change, so
// the playlist a track was started from survives the next launch.
watch([() => player.queue, () => player.queueIndex], () => {
  if (!booted.value || restoringPlayback || player.queue.length === 0) return;
  playback.recordQueue(player.queueKeys(), player.queueIndex);
});

function readAccent(): Accent { const value = localStorage.getItem("welkin-accent"); return (accents.some((item) => item.id === value) ? value : "amber") as Accent; }
function getViewFromHash(): View {
  const route = window.location.hash.slice(1);
  return VIEW_ROUTES.has(route) ? (route as View) : "wall";
}
/** How long a scrolled container keeps its auto-hiding scrollbar visible after the last scroll. */
const SCROLLBAR_IDLE_MS = 700;
const scrollbarTimers = new WeakMap<Element, number>();

/**
 * Mark the scrolled element so style.css paints its scrollbar thumb, then clear
 * the mark once scrolling stops. Runs in the capture phase on the document, so
 * every nested scroller (track lists, category panels, source browsers) is covered.
 */
function onScrollCapture(event: Event) {
  const el = event.target;
  if (!(el instanceof Element)) return;
  el.classList.add("is-scrolling");
  const pending = scrollbarTimers.get(el);
  if (pending !== undefined) window.clearTimeout(pending);
  scrollbarTimers.set(el, window.setTimeout(() => {
    el.classList.remove("is-scrolling");
    scrollbarTimers.delete(el);
  }, SCROLLBAR_IDLE_MS));
}

function setView(nextView: View) { view.value = nextView; window.location.hash = nextView === "library" ? "" : nextView; }
function clearCollectionFilters() { playlistFilter.value = null; artistFilter.value = null; albumFilter.value = null; yearFilter.value = null; genreFilter.value = null; sourceFilter.value = null; }
function navigate(nextView: View) {
  clearCollectionFilters();
  setView(nextView);
  // Returning to the wall re-grows the playing track into the centred card.
  if (nextView === "wall") wallFocusToken.value += 1;
}
/** Open settings from the home avatar; land both the drawer tab and main view on settings. */
function openSettings() {
  sheetTab.value = "settings";
  clearCollectionFilters();
  setView("settings");
  baseView.value = "settings";
}
/** Open the full-screen player without disturbing the page (and its filters) underneath. */
function openPlayer() { setView("player"); }
/** Lyrics entry: portrait opens the full-screen player; landscape keeps the inline card lyrics on the wall. */
function onOpenLyrics() {
  if (isLandscape.value) return;
  navigate("player");
}
/** Fold the player away back to the page it was opened over, keeping that page's filters. */
function returnFromPlayer() { setView(baseView.value); }
function syncViewFromHash() { view.value = getViewFromHash(); }
function openUserPlaylist(id: string) { clearCollectionFilters(); playlistFilter.value = id; setView("tracks"); }
/** Open a source in the file-manager browser instead of the flat track list. */
function browseSource(id: string) {
  clearCollectionFilters();
  const kind = sources.sources.find((source) => source.id === id)?.kind;
  if (kind) browseSourceKind.value = kind;
  browseSourceId.value = id;
  setView("source-browser");
}
function openSourceConfig(from: View) {
  sourceConfigReturn.value = from;
  sourceConfigKind.value = from === "folders" ? "local" : from === "webdav" ? "webdav" : null;
  setView("source-config");
}

function closeSourceConfig() { sourceConfigKind.value = null; setView(sourceConfigReturn.value); }
function openGroup(kind: "artists" | "albums" | "years" | "genres", key: string) { playlistFilter.value = null; artistFilter.value = kind === "artists" ? key : null; albumFilter.value = kind === "albums" ? key : null; yearFilter.value = kind === "years" ? key : null; genreFilter.value = kind === "genres" ? key : null; sourceFilter.value = null; setView("tracks"); }
/** A group card clicked inside the swipeable category panels carries its own kind. */
function onOpenGroupFrom(kind: GroupKind, key: string) { openGroup(kind, key); }
/** Clicking an artist name on a track opens that artist's collection. */
function openArtist(artist: string) { const key = primaryArtist(artist); if (key) openGroup("artists", key); }
/** Clicking an album name opens that album's collection. */
function openAlbum(album: string) { const key = albumKey(album); if (key) openGroup("albums", key); }
function createPlaylist() { clearCollectionFilters(); editingPlaylist.value = null; setView("playlist-new"); }
function editPlaylist(id: string) { clearCollectionFilters(); editingPlaylist.value = id; setView("playlist-new"); }
function editLyrics(track: Track) { if (!track.path) return; editingLyricsTrack.value = track; setView("lyrics-edit"); }
function editInfo(track: Track) { if (!track.path) return; editingTrack.value = track; setView("track-edit"); }
function showTrackInfo(track: Track) { if (!track.path) return; viewingTrack.value = track; setView("track-info"); }
/** Close an overlay (track info, editors) back to the page underneath. */
function closeOverlay() {
  setView(baseView.value);
  if (baseView.value === "wall") wallFocusToken.value += 1;
}
function onPlaylistSaved(id: string) { artistFilter.value = null; albumFilter.value = null; sourceFilter.value = null; playlistFilter.value = id; setView("tracks"); }
function onPlaylistEditorCancel() { navigate("library"); }
function onPlaylistDeleted(id: string) {
  if (playlistFilter.value === id) playlistFilter.value = null;
  setView("playlists");
}
/** Pull the drawer up over the wall; land on the home tab without touching the wall view. */
function openSheet() {
  sheetOpen.value = true;
  sheetTab.value = "home";
  clearCollectionFilters();
  // Clear any retained drill-down page so the opened drawer shows the home main
  // page rather than a stale sub-page underneath the wall.
  baseView.value = "library";
}
/** Collapse the drawer back onto the playing wall; the wall underneath keeps its state. */
function closeSheet() {
  sheetOpen.value = false;
  // The persistent wall is the mobile baseline: drop the openSheet / drill-down
  // `baseView` residue so the strip and wall re-render on the wall state instead
  // of a stale library page.
  view.value = "wall";
  baseView.value = "wall";
  window.location.hash = "";
}
function onTabSelect(tab: MainTab) {
  const item = mainNavTabs.find((entry) => entry.id === tab);
  if (!item) return;
  sheetTab.value = tab;
  clearCollectionFilters();
  // Drop any drill-down state and return to this tab's main page. Both `view`
  // and `baseView` land on a non drill-down view: the `watch(view)` syncs
  // `baseView` from `view`, so using the library tab's sub-page placeholder
  // (playlists) there would be written back and render the old category page
  // on the first tap.
  const homeView: View = tab === "library" ? "library" : item.view;
  view.value = homeView;
  baseView.value = homeView;
}

async function bootstrap() {
  await sources.hydrate();
  // Title readings are cheap to read back and make the first title sort instant.
  await loadReadings();
  await profile.hydrate();
  const seeded = await playback.hydrate({ path: profile.profile.lastTrack, position: profile.profile.lastPosition });
  if (seeded) profile.clearLegacyPlayback();
  booted.value = true;
  void loadCachedLibrary();
  void profile.syncRemote();
  if (sources.hasSources) void loadRemoteLibrary({ silent: true });
}

function showError(error: unknown) { pushToast("error", friendlyError(error)); }
async function downloadMetadata(track: Track) {
  downloadingTrackId.value = track.id;
  try {
    await downloadTrackMetadata(track);
    pushToast("success", t("library.menu.metadataDownloaded"));
  } catch (error) {
    pushToast("error", t("library.menu.metadataFailed", { value: friendlyError(error) }));
  } finally { downloadingTrackId.value = null; }
}
function onGlobalKeydown(event: KeyboardEvent) {
  if (event.code !== "Space" && event.key !== " ") return;
  const target = event.target as HTMLElement | null;
  if (!target) return;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return;
  if (target.closest("button, a, [role='button'], [contenteditable='true']")) return;
  if (!player.currentTrack) return;
  event.preventDefault();
  player.togglePlayback();
}

onMounted(() => { updateLandscape(); window.addEventListener("resize", updateLandscape); window.addEventListener("hashchange", syncViewFromHash); window.addEventListener("keydown", onGlobalKeydown); window.addEventListener("beforeunload", savePlaybackPositionOnLeave); window.addEventListener("pagehide", savePlaybackPositionOnLeave); document.addEventListener("visibilitychange", onVisibilityChange); document.addEventListener("scroll", onScrollCapture, true); void initAudio(); void network.start(); void cache.start(); bootMediaControl(); void invoke<string>("ping").catch((error) => console.warn("[welkin] ping failed", describeError(error))); void bootstrap(); });
onUnmounted(() => { savePlaybackPosition(true); stopMediaControl(); window.removeEventListener("resize", updateLandscape); window.removeEventListener("hashchange", syncViewFromHash); window.removeEventListener("keydown", onGlobalKeydown); window.removeEventListener("beforeunload", savePlaybackPositionOnLeave); window.removeEventListener("pagehide", savePlaybackPositionOnLeave); document.removeEventListener("visibilitychange", onVisibilityChange); document.removeEventListener("scroll", onScrollCapture, true); unlistenPlayback?.(); unlistenPlayback = null; void profile.flush(); });

// Mirror the Rust playback context into the store. The queue / play intent / next
// / previous all live in Rust now; this is the single channel that keeps the UI
// in sync. Listening here (rather than in the store) keeps the store free of any
// Tauri import and means a killed webview simply stops receiving mirrors — the
// Rust side keeps playing and controlling itself.
listen<PlaybackSnapshot>("playback:changed", (event) => {
  player.applySnapshot(event.payload);
}).then((stop) => { unlistenPlayback = stop; }).catch(() => {});
</script>

<template>
  <Transition name="slide"><PlayerView v-if="view === 'player' && player.currentTrack && !isLandscape" :return-view="baseView" @navigate="returnFromPlayer" @open-artist="openArtist" @open-album="openAlbum" /></Transition>
  <Transition name="info"><TrackInfoView v-if="view === 'track-info' && viewingTrack" :path="viewingTrack.path ?? null" :source-id="viewingTrack.sourceId" @back="closeOverlay" /></Transition>
  <Transition name="info"><LyricsEditorView v-if="view === 'lyrics-edit' && editingLyricsTrack" :path="editingLyricsTrack.path ?? null" :source-id="editingLyricsTrack.sourceId" @back="closeOverlay" @friendly-error="showError" /></Transition>
  <Transition name="info"><TrackEditorView v-if="view === 'track-edit' && editingTrack" :path="editingTrack.path ?? null" :source-id="editingTrack.sourceId" @back="closeOverlay" @friendly-error="showError" /></Transition>
  <div class="flex h-screen flex-col overflow-hidden bg-bg text-fg">
    <!-- Landscape split: navigation rail on the left, cover wall on the right
         with the seek bar beside the wall. Width follows the viewport ratio,
         not a fixed breakpoint. -->
    <div v-if="isLandscape" class="split flex min-h-0 flex-1">
      <aside v-show="navVisible" class="split-nav" :style="{ width: `${navWidth}px`, '--rail-scale': railElementScale }">
        <div class="split-nav-body">
          <template v-if="drawerSubView">
            <TracksView v-if="baseView === 'tracks' && (playlistFilter || artistFilter || albumFilter || yearFilter || genreFilter || sourceFilter)" key="split-tracks" @open-artist="openArtist" @open-album="openAlbum" :playlist-id="playlistFilter" :artist="artistFilter" :album="albumFilter" :year="yearFilter" :genre="genreFilter" :source-id="sourceFilter" :loading="loadingLibrary" :refreshing="refreshing" :downloading-track-id="downloadingTrackId" @refresh="refreshLibrary" @edit="editPlaylist" @download-metadata="downloadMetadata" @edit-lyrics="editLyrics" @edit-info="editInfo" @show-info="showTrackInfo" />
            <SourcesView v-else-if="baseView === 'sources' || baseView === 'folders' || baseView === 'webdav' || (baseView === 'source-browser' && !browseSourceId)" :key="`split-sources-${sourcesPageKind}`" :kind="sourcesPageKind" :loading="loadingLibrary" @open="browseSource" @manage="openSourceConfig(sourcesPageKind === 'webdav' ? 'webdav' : sourcesPageKind === 'local' ? 'folders' : 'sources')" />
            <SourceBrowserView v-else-if="baseView === 'source-browser' && browseSourceId" key="split-source-browser" :source-id="browseSourceId" :loading="loadingLibrary" :downloading-track-id="downloadingTrackId" @back="navigate('sources')" @download-metadata="downloadMetadata" @edit-lyrics="editLyrics" @edit-info="editInfo" @show-info="showTrackInfo" @open-artist="openArtist" @open-album="openAlbum" />
            <SourceConfigView v-else-if="baseView === 'source-config'" key="split-source-config" :kind="sourceConfigKind" @back="closeSourceConfig" />
            <CategoriesView v-else-if="categoryActive" key="split-categories" :kind="baseView" :loading="loadingLibrary" :refreshing="refreshing" :downloading-track-id="downloadingTrackId" @navigate="navigate" @open-playlist="openUserPlaylist" @edit-playlist="editPlaylist" @create-playlist="createPlaylist" @open-group="onOpenGroupFrom" @refresh="refreshLibrary" @download-metadata="downloadMetadata" @edit-lyrics="editLyrics" @edit-info="editInfo" @show-info="showTrackInfo" @open-artist="openArtist" @open-album="openAlbum" />
            <FavoritesView v-else-if="baseView === 'favorites'" key="split-favorites" @open-artist="openArtist" @open-album="openAlbum" :loading="loadingLibrary" :downloading-track-id="downloadingTrackId" @download-metadata="downloadMetadata" @edit-lyrics="editLyrics" @edit-info="editInfo" @show-info="showTrackInfo" />
            <DownloadingView v-else-if="baseView === 'downloading'" key="split-downloading" />
            <DownloadedView v-else-if="baseView === 'downloaded'" key="split-downloaded" @open-artist="openArtist" @open-album="openAlbum" />
            <PlaylistEditorView v-else-if="baseView === 'playlist-new'" key="split-playlist-new" :playlist-id="editingPlaylist" @done="onPlaylistSaved" @deleted="onPlaylistDeleted" @cancel="onPlaylistEditorCancel" />
          </template>
          <LibraryView v-else-if="sheetTab === 'home'" key="split-home" :downloading-track-id="downloadingTrackId" @settings="openSettings" @navigate="navigate" @open-playlist="openUserPlaylist" @download-metadata="downloadMetadata" @edit-lyrics="editLyrics" @edit-info="editInfo" @show-info="showTrackInfo" />
          <LibraryListView v-else-if="sheetTab === 'library'" key="split-library" @navigate="navigate" />
          <SettingsView v-else-if="sheetTab === 'settings'" key="split-settings" v-model:theme="theme" v-model:accent="accent" @downloading="navigate('downloading')" @downloaded="navigate('downloaded')" @friendly-error="showError" />
          <SearchView v-else key="split-search" @open-artist="openArtist" @open-album="openAlbum" @open-group="onOpenGroupFrom" />
        </div>
        <div class="split-nav-bar">
          <MobileTabBar :active="navTab" @select="onTabSelect" />
        </div>
      </aside>
      <div
        v-show="navVisible"
        class="split-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize navigation rail"
        @pointerdown="onHandleDown"
        @pointermove="onHandleMove"
        @pointerup="onHandleUp"
        @pointercancel="onHandleUp"
      />
      <section class="split-wall">
        <WallView :focus-token="wallFocusToken" @open-lyrics="onOpenLyrics" />
        <PlayerNavBar @sheet="openSplitNav" />
      </section>
    </div>

    <!-- Portrait: the persistent mobile wall under the bottom drawer. -->
    <div v-else class="relative flex min-h-0 flex-1 md:hidden">
      <WallView :focus-token="wallFocusToken" @open-lyrics="navigate('player')" />
    </div>

    <!-- Desktop: the sidebar-driven main area. -->
    <div v-if="!isLandscape" class="relative hidden min-h-0 flex-1 md:flex">
      <main class="relative min-w-0 flex-1 overflow-y-auto" :style="{ paddingTop: 'env(safe-area-inset-top)' }">
        <Transition name="page" mode="out-in">
          <WallView v-if="baseView === 'wall'" key="wall" :focus-token="wallFocusToken" @open-lyrics="navigate('player')" />
          <LibraryView v-else-if="baseView === 'library'" key="library" :downloading-track-id="downloadingTrackId" @settings="openSettings" @navigate="navigate" @open-playlist="openUserPlaylist" @download-metadata="downloadMetadata" @edit-lyrics="editLyrics" @edit-info="editInfo" @show-info="showTrackInfo" />
          <TracksView v-else-if="baseView === 'tracks' && (playlistFilter || artistFilter || albumFilter || yearFilter || genreFilter || sourceFilter)" key="tracks" @open-artist="openArtist" @open-album="openAlbum" :playlist-id="playlistFilter" :artist="artistFilter" :album="albumFilter" :year="yearFilter" :genre="genreFilter" :source-id="sourceFilter" :loading="loadingLibrary" :refreshing="refreshing" :downloading-track-id="downloadingTrackId" @refresh="refreshLibrary" @edit="editPlaylist" @download-metadata="downloadMetadata" @edit-lyrics="editLyrics" @edit-info="editInfo" @show-info="showTrackInfo" />
          <SourcesView v-else-if="baseView === 'sources' || baseView === 'folders' || baseView === 'webdav' || (baseView === 'source-browser' && !browseSourceId)" :key="`sources-${sourcesPageKind}`" :kind="sourcesPageKind" :loading="loadingLibrary" @open="browseSource" @manage="openSourceConfig(sourcesPageKind === 'webdav' ? 'webdav' : sourcesPageKind === 'local' ? 'folders' : 'sources')" />
          <SourceBrowserView v-else-if="baseView === 'source-browser' && browseSourceId" key="source-browser" :source-id="browseSourceId" :loading="loadingLibrary" :downloading-track-id="downloadingTrackId" @back="navigate('sources')" @download-metadata="downloadMetadata" @edit-lyrics="editLyrics" @edit-info="editInfo" @show-info="showTrackInfo" @open-artist="openArtist" @open-album="openAlbum" />
          <SourceConfigView v-else-if="baseView === 'source-config'" key="source-config" :kind="sourceConfigKind" @back="closeSourceConfig" />
          <CategoriesView v-else-if="categoryActive" key="categories" :kind="baseView" :loading="loadingLibrary" :refreshing="refreshing" :downloading-track-id="downloadingTrackId" @navigate="navigate" @open-playlist="openUserPlaylist" @edit-playlist="editPlaylist" @create-playlist="createPlaylist" @open-group="onOpenGroupFrom" @refresh="refreshLibrary" @download-metadata="downloadMetadata" @edit-lyrics="editLyrics" @edit-info="editInfo" @show-info="showTrackInfo" @open-artist="openArtist" @open-album="openAlbum" />
          <FavoritesView v-else-if="baseView === 'favorites'" key="favorites" @open-artist="openArtist" @open-album="openAlbum" :loading="loadingLibrary" :downloading-track-id="downloadingTrackId" @download-metadata="downloadMetadata" @edit-lyrics="editLyrics" @edit-info="editInfo" @show-info="showTrackInfo" />
          <SearchView v-else-if="baseView === 'search'" key="search" @open-artist="openArtist" @open-album="openAlbum" @open-group="onOpenGroupFrom" />
          <DownloadingView v-else-if="baseView === 'downloading'" key="downloading" />
          <DownloadedView v-else-if="baseView === 'downloaded'" key="downloaded" @open-artist="openArtist" @open-album="openAlbum" />
          <PlaylistEditorView v-else-if="baseView === 'playlist-new'" key="playlist-new" :playlist-id="editingPlaylist" @done="onPlaylistSaved" @deleted="onPlaylistDeleted" @cancel="onPlaylistEditorCancel" />
          <SettingsView v-else key="settings" v-model:theme="theme" v-model:accent="accent" @downloading="navigate('downloading')" @downloaded="navigate('downloaded')" @friendly-error="showError" />
        </Transition>
      </main>
    </div>
    <PlayerBar v-if="!isLandscape && player.currentTrack" class="hidden md:block" @open="openPlayer" @open-artist="openArtist" @open-album="openAlbum" />
    <PlayerNavBar v-if="!isLandscape && (view === 'player' || baseView === 'wall' || !sheetOpen)" @sheet="openSheet" />
    <MobileNavSheet v-if="!isLandscape" v-model:open="sheetOpen" :active-tab="navTab" @select="onTabSelect" @close="closeSheet">
      <!-- Drill-down pages inside the drawer. -->
      <template v-if="drawerSubView">
        <TracksView v-if="baseView === 'tracks' && (playlistFilter || artistFilter || albumFilter || yearFilter || genreFilter || sourceFilter)" key="sheet-tracks" @open-artist="openArtist" @open-album="openAlbum" :playlist-id="playlistFilter" :artist="artistFilter" :album="albumFilter" :year="yearFilter" :genre="genreFilter" :source-id="sourceFilter" :loading="loadingLibrary" :refreshing="refreshing" :downloading-track-id="downloadingTrackId" @refresh="refreshLibrary" @edit="editPlaylist" @download-metadata="downloadMetadata" @edit-lyrics="editLyrics" @edit-info="editInfo" @show-info="showTrackInfo" />
        <SourcesView v-else-if="baseView === 'sources' || baseView === 'folders' || baseView === 'webdav' || (baseView === 'source-browser' && !browseSourceId)" :key="`sheet-sources-${sourcesPageKind}`" :kind="sourcesPageKind" :loading="loadingLibrary" @open="browseSource" @manage="openSourceConfig(sourcesPageKind === 'webdav' ? 'webdav' : sourcesPageKind === 'local' ? 'folders' : 'sources')" />
        <SourceBrowserView v-else-if="baseView === 'source-browser' && browseSourceId" key="sheet-source-browser" :source-id="browseSourceId" :loading="loadingLibrary" :downloading-track-id="downloadingTrackId" @back="navigate('sources')" @download-metadata="downloadMetadata" @edit-lyrics="editLyrics" @edit-info="editInfo" @show-info="showTrackInfo" @open-artist="openArtist" @open-album="openAlbum" />
        <SourceConfigView v-else-if="baseView === 'source-config'" key="sheet-source-config" :kind="sourceConfigKind" @back="closeSourceConfig" />
        <CategoriesView v-else-if="categoryActive" key="sheet-categories" :kind="baseView" :loading="loadingLibrary" :refreshing="refreshing" :downloading-track-id="downloadingTrackId" @navigate="navigate" @open-playlist="openUserPlaylist" @edit-playlist="editPlaylist" @create-playlist="createPlaylist" @open-group="onOpenGroupFrom" @refresh="refreshLibrary" @download-metadata="downloadMetadata" @edit-lyrics="editLyrics" @edit-info="editInfo" @show-info="showTrackInfo" @open-artist="openArtist" @open-album="openAlbum" />
        <FavoritesView v-else-if="baseView === 'favorites'" key="sheet-favorites" @open-artist="openArtist" @open-album="openAlbum" :loading="loadingLibrary" :downloading-track-id="downloadingTrackId" @download-metadata="downloadMetadata" @edit-lyrics="editLyrics" @edit-info="editInfo" @show-info="showTrackInfo" />
        <DownloadingView v-else-if="baseView === 'downloading'" key="sheet-downloading" />
        <DownloadedView v-else-if="baseView === 'downloaded'" key="sheet-downloaded" @open-artist="openArtist" @open-album="openAlbum" />
        <PlaylistEditorView v-else-if="baseView === 'playlist-new'" key="sheet-playlist-new" :playlist-id="editingPlaylist" @done="onPlaylistSaved" @deleted="onPlaylistDeleted" @cancel="onPlaylistEditorCancel" />
      </template>

      <!-- The main tab pages. -->
      <LibraryView v-else-if="sheetTab === 'home'" key="sheet-home" :downloading-track-id="downloadingTrackId" @settings="openSettings" @navigate="navigate" @open-playlist="openUserPlaylist" @download-metadata="downloadMetadata" @edit-lyrics="editLyrics" @edit-info="editInfo" @show-info="showTrackInfo" />
      <LibraryListView v-else-if="sheetTab === 'library'" key="sheet-library" @navigate="navigate" />
      <SettingsView v-else-if="sheetTab === 'settings'" key="sheet-settings" v-model:theme="theme" v-model:accent="accent" @downloading="navigate('downloading')" @downloaded="navigate('downloaded')" @friendly-error="showError" />
      <SearchView v-else key="sheet-search" @open-artist="openArtist" @open-album="openAlbum" @open-group="onOpenGroupFrom" />
    </MobileNavSheet>
    <ToastStack />
    <AudioQualityModal />
    <MeteredPlaybackModal />
  </div>
</template>

<style scoped>
/* The safe-area inset moves from the collapsed header onto <main>; animate it
   so the category tabs glide up to the status bar instead of jumping. */
main {
  transition: padding-top 280ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

/* ------------------------------------------------ landscape split layout */
.split {
  display: flex;
  min-height: 0;
  flex: 1;
}

.split-nav {
  position: relative;
  flex: none;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  border-right: 1px solid var(--line);
  background: color-mix(in srgb, var(--surface) 92%, transparent);
}

.split-nav-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  touch-action: pan-y;
  padding-top: env(safe-area-inset-top);
  padding-bottom: calc(env(safe-area-inset-bottom) + 84px);
}

.split-nav-bar {
  flex: none;
}

.split-handle {
  flex: none;
  width: 18px;
  cursor: col-resize;
  touch-action: none;
  position: relative;
  z-index: 2;
}

.split-handle::after {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  transform: translateX(-50%);
  background: color-mix(in srgb, var(--fg) 30%, transparent);
  transition: background-color 180ms ease, width 180ms ease;
}

.split-handle:hover::after,
.split-handle:active::after {
  background: var(--accent);
  width: 3px;
}

.split-wall {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

/* In the split the seek bar belongs to the wall pane, so it anchors to the wall
   instead of the viewport and overrides the >=768px mobile-only hide. */
.split-wall :deep(.transport) {
  position: absolute;
  display: block;
  width: min(340px, calc(100% - 80px));
  bottom: calc(env(safe-area-inset-bottom) + 24px);
}
</style>
