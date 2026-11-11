<!--
 Copyright 2026 Atemukesu
 SPDX-License-Identifier: GPL-3.0-only
-->

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch, watchEffect } from "vue";
import { useI18n } from "vue-i18n";
import { describeError, invoke } from "./api";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { initAudio, resumeAt } from "./lib/audio";
import { accents } from "./lib/app";
import type { Accent, Theme, View } from "./lib/app";
import { albumKey, primaryArtist } from "./lib/grouping";
import { trackKey } from "./lib/sources";
import { flushReadings, loadReadings } from "./lib/readings";
import { useLibrary } from "./composables/useLibrary";
import { startDesktopLyrics, stopDesktopLyrics } from "./composables/useDesktopLyrics";
import { startMediaControl, stopMediaControl } from "./lib/mediaControl";

/** The floating lyrics layer must never be able to break app boot. */
function bootDesktopLyrics() {
  try {
    startDesktopLyrics();
  } catch (error) {
    console.warn("[welkin] desktop lyrics failed to start", error);
  }
}

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
import { useProfileStore } from "./stores/profile";
import { usePlaybackStore } from "./stores/playback";
import { useLyricsStore } from "./stores/lyrics";
import { useMetadataStore } from "./stores/metadata";
import { useNetworkStore } from "./stores/network";
import { useCacheStore } from "./stores/cache";
import { useLicenseStore } from "./stores/license";
import { useWindowBehaviorStore } from "./stores/windowBehavior";
import { useUpdateStore } from "./stores/update";
import AppNavigation from "./components/AppNavigation.vue";
import QueuePanel from "./components/QueuePanel.vue";
import PlayerBar from "./components/PlayerBar.vue";
import PlayerNavBar from "./components/PlayerNavBar.vue";
import MobileNavSheet from "./components/MobileNavSheet.vue";
import WallView from "./components/wall/WallView.vue";
import AudioQualityModal from "./components/AudioQualityModal.vue";
import SetupWizard from "./components/SetupWizard.vue";
import ToastStack from "./components/ToastStack.vue";
import UpdateModal from "./components/UpdateModal.vue";
import LibraryView from "./views/LibraryView.vue";
import PlayerView from "./views/PlayerView.vue";
import SettingsView from "./views/SettingsView.vue";
import SponsorView from "./views/SponsorView.vue";
import TracksView from "./views/TracksView.vue";
import FavoritesView from "./views/FavoritesView.vue";
import QueueView from "./views/QueueView.vue";
import CategoriesView from "./views/CategoriesView.vue";
import type { GroupKind } from "./lib/grouping";
import StatsView from "./views/StatsView.vue";
import SourcesView from "./views/SourcesView.vue";
import SourceBrowserView from "./views/SourceBrowserView.vue";
import PlaylistEditorView from "./views/PlaylistEditorView.vue";
import LyricsEditorView from "./views/LyricsEditorView.vue";
import TrackEditorView from "./views/TrackEditorView.vue";
import TrackInfoView from "./views/TrackInfoView.vue";
import SourceConfigView from "./views/SourceConfigView.vue";

const AmllPlayerView = defineAsyncComponent(() => import("./views/AmllPlayerView.vue"));

const { t, locale } = useI18n();
const player = usePlayerStore();
const sources = useSourcesStore();
const profile = useProfileStore();
const playback = usePlaybackStore();
const lyrics = useLyricsStore();
const metadata = useMetadataStore();
const network = useNetworkStore();
const cache = useCacheStore();
const license = useLicenseStore();
const windowBehavior = useWindowBehaviorStore();
const update = useUpdateStore();
const { loadingLibrary, refreshing, friendlyError, loadCachedLibrary, loadRemoteLibrary, refreshLibrary, downloadTrackMetadata } = useLibrary();
const view = ref<View>(getViewFromHash());
/** Views that sit on top of the current page as overlays and must not replace `baseView`. */
const OVERLAY_VIEWS: ReadonlySet<View> = new Set(["player", "track-info", "lyrics-edit", "track-edit", "sponsor"]);
const baseView = ref<View>(OVERLAY_VIEWS.has(view.value) ? "library" : view.value);
const theme = ref<Theme>(localStorage.getItem("welkin-theme") === "dark" ? "dark" : "light");
const accent = ref<Accent>(readAccent());
const sidebarCollapsed = ref(localStorage.getItem("welkin-sidebar-collapsed") === "1");
const downloadingTrackId = ref<number | null>(null);
const booted = ref(false);
const playlistFilter = ref<string | null>(null);
const artistFilter = ref<string | null>(null);
const albumFilter = ref<string | null>(null);
const yearFilter = ref<string | null>(null);
const genreFilter = ref<string | null>(null);
const sourceFilter = ref<string | null>(null);

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
const showQueue = ref(false);
/** The bottom sheet the mobile navigation strip pulls up. */
const sheetOpen = ref(false);
/** Bumped to ask the cover wall to re-centre on the playing track. */
const wallFocusToken = ref(0);
/** Whether the AMLL full-screen player should be open. */
const amllActive = computed(() => view.value === "player" && !!player.currentTrack && lyrics.useAmll);
/** Stays true until AmllPlayerView finishes its slide-out, then it unmounts. */
const amllMounted = ref(false);
watch(amllActive, (active) => { if (active) amllMounted.value = true; }, { immediate: true });
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

// The full-screen player, track-info, the track editors and the sponsor view are
// overlays that sit on top of whatever page was open, so they must not change
// `baseView`; everything else (including the folder browser) becomes the
// underlying page when opened. Keeping the underlying page mounted preserves its
// scroll position and the source browser's current folder across the overlay.
watch(view, (next) => { if (!OVERLAY_VIEWS.has(next)) baseView.value = next; });

// Reload the library shortly after a source is added, removed or reconfigured,
// so configuring a source in Settings takes effect without a manual refresh.
let sourceReloadTimer = 0;
watch(() => sources.revision, () => {
  if (!booted.value || profile.firstRun || !sources.hasSources) return;
  window.clearTimeout(sourceReloadTimer);
  sourceReloadTimer = window.setTimeout(() => void loadRemoteLibrary({ silent: true }), 400);
});
watchEffect(() => { document.documentElement.classList.toggle("dark", theme.value === "dark"); document.documentElement.dataset.accent = accent.value; localStorage.setItem("welkin-theme", theme.value); localStorage.setItem("welkin-accent", accent.value); });
watchEffect(() => { document.documentElement.lang = locale.value; localStorage.setItem("welkin-locale", locale.value); });

/** Minimum time (ms) the inline splash stays visible so its reveal can play and a fast boot doesn't flash it. */
const SPLASH_MIN_MS = 3000;
/** Dismisses the static splash screen inlined in index.html once the app is ready. */
function dismissSplash() {
  const splash = document.getElementById("splash");
  if (!splash) return;
  const elapsed = Date.now() - (window.__welkinSplashStart ?? Date.now());
  window.setTimeout(() => {
    splash.classList.add("splash-out");
    // The fade is 420ms; remove the node after it ends, with a timeout as a fallback.
    splash.addEventListener("transitionend", () => splash.remove(), { once: true });
    window.setTimeout(() => splash.remove(), 800);
  }, Math.max(0, SPLASH_MIN_MS - elapsed));
}
// Reveal the app and fade the splash out once bootstrap() has finished hydrating.
watch(booted, (ready) => { if (ready) dismissSplash(); });

watch(() => trackKey(player.currentTrack), (key) => { if (booted.value && key && player.isPlaying) profile.recordPlay(key); });

// The playing track's metadata is wanted immediately, regardless of visibility.
// Rust-created placeholders all use id=-1, so use the stable source/path key
// to ensure every newly selected track gets a metadata request.
watch(() => trackKey(player.currentTrack), () => metadata.request(player.currentTrack));

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
      void player.restoreQueue(playback.queue, playback.queueIndex, stored);
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
function getViewFromHash(): View { const route = window.location.hash.slice(1); return route === "settings" || route === "sponsor" || route === "player" || route === "tracks" || route === "queue" || route === "favorites" || route === "stats" || route === "artists" || route === "albums" || route === "years" || route === "genres" || route === "sources" || route === "source-config" || route === "source-browser" || route === "playlists" || route === "playlist-new" || route === "lyrics-edit" || route === "track-edit" || route === "track-info" ? route : "library"; }
function setView(nextView: View) { view.value = nextView; window.location.hash = nextView === "library" ? "" : nextView; }
function clearCollectionFilters() { playlistFilter.value = null; artistFilter.value = null; albumFilter.value = null; yearFilter.value = null; genreFilter.value = null; sourceFilter.value = null; }
/**
 * Mobile header auto-hide: scrolling any content area down collapses the
 * header and shifts its safe-area inset onto <main>, so the category tabs sit
 * directly under the status bar; scrolling up (or opening the drawer) restores
 * it. Capture-phase scroll covers every nested scroll container (main, category
 * panels, track lists) without wiring scroll events through each view.
 */
const headerHidden = ref(false);
const drawerOpen = ref(false);
let headerLastTop = 0;
let headerLastEl: Element | null = null;
let headerScrollTick = false;

function handleHeaderScroll(event: Event) {
  const el = event.target as Element | null;
  if (!el || !(el instanceof Element)) return;
  // Scrolling inside the drawer overlay must not hide the header behind it.
  if (el.closest?.(".drawer-shell")) return;
  if (headerLastEl !== el) {
    headerLastEl = el;
    headerLastTop = el.scrollTop ?? 0;
    return;
  }
  const top = el.scrollTop ?? 0;
  const delta = top - headerLastTop;
  headerLastTop = top;
  if (Math.abs(delta) < 6) return;
  headerHidden.value = delta > 0 && top > 40;
}

function onHeaderScrollCapture(event: Event) {
  if (headerScrollTick) return;
  headerScrollTick = true;
  requestAnimationFrame(() => {
    headerScrollTick = false;
    handleHeaderScroll(event);
  });
}

function navigate(nextView: View) { clearCollectionFilters(); setView(nextView); headerHidden.value = false; }
function syncViewFromHash() { view.value = getViewFromHash(); }
function openUserPlaylist(id: string) { clearCollectionFilters(); playlistFilter.value = id; setView("tracks"); }
/** Open a source in the file-manager browser instead of the flat track list. */
function browseSource(id: string) { clearCollectionFilters(); browseSourceId.value = id; setView("source-browser"); }
function openSourceConfig(from: View) { sourceConfigReturn.value = from; setView("source-config"); }

function closeSourceConfig() { setView(sourceConfigReturn.value); }
function openGroup(kind: "artists" | "albums" | "years" | "genres", key: string) { playlistFilter.value = null; artistFilter.value = kind === "artists" ? key : null; albumFilter.value = kind === "albums" ? key : null; yearFilter.value = kind === "years" ? key : null; genreFilter.value = kind === "genres" ? key : null; sourceFilter.value = null; setView("tracks"); }
/** A group card clicked inside the swipeable category panels carries its own kind. */
function onOpenGroupFrom(kind: GroupKind, key: string) { openGroup(kind, key); }
/** Clicking an artist name on a track opens that artist's collection. */
function openArtist(artist: string) { const key = primaryArtist(artist); if (key) openGroup("artists", key); }
/** Clicking an album name opens that album's collection. */
function openAlbum(album: string) { const key = albumKey(album); if (key) openGroup("albums", key); }
function createPlaylist() { clearCollectionFilters(); editingPlaylist.value = null; setView("playlist-new"); }
function editPlaylist(id: string) { clearCollectionFilters(); editingPlaylist.value = id; setView("playlist-new"); }
function editLyrics(track: Track) { if (!track.path) return; editingLyricsTrack.value = track; closeQueue(); setView("lyrics-edit"); }
function editInfo(track: Track) { if (!track.path) return; editingTrack.value = track; closeQueue(); setView("track-edit"); }
function showTrackInfo(track: Track) { if (!track.path) return; viewingTrack.value = track; closeQueue(); setView("track-info"); }
/** Close an overlay (track info, editors, sponsor) back to the page underneath. */
function closeOverlay() { setView(baseView.value); }
function onPlaylistSaved(id: string) { artistFilter.value = null; albumFilter.value = null; sourceFilter.value = null; playlistFilter.value = id; setView("tracks"); }
function onPlaylistEditorCancel() { navigate("library"); }
function onPlaylistDeleted(id: string) {
  if (playlistFilter.value === id) playlistFilter.value = null;
  setView("playlists");
}
function toggleQueue() {
  if (showQueue.value) closeQueue();
  else openQueue();
}
function openQueue() { showQueue.value = true; }
function closeQueue() { showQueue.value = false; }

/**
 * The strip's tap: back to the cover wall, which is both the home page and the
 * now-playing page.
 */
function goHome() { sheetOpen.value = false; navigate("wall"); }

/**
 * The strip's long press: locate the current track. On the wall that is a camera
 * move onto the playing poster; from anywhere else it first goes home and then
 * asks the wall to centre.
 */
function locateCurrent() {
  sheetOpen.value = false;
  if (baseView.value !== "wall") navigate("wall");
  wallFocusToken.value += 1;
}

function onSheetNavigate(next: View) { navigate(next); }

/** Background update probe at boot; a failure is intentionally silent. */
async function checkUpdatesOnBoot() {
  try {
    await update.check();
    if (update.shouldPrompt && !profile.firstRun) update.show();
  } catch {
    // A failed background check must never disturb the user.
  }
}

async function bootstrap() {
  await sources.hydrate();
  // Title readings are cheap to read back and make the first title sort instant.
  await loadReadings();
  const firstRun = await profile.hydrate();
  const seeded = await playback.hydrate({ path: profile.profile.lastTrack, position: profile.profile.lastPosition });
  if (seeded) profile.clearLegacyPlayback();
  // Ask Rust for the re-verified edition before revealing the app so the splash
  // shows the right one; never let a slow backend stall boot.
  await Promise.race([license.refresh(), new Promise((resolve) => window.setTimeout(resolve, 1500))]);
  booted.value = true;
  void loadCachedLibrary();
  void checkUpdatesOnBoot();
  if (!firstRun) {
    // The wizard owns the first fetch; returning users refresh silently.
    void profile.syncRemote();
    if (sources.hasSources) void loadRemoteLibrary({ silent: true });
  }
}

function onWizardFinish() {
  if (sources.hasSources) void loadRemoteLibrary();
  else void loadCachedLibrary();
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
function toggleSidebar() { sidebarCollapsed.value = !sidebarCollapsed.value; localStorage.setItem("welkin-sidebar-collapsed", sidebarCollapsed.value ? "1" : "0"); }
/** Re-verify the Pro license from scratch whenever the app regains focus. */
function recheckLicense() { void license.refresh(); }
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

onMounted(() => { windowBehavior.sync(); window.addEventListener("hashchange", syncViewFromHash); window.addEventListener("keydown", onGlobalKeydown); window.addEventListener("beforeunload", savePlaybackPositionOnLeave); window.addEventListener("pagehide", savePlaybackPositionOnLeave); window.addEventListener("focus", recheckLicense); document.addEventListener("visibilitychange", onVisibilityChange); document.addEventListener("scroll", onHeaderScrollCapture, true); void initAudio(); void network.start(); void cache.start(); bootDesktopLyrics(); bootMediaControl(); void invoke<string>("ping").catch((error) => console.warn("[welkin] ping failed", describeError(error))); void bootstrap(); });
onUnmounted(() => { savePlaybackPosition(true); stopDesktopLyrics(); stopMediaControl(); window.removeEventListener("hashchange", syncViewFromHash); window.removeEventListener("keydown", onGlobalKeydown); window.removeEventListener("beforeunload", savePlaybackPositionOnLeave); window.removeEventListener("pagehide", savePlaybackPositionOnLeave); window.removeEventListener("focus", recheckLicense); document.removeEventListener("visibilitychange", onVisibilityChange); document.removeEventListener("scroll", onHeaderScrollCapture, true); unlistenPlayback?.(); unlistenPlayback = null; void profile.flush(); });

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
  <AmllPlayerView v-if="amllMounted && player.currentTrack" :active="amllActive" :return-view="baseView" @navigate="navigate" @closed="amllMounted = false" />
  <Transition name="slide"><PlayerView v-if="view === 'player' && player.currentTrack && !lyrics.useAmll" :return-view="baseView" @navigate="navigate" @queue="toggleQueue" @open-artist="openArtist" @open-album="openAlbum" /></Transition>
  <Transition name="info"><TrackInfoView v-if="view === 'track-info' && viewingTrack" :path="viewingTrack.path ?? null" :source-id="viewingTrack.sourceId" @back="closeOverlay" /></Transition>
  <Transition name="info"><LyricsEditorView v-if="view === 'lyrics-edit' && editingLyricsTrack" :path="editingLyricsTrack.path ?? null" :source-id="editingLyricsTrack.sourceId" @back="closeOverlay" @friendly-error="showError" /></Transition>
  <Transition name="info"><TrackEditorView v-if="view === 'track-edit' && editingTrack" :path="editingTrack.path ?? null" :source-id="editingTrack.sourceId" @back="closeOverlay" @friendly-error="showError" /></Transition>
  <Transition name="info"><SponsorView v-if="view === 'sponsor'" @back="closeOverlay" /></Transition>
  <SetupWizard v-if="booted && profile.firstRun" v-model:theme="theme" v-model:accent="accent" @finish="onWizardFinish" />
  <div class="flex h-screen flex-col overflow-hidden bg-bg text-fg" :class="booted ? '' : 'opacity-0'">
    <AppNavigation placement="header" :active-view="baseView" :header-hidden="headerHidden" @navigate="navigate" @drawer="drawerOpen = $event" />
    <div class="relative flex min-h-0 flex-1">
      <AppNavigation placement="sidebar" :active-view="baseView" :collapsed="sidebarCollapsed" :active-playlist-id="playlistFilter" :active-artist="artistFilter" :active-album="albumFilter" :active-year="yearFilter" :active-genre="genreFilter" :active-source="sourceFilter" @navigate="navigate" @toggle="toggleSidebar" @create-playlist="createPlaylist" @open-playlist="openUserPlaylist" />
      <main class="min-w-0 flex-1 overflow-y-auto" :style="headerHidden && !drawerOpen ? { paddingTop: 'env(safe-area-inset-top)' } : undefined">
        <Transition name="page" mode="out-in">
          <WallView v-if="baseView === 'wall'" key="wall" :focus-token="wallFocusToken" />
          <LibraryView v-else-if="baseView === 'library'" key="library" :loading="loadingLibrary" :downloading-track-id="downloadingTrackId" @settings="navigate('settings')" @navigate="navigate" @open-playlist="openUserPlaylist" @download-metadata="downloadMetadata" @edit-lyrics="editLyrics" @edit-info="editInfo" @show-info="showTrackInfo" />
          <TracksView v-else-if="baseView === 'tracks' && (playlistFilter || artistFilter || albumFilter || yearFilter || genreFilter || sourceFilter)" key="tracks" @open-artist="openArtist" @open-album="openAlbum" :playlist-id="playlistFilter" :artist="artistFilter" :album="albumFilter" :year="yearFilter" :genre="genreFilter" :source-id="sourceFilter" :loading="loadingLibrary" :refreshing="refreshing" :downloading-track-id="downloadingTrackId" @refresh="refreshLibrary" @edit="editPlaylist" @download-metadata="downloadMetadata" @edit-lyrics="editLyrics" @edit-info="editInfo" @show-info="showTrackInfo" />
          <SourcesView v-else-if="baseView === 'sources' || (baseView === 'source-browser' && !browseSourceId)" key="sources" :loading="loadingLibrary" @open="browseSource" @manage="openSourceConfig('sources')" />
          <SourceBrowserView v-else-if="baseView === 'source-browser' && browseSourceId" key="source-browser" :source-id="browseSourceId" :loading="loadingLibrary" :downloading-track-id="downloadingTrackId" @back="navigate('sources')" @download-metadata="downloadMetadata" @edit-lyrics="editLyrics" @edit-info="editInfo" @show-info="showTrackInfo" @open-artist="openArtist" @open-album="openAlbum" />
          <SourceConfigView v-else-if="baseView === 'source-config'" key="source-config" @back="closeSourceConfig" />
          <CategoriesView v-else-if="categoryActive" key="categories" :kind="baseView" :loading="loadingLibrary" :refreshing="refreshing" :downloading-track-id="downloadingTrackId" @navigate="navigate" @open-playlist="openUserPlaylist" @edit-playlist="editPlaylist" @create-playlist="createPlaylist" @open-group="onOpenGroupFrom" @refresh="refreshLibrary" @download-metadata="downloadMetadata" @edit-lyrics="editLyrics" @edit-info="editInfo" @show-info="showTrackInfo" @open-artist="openArtist" @open-album="openAlbum" />
          <FavoritesView v-else-if="baseView === 'favorites'" key="favorites" @open-artist="openArtist" @open-album="openAlbum" :loading="loadingLibrary" :downloading-track-id="downloadingTrackId" @download-metadata="downloadMetadata" @edit-lyrics="editLyrics" @edit-info="editInfo" @show-info="showTrackInfo" />
          <QueueView v-else-if="baseView === 'queue'" key="queue" />
          <StatsView v-else-if="baseView === 'stats'" key="stats" :loading="loadingLibrary" :downloading-track-id="downloadingTrackId" @download-metadata="downloadMetadata" @edit-lyrics="editLyrics" @edit-info="editInfo" @show-info="showTrackInfo" />
          <PlaylistEditorView v-else-if="baseView === 'playlist-new'" key="playlist-new" :playlist-id="editingPlaylist" @done="onPlaylistSaved" @deleted="onPlaylistDeleted" @cancel="onPlaylistEditorCancel" />
          <SettingsView v-else key="settings" v-model:theme="theme" v-model:accent="accent" @sponsor="navigate('sponsor')" @sources="openSourceConfig('settings')" @friendly-error="showError" />
        </Transition>
      </main>
      <Transition name="queue-panel"><div v-if="showQueue" class="absolute inset-y-0 right-0 z-20 w-80 border-l border-line bg-surface"><QueuePanel @close="closeQueue" /></div></Transition>
    </div>
    <PlayerBar v-if="player.currentTrack" class="hidden md:block" @open="navigate('player')" @queue="toggleQueue" @open-artist="openArtist" @open-album="openAlbum" />
    <PlayerNavBar class="md:hidden" :can-skip="player.queue.length > 1" @home="goHome" @previous="player.previous()" @next="player.next()" @locate="locateCurrent" @sheet="sheetOpen = true" />
    <MobileNavSheet v-model:open="sheetOpen" :active-view="baseView" @navigate="onSheetNavigate" />
    <ToastStack />
    <AudioQualityModal />
    <UpdateModal @friendly-error="showError" />
  </div>
</template>

<style scoped>
/* The safe-area inset moves from the collapsed header onto <main>; animate it
   so the category tabs glide up to the status bar instead of jumping. */
main {
  transition: padding-top 280ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
</style>
