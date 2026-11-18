<!--
 Copyright 2026 Atemukesu
 SPDX-License-Identifier: GPL-3.0-only
-->

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Music2, Play } from "@lucide/vue";
import { usePlayerStore } from "../../stores/player";
import type { Track } from "../../stores/player";
import { useLyricsStore } from "../../stores/lyrics";
import { cameraAt, centerOf, geometryFor, layoutWall, locateNearest, visibleBounds, worldTransform, neighborWindow, grownWindowIndex, focusSlotRect, pitchOf } from "./geometry";
import type { WallFocus, WallInstance } from "./geometry";
import { trackKey } from "../../lib/sources";
import { requestMeta } from "../../directives/requestMeta";

const vRequestMeta = requestMeta;

/**
 * The cover wall: the whole library as one endless field of posters, laid out by
 * `geometry.ts` and culled to the viewport. Panning moves a camera over a fixed
 * world rather than scrolling a container, which is what lets the field repeat
 * forever without ever growing the DOM to the size of the queue.
 *
 * Tapping a poster opens the block it sits in: the tapped poster grows into the
 * card in the middle, carrying the cover, the transport and the lyric, and the
 * eleven posters that shared the block move into the ring around it. Tapping the
 * card again closes it. Nothing is open until the user asks for it, so the wall
 * stays a wall instead of one permanent card parked over the field.
 *
 * Panning coasts after release, and two fingers pinch the field around their
 * midpoint, both matching the feel of folia's lattice.
 */
const props = withDefaults(defineProps<{ focusToken?: number }>(), { focusToken: 0 });
const emit = defineEmits<{ openLyrics: [] }>();
const { t } = useI18n();
const player = usePlayerStore();
const lyrics = useLyricsStore();

const stage = ref<HTMLElement | null>(null);
const width = ref(0);
const height = ref(0);
/** localStorage key for the persisted pinch zoom, restored after a relaunch. */
const SCALE_KEY = "welkin-wall-scale";
const MIN_SCALE = 0.45;
const MAX_SCALE = 2.6;

/** Read the saved pinch zoom; falls back to 1 when missing or out of range. */
function readStoredScale(): number {
  const raw = Number(localStorage.getItem(SCALE_KEY));
  return Number.isFinite(raw) && raw >= MIN_SCALE && raw <= MAX_SCALE ? raw : 1;
}

/**
 * Pinch zoom remembered across wall remounts and app relaunches: leaving for
 * another page, coming back, or restarting restores the scale the user left at.
 */
let rememberedScale = readStoredScale();
/** `screen = camera + world * scale`. */
const camera = ref({ x: 0, y: 0, scale: rememberedScale });

watch(
  () => camera.value.scale,
  (scale) => {
    rememberedScale = scale;
    localStorage.setItem(SCALE_KEY, String(scale));
  },
);
/** The block the user opened, and which of its twelve posters the card shows. */
const selected = ref<WallFocus | null>(null);

const tracks = computed(() => player.tracks);
/**
 * The list the wall shows: the live play queue when there is one, otherwise the
 * whole library. When both are empty the wall renders its empty state.
 */
const sourceList = computed(() => (player.queue.length > 0 ? player.queue : tracks.value));
const total = computed(() => sourceList.value.length);
/** One cell of the lattice; a phone shows roughly five across. The gap mirrors folia's 8/128 seam. */
const metrics = computed(() => {
  const cell = Math.round(Math.min(112, Math.max(52, (width.value || 400) * 0.19)));
  return { cell, gap: Math.max(4, Math.round(cell * 0.0625)) };
});
const geometry = computed(() => geometryFor(total.value, metrics.value));
const viewport = computed(() => ({ width: width.value, height: height.value, scale: camera.value.scale }));

const bounds = computed(() => visibleBounds(
  centerOf(camera.value, viewport.value),
  viewport.value,
  { overscan: 320 },
));
const currentIndex = computed(() => {
  const current = player.currentTrack;
  if (!current) return -1;
  const key = trackKey(current);
  return sourceList.value.findIndex((track) => trackKey(track) === key);
});
const current = computed(() => player.currentTrack);
const tiles = computed(() => layoutWall(geometry.value, total.value, bounds.value, 0, metrics.value, selected.value));
/** The grown poster, once a block is open. */
const openedTile = computed(() => tiles.value.find((tile) => tile.expanded) ?? null);

/** The 12 tracks of the opened ring, centred on the focus track's neighbours in the source list. */
const focusWindow = computed(() => {
  const sel = selected.value;
  if (!sel) return null;
  const list = sourceList.value;
  if (list.length === 0) return null;
  let c = sel.centerIndex != null && sel.centerIndex >= 0 && sel.centerIndex < list.length ? sel.centerIndex : -1;
  if (c < 0 && sel.centerKey) c = list.findIndex((item) => trackKey(item) === sel.centerKey);
  if (c < 0) c = 0;
  return neighborWindow(list, c);
});

function isGrownTile(tile: WallInstance): boolean {
  const sel = selected.value;
  return Boolean(sel && tile.blockColumn === sel.block.column && tile.blockRow === sel.block.row);
}

/** Track a poster shows: grown ring seats follow the focus window; plain seats follow the source list. */
function tileTrack(tile: WallInstance): Track | null {
  const sel = selected.value;
  if (isGrownTile(tile) && sel) {
    const idx = tile.expanded ? 0 : grownWindowIndex(tile.slotIndex, sel.slotIndex);
    return focusWindow.value?.[idx] ?? null;
  }
  return sourceList.value[tile.queueIndex] ?? null;
}

/** Artist · album line, shown above the title on a plain poster. */
function metaOf(track: Track): string {
  return [track.artist, track.album].filter(Boolean).join(" · ");
}

const cardTrack = computed(() => (openedTile.value ? focusWindow.value?.[0] ?? null : null));
/** Whether the open card is showing the song that is actually playing. */
const isCardCurrent = computed(() => Boolean(cardTrack.value && current.value && trackKey(cardTrack.value) === trackKey(current.value)));
/**
 * Playing-card local view: lyrics layer up or down. While down the centre shows
 * the pause button again; tapping the cover/lyrics area collapses the lyrics.
 */
const lyricsVisible = ref(true);

/** Lyrics are on only when the card holds the playing song and it is actually playing. */
const lyricsActive = computed(() => isCardCurrent.value && lyricsVisible.value && player.isPlaying);

/** One parsed line flattened to plain text; "" outside the lyric range. */
function lineText(index: number): string {
  const line = lyrics.lines[index];
  if (!line) return "";
  return line.words.map((word) => word.word).join("").trim();
}

/**
 * Three lyric slots for the card: previous line, the sung line, next line.
 * Empty strings keep the three-row reservation even when a line is missing or
 * the card shows a different song.
 */
const lyricLines = computed<[string, string, string]>(() => {
  if (!isCardCurrent.value) return ["", "", ""];
  const i = lyrics.activeIndex;
  return [lineText(i - 1), lineText(i), lineText(i + 1)];
});

/* ----------------------------------------------------------------- motion */

/** folia's release momentum, so the two walls feel the same. */
const INERTIA = {
  /** Release speeds below this (px/s) do not coast. */
  minSpeed: 40,
  maxSpeed: 4000,
  /** Projection factor: the field travels speed * power before settling. */
  power: 0.3,
  timeConstant: 280,
  restDelta: 0.5,
  /** A release this long (ms) after the last move counts as a stopped hand. */
  staleReleaseMs: 80,
} as const;

const TAP_SLOP_PX = 8;
/** Below this finger separation (px) a pinch is not armed: the ratio is noise. */
const MIN_PINCH_PX = 24;
const SETTLE_MS = 340;
/** Idle time after which the wall drifts back to the playing track. */
const IDLE_MS = 6000;

/** One animation at a time: a glide, a coast, or a pinch all own the camera. */
let motionFrame = 0;
let idleTimer = 0;

/** Reset the idle centring timer; any touch, drag or tap counts as activity. */
function resetIdle() {
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => {
    if (currentIndex.value >= 0) centerOn(currentIndex.value, true);
  }, IDLE_MS);
}

function cancelMotion() {
  if (motionFrame) cancelAnimationFrame(motionFrame);
  motionFrame = 0;
}

function reducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/** Glide the camera so `center` lands under the view's centre. */
function panTo(center: { x: number; y: number }, ms = SETTLE_MS, targetScale?: number) {
  if (!width.value || !height.value) return;
  cancelMotion();
  const fitViewport = targetScale === undefined ? viewport.value : { ...viewport.value, scale: targetScale };
  const to = cameraAt(center, fitViewport);
  if (ms <= 0 || reducedMotion()) {
    camera.value = to;
    return;
  }
  const from = { x: camera.value.x, y: camera.value.y };
  const started = performance.now();
  const step = (now: number) => {
    const progress = Math.min(1, (now - started) / ms);
    const eased = 1 - (1 - progress) ** 3;
    camera.value = {
      x: from.x + (to.x - from.x) * eased,
      y: from.y + (to.y - from.y) * eased,
      scale: to.scale,
    };
    motionFrame = progress < 1 ? requestAnimationFrame(step) : 0;
  };
  motionFrame = requestAnimationFrame(step);
}

/** Keep travelling along the release velocity, decaying on folia's time constant. */
function coast(vx: number, vy: number) {
  const speed = Math.hypot(vx, vy);
  if (speed <= 0) return;
  const capped = Math.min(speed, INERTIA.maxSpeed);
  const distance = capped * INERTIA.power;
  const from = { x: camera.value.x, y: camera.value.y };
  const ux = vx / speed;
  const uy = vy / speed;
  const started = performance.now();
  cancelMotion();
  const step = (now: number) => {
    const elapsed = now - started;
    const travelled = distance * (1 - Math.exp(-elapsed / INERTIA.timeConstant));
    camera.value = { x: from.x + ux * travelled, y: from.y + uy * travelled, scale: camera.value.scale };
    if (distance - travelled > INERTIA.restDelta && elapsed < 4000) {
      motionFrame = requestAnimationFrame(step);
    } else {
      motionFrame = 0;
    }
  };
  motionFrame = requestAnimationFrame(step);
}

/* -------------------------------------------------------------------- pan */

const drag = {
  active: false,
  moved: false,
  id: -1,
  startX: 0,
  startY: 0,
  cameraX: 0,
  cameraY: 0,
  lastX: 0,
  lastY: 0,
  lastTime: 0,
  vx: 0,
  vy: 0,
};

/** Every finger currently down, in client coordinates; two of them pinch. */
const pointers = new Map<number, { x: number; y: number }>();
let pinch: { ids: [number, number]; distance: number } | null = null;
/** A drag or a pinch just ended: the click it would produce is not a tap. */
let ignoreClickUntil = 0;

/* ------------------------------------------------------------------ pinch */

function beginPinch(): boolean {
  if (pinch) return false;
  const ids = [...pointers.keys()].slice(0, 2) as [number, number];
  const first = pointers.get(ids[0]);
  const second = pointers.get(ids[1]);
  if (!first || !second) return false;
  const distance = Math.hypot(first.x - second.x, first.y - second.y);
  if (distance < MIN_PINCH_PX) return false;
  pinch = { ids, distance };
  ignoreClickUntil = performance.now() + 320;
  return true;
}

/** Midpoint and separation of the pinching fingers, in stage coordinates. */
function pinchMetrics() {
  if (!pinch) return null;
  const first = pointers.get(pinch.ids[0]);
  const second = pointers.get(pinch.ids[1]);
  if (!first || !second) return null;
  const rect = stage.value?.getBoundingClientRect();
  const offsetX = rect?.left ?? 0;
  const offsetY = rect?.top ?? 0;
  return {
    center: { x: (first.x + second.x) / 2 - offsetX, y: (first.y + second.y) / 2 - offsetY },
    distance: Math.hypot(first.x - second.x, first.y - second.y),
  };
}

/** Scale around a stage point: the world point under the fingers stays under them. */
function zoomAt(factor: number, anchor: { x: number; y: number }) {
  const from = camera.value;
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, from.scale * factor));
  if (Math.abs(scale - from.scale) < 0.0001) return;
  const worldX = (anchor.x - from.x) / from.scale;
  const worldY = (anchor.y - from.y) / from.scale;
  camera.value = {
    x: anchor.x - worldX * scale,
    y: anchor.y - worldY * scale,
    scale,
  };
}

/* ---------------------------------------------------------------- pointers */

function onPointerDown(event: PointerEvent) {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  resetIdle();
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  // A second finger turns the gesture into a pinch; the single-finger pan lets go.
  if (pointers.size >= 2) {
    cancelMotion();
    if (beginPinch()) {
      drag.active = false;
      drag.moved = true;
      return;
    }
  }

  cancelMotion();
  drag.active = true;
  drag.moved = false;
  drag.id = event.pointerId;
  drag.startX = event.clientX;
  drag.startY = event.clientY;
  drag.cameraX = camera.value.x;
  drag.cameraY = camera.value.y;
  drag.lastX = event.clientX;
  drag.lastY = event.clientY;
  drag.lastTime = event.timeStamp;
  drag.vx = 0;
  drag.vy = 0;
  // Capture is taken only once the gesture becomes a pan (see onPointerMove).
  // Capturing on tap here would redirect the following click to the stage and
  // the poster's own @click would never fire.
}

function onPointerMove(event: PointerEvent) {
  const known = pointers.get(event.pointerId);
  if (known) {
    known.x = event.clientX;
    known.y = event.clientY;
  }

  // The fingers may have started too close for the ratio to be stable; keep trying
  // as they spread instead of never zooming on a gesture that began pinched together.
  if (!pinch && pointers.size >= 2) beginPinch();

  if (pinch && (pinch.ids[0] === event.pointerId || pinch.ids[1] === event.pointerId)) {
    const metricsNow = pinchMetrics();
    if (metricsNow && metricsNow.distance >= 1 && pinch.distance >= 1) {
      zoomAt(metricsNow.distance / pinch.distance, metricsNow.center);
      pinch.distance = metricsNow.distance;
    }
    return;
  }
  // Two fingers down but not pinching: no pan, so the hands cannot slide the field
  // while the pinch is still forming.
  if (pointers.size >= 2) return;

  if (!drag.active || event.pointerId !== drag.id) return;
  const dx = event.clientX - drag.startX;
  const dy = event.clientY - drag.startY;
  // A short wobble is a tap on a poster, not a pan.
  if (!drag.moved && Math.hypot(dx, dy) <= TAP_SLOP_PX) return;
  if (!drag.moved) stage.value?.setPointerCapture?.(event.pointerId);
  drag.moved = true;

  const elapsed = event.timeStamp - drag.lastTime;
  if (elapsed > 0) {
    drag.vx = ((event.clientX - drag.lastX) / elapsed) * 1000;
    drag.vy = ((event.clientY - drag.lastY) / elapsed) * 1000;
  }
  drag.lastX = event.clientX;
  drag.lastY = event.clientY;
  drag.lastTime = event.timeStamp;

  camera.value = { ...camera.value, x: drag.cameraX + dx, y: drag.cameraY + dy };
}

function onPointerUp(event: PointerEvent) {
  pointers.delete(event.pointerId);
  const target = event.currentTarget as HTMLElement | null;

  if (pinch) {
    if (pinch.ids[0] !== event.pointerId && pinch.ids[1] !== event.pointerId) return;
    pinch = null;
    ignoreClickUntil = performance.now() + 320;
    // One finger left: it keeps panning the field, re-based where it is now.
    const remaining = [...pointers.entries()][0];
    if (remaining) {
      drag.active = true;
      drag.moved = true;
      drag.id = remaining[0];
      drag.startX = remaining[1].x;
      drag.startY = remaining[1].y;
      drag.cameraX = camera.value.x;
      drag.cameraY = camera.value.y;
      drag.lastX = remaining[1].x;
      drag.lastY = remaining[1].y;
      drag.lastTime = event.timeStamp;
      drag.vx = 0;
      drag.vy = 0;
    }
    return;
  }

  if (event.pointerId !== drag.id) return;
  drag.active = false;
  target?.releasePointerCapture?.(event.pointerId);
  if (drag.moved) ignoreClickUntil = performance.now() + 320;

  const stale = event.timeStamp - drag.lastTime > INERTIA.staleReleaseMs;
  const speed = Math.hypot(drag.vx, drag.vy);
  if (!drag.moved || stale || speed < INERTIA.minSpeed || reducedMotion()) return;
  coast(drag.vx, drag.vy);
}

function onPointerCancel(event: PointerEvent) {
  pointers.delete(event.pointerId);
  if (pinch) {
    pinch = null;
    ignoreClickUntil = performance.now() + 320;
  }
  if (event.pointerId !== drag.id) return;
  drag.active = false;
}

function onWheel(event: WheelEvent) {
  cancelMotion();
  const stageRect = stage.value?.getBoundingClientRect();
  const point = stageRect
    ? { x: event.clientX - stageRect.left, y: event.clientY - stageRect.top }
    : { x: width.value / 2, y: height.value / 2 };
  // Keep the world point under the cursor still while zooming.
  zoomAt(event.deltaY > 0 ? 0.9 : 1.1, point);
}

/* ------------------------------------------------------------- open, close */

/** Centre of the big card opened on `focusSlot`, in world space. */
function expandedCenter(block: { column: number; row: number }, focusSlot: number) {
  const geo = geometry.value;
  const repeatX = Math.floor(block.column / geo.blocksPerRow);
  const repeatY = Math.floor(block.row / geo.blockRows);
  const localColumn = block.column - repeatX * geo.blocksPerRow;
  const localRow = block.row - repeatY * geo.blockRows;
  const slot = focusSlotRect(focusSlot);
  const pitch = pitchOf(metrics.value);
  const gap = metrics.value.gap;
  // Centre on the actual poster rectangle (cover length minus the seam on each
  // side), not the pitch-grid centre, otherwise the card reads shifted to the right.
  const cardW = slot.cols * pitch - gap;
  const cardH = slot.rows * pitch - gap;
  return {
    x: repeatX * geo.cellWidth + localColumn * geo.blockWidth + slot.x * pitch + cardW / 2,
    y: repeatY * geo.cellHeight + localRow * geo.blockHeight + slot.y * pitch + cardH / 2,
  };
}

/** Tapping a poster opens its block; tapping the open card toggles playback. */
function onTileClick(tile: WallInstance) {
  resetIdle();
  if (performance.now() < ignoreClickUntil) return;
  if (tile.expanded) {
    // The cover itself never starts/stops playback: only the centre button does.
    // While playing, tapping the cover collapses the lyrics back to the button state.
    if (isCardCurrent.value) lyricsVisible.value = false;
    return;
  }

  // A ring card carries its own song. Tapping it re-centres the opened ring on
  // that track: the card moves to the middle and the eleven neighbours are
  // rebuilt from the queue around it, instead of swapping seats in place.
  const block = { column: tile.blockColumn, row: tile.blockRow };
  const track = tileTrack(tile);
  const centerKey = track ? trackKey(track) : undefined;
  const centerIndex = track ? sourceList.value.findIndex((item) => item === track) : -1;

  if (isGrownTile(tile)) {
    selected.value = { block, slotIndex: tile.slotIndex, centerKey, centerIndex };
    // Keep the user's current zoom: opening a card never resets the pinch scale.
    panTo(expandedCenter(block, tile.slotIndex), SETTLE_MS);
    return;
  }

  // Plain neighbour poster: open the block it sits in, with this track at the card.
  selected.value = { block, slotIndex: tile.slotIndex, centerKey, centerIndex };
  panTo(expandedCenter(block, tile.slotIndex), SETTLE_MS);
}

function playCard() {
  const track = cardTrack.value;
  if (!track) return;
  if (isCardCurrent.value) {
    player.togglePlayback();
    lyricsVisible.value = true;
    return;
  }
  lyricsVisible.value = true;
  void player.playInQueue(sourceList.value, track);
}

/** The centre button is the only play entry on the card. */
function onCenterButton() {
  if (isCardCurrent.value) {
    player.togglePlayback();
    lyricsVisible.value = true;
  } else {
    playCard();
  }
}

/** Tapping the playing lyrics pauses the song, hides the lyrics and brings the Play button back. */
function onLyricsTap() {
  player.togglePlayback();
  lyricsVisible.value = false;
}

function openCardLyrics() {
  const track = cardTrack.value;
  if (!track) return;
  // The lyric sheet shows the playing song, so open it on what the card holds.
  if (!isCardCurrent.value) void player.playInQueue(sourceList.value, track);
  emit("openLyrics");
}

/* --------------------------------------------------------- locate a song */

let pending: { index: number } | null = null;

/**
 * Bring one song to the middle. The grown card always exists and there is only
 * one: every centring opens the block in the centre, there is no plain-wall
 * no-card state.
 */
function centerOn(index: number, instant = false) {
  if (!width.value || !height.value || total.value === 0) {
    pending = { index };
    return;
  }
  const tile = locateNearest(geometry.value, total.value, index, centerOf(camera.value, viewport.value), metrics.value);
  if (!tile) return;
  const block = { column: tile.blockColumn, row: tile.blockRow };
  const centreTrack = sourceList.value[tile.queueIndex];
  const centerKey = centreTrack ? trackKey(centreTrack) : undefined;
  selected.value = { block, slotIndex: tile.slotIndex, centerKey };
  // Re-centring keeps the user's current pinch scale; the camera only moves the
  // focus to the centre, it never resets the zoom.
  panTo(expandedCenter(block, tile.slotIndex), instant ? 0 : SETTLE_MS);
  pending = null;
}

/** Centre the wall on the playing track; answered by the strip's long press. */
function focusCurrent() {
  centerOn(currentIndex.value >= 0 ? currentIndex.value : 0);
}

/** Centre the wall on the first track; used when the wall first gets a library. */
function focusFirst() {
  centerOn(0);
}

/* -------------------------------------------------------------- lifecycle */

let observer: ResizeObserver | null = null;
let centred = false;

onMounted(() => {
  const el = stage.value;
  if (!el) return;
  const measure = () => {
    const rect = el.getBoundingClientRect();
    width.value = rect.width;
    height.value = rect.height;
    if (pending) centerOn(pending.index, true);
  };
  measure();
  observer = new ResizeObserver(measure);
  observer.observe(el);
  if (total.value > 0 && !centred) {
    centred = true;
    centerOn(currentIndex.value >= 0 ? currentIndex.value : 0, true);
  }
  resetIdle();
});

watch(total, (next, previous) => {
  if (!next) return;
  // The library arriving is what gives the wall its first reason to move; after
  // that the camera belongs to the user and must not jump under their finger.
  if (!previous && !centred) {
    centred = true;
    centerOn(currentIndex.value >= 0 ? currentIndex.value : 0, true);
  }
});

/** Back on the wall after leaving it: centre on the playing track once it resolves. */
watch(currentIndex, (index, previous) => {
  if (index >= 0 && previous < 0 && !centred) {
    centred = true;
    centerOn(index, true);
  }
});

/** A long press on the navigation strip asks the wall to re-centre on the playing track. */
watch(() => props.focusToken, () => focusCurrent(), { immediate: true });

/**
 * When playback moves to a new track it grows to the centre; the track that was
 * playing falls back to a small ring card. Fires on identity change only, so a
 * metadata refresh on the same song does not re-centre the wall under the finger.
 */
watch(
  () => (current.value ? trackKey(current.value) : null),
  (key) => {
    if (!key) return;
    // Starting playback from the card itself leaves the grown card already in
    // the centre: do not run the re-centring/rearrange animation again. Only an
    // automatic switch to a different track moves the camera to the new card.
    const cardKey = cardTrack.value ? trackKey(cardTrack.value) : null;
    if (key === cardKey) return;
    lyricsVisible.value = true;
    centerOn(currentIndex.value >= 0 ? currentIndex.value : 0);
  },
);

onBeforeUnmount(() => {
  cancelMotion();
  window.clearTimeout(idleTimer);
  observer?.disconnect();
  observer = null;
});

defineExpose({ focusCurrent, focusFirst });
</script>

<template>
  <div ref="stage" class="wall-stage" @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerCancel" @wheel.prevent="onWheel">
    <div class="wall-world" :style="{ transform: worldTransform(camera) }">
      <div
        v-for="tile in tiles"
        :key="tile.id"
        class="wall-tile"
        :class="{ 'is-current': !tile.expanded && trackKey(tileTrack(tile)) === trackKey(current), 'is-expanded': tile.expanded }"
        :style="{ left: `${tile.x}px`, top: `${tile.y}px`, width: `${tile.width}px`, height: `${tile.height}px`, zIndex: tile.expanded ? 5 : trackKey(tileTrack(tile)) === trackKey(current) ? 2 : 1 }"
        role="button"
        tabindex="0"
        :aria-label="tileTrack(tile)?.title ?? ''"
        v-request-meta="tileTrack(tile) ?? undefined"
        @click="onTileClick(tile)"
        @keydown.enter.prevent="onTileClick(tile)"
      >
        <img v-if="tileTrack(tile)?.cover" class="wall-cover" :src="tileTrack(tile)?.cover" alt="" loading="lazy" decoding="async" draggable="false" />
        <span v-else class="wall-fallback" :style="{ background: tileTrack(tile)?.color ?? 'var(--line)' }" />
        <div v-if="!tile.expanded && tileTrack(tile)" class="wall-tile-copy">
          <span class="wall-tile-meta">{{ metaOf(tileTrack(tile)!) }}</span>
          <h3 class="wall-tile-title">{{ tileTrack(tile)!.title }}</h3>
        </div>
        <template v-if="tile.expanded && cardTrack">
          <span class="wall-card-shade" aria-hidden="true" />

          <!-- Centre Play button: hidden while the playing lyrics are on; returns
               after pausing or on a non-current card. -->
          <button
            v-if="!lyricsActive"
            type="button"
            class="wall-card-center"
            aria-label="Play"
            @click.stop="onCenterButton()"
          >
            <Play :size="26" />
          </button>

          <!-- Bottom copy: meta + title, kept in every state. -->
          <div class="wall-card wall-card--copy">
            <button
              v-if="!isCardCurrent"
              type="button"
              class="wall-card-meta"
              @click.stop="playCard()"
            >
              {{ metaOf(cardTrack) }}
            </button>
            <span v-else class="wall-card-meta">{{ metaOf(cardTrack) }}</span>
            <h2
              class="wall-card-title"
              :style="cardTrack?.color ? { color: cardTrack.color } : undefined"
            >{{ cardTrack.title }}</h2>
          </div>

          <!-- Playing lyrics state: three lines take the centre; tap to pause and return to the Play button. -->
          <div
            v-if="lyricsActive"
            class="wall-card-lyrics"
            @click.stop="onLyricsTap()"
          >
            <p class="wall-card-lyric is-prev">{{ lyricLines[0] }}</p>
            <p class="wall-card-lyric is-current">{{ lyricLines[1] }}</p>
            <p class="wall-card-lyric is-next">{{ lyricLines[2] }}</p>
          </div>

          <button
            type="button"
            class="wall-card-action wall-card-action--lyrics"
            :style="cardTrack?.color ? { color: cardTrack.color } : undefined"
            aria-label="Lyrics"
            @click.stop="openCardLyrics()"
          >
            <Music2 :size="18" />
          </button>
        </template>
      </div>
    </div>
    <div v-if="total === 0" class="wall-empty">
      <span class="text-[13px] font-semibold uppercase tracking-[0.2em] text-muted">{{ t("nav.wall") }}</span>
    </div>
  </div>
</template>

<style scoped>
.wall-stage {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: var(--bg);
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  cursor: grab;
}

.wall-stage:active {
  cursor: grabbing;
}

.wall-world {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: 0 0;
}

.wall-tile {
  position: absolute;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 0;
  background: var(--surface-2, var(--surface));
  cursor: pointer;
  transition:
    left 280ms cubic-bezier(0.2, 0.8, 0.2, 1),
    top 280ms cubic-bezier(0.2, 0.8, 0.2, 1),
    width 280ms cubic-bezier(0.2, 0.8, 0.2, 1),
    height 280ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.wall-tile.is-current {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 55%, transparent);
}

/* The grown poster: a page, not a tile. */
.wall-tile.is-expanded {
  border-color: color-mix(in srgb, var(--accent) 58%, var(--line));
  border-radius: 0;
  box-shadow: 0 22px 52px rgba(0, 0, 0, 0.34);
}

.wall-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.wall-fallback {
  display: block;
  width: 100%;
  height: 100%;
}

/* Plain poster copy: artist · album on top, full title at the bottom, folia layout. */
.wall-tile-copy {
  position: absolute;
  right: 8px;
  bottom: 8px;
  left: 8px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  color: #fff;
  pointer-events: none;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.6);
}

.wall-tile-meta {
  overflow: hidden;
  font-size: 10px;
  font-weight: 600;
  opacity: 0.78;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.wall-tile-title {
  margin: 0;
  overflow: hidden;
  font-size: 15px;
  font-weight: 800;
  line-height: 1.05;
  letter-spacing: -0.01em;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.wall-card-shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.84) 0%, rgba(0, 0, 0, 0.46) 44%, rgba(0, 0, 0, 0) 80%);
  pointer-events: none;
}

.wall-card {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 20px 22px 22px;
  color: #fff;
  pointer-events: none;
}

/* Artist · album line above the title, anchored to the bottom. */
.wall-card-meta {
  align-self: flex-start;
  max-width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  opacity: 0.72;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Idle entry: the meta line stays a tappable artist/album link. */
button.wall-card-meta {
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
  pointer-events: auto;
}

.wall-card-title {
  margin: 0;
  font-size: 23px;
  font-weight: 800;
  line-height: 1.14;
  letter-spacing: -0.01em;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.55);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Playing lyrics layer: fills the card and centres the three lines; tap to collapse. */
.wall-card-lyrics {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 8px;
  padding: 0 24px;
  text-align: center;
  pointer-events: auto;
  z-index: 2;
}

.wall-card-lyric {
  margin: 0;
  font-size: 17px;
  line-height: 1.5;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wall-card-lyric.is-prev,
.wall-card-lyric.is-next {
  opacity: 0.4;
}

.wall-card-lyric.is-current {
  opacity: 0.95;
  font-size: 24px;
  font-weight: 700;
}

.wall-card-action {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  background: transparent;
  color: #fff;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.5);
  cursor: pointer;
}

.wall-card-action--lyrics {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 3;
  pointer-events: auto;
}

.wall-card-center {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: grid;
  place-items: center;
  width: 60px;
  height: 60px;
  padding: 0;
  border: none;
  border-radius: 0;
  /* Single-colour clipped-corner rectangle; no two-tone layered shell. */
  clip-path: polygon(var(--cut) 0, calc(100% - var(--cut)) 0, 100% var(--cut), 100% calc(100% - var(--cut)), calc(100% - var(--cut)) 100%, var(--cut) 100%, 0 calc(100% - var(--cut)), 0 var(--cut));
  background: var(--accent);
  color: var(--accent-fg);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.34);
  cursor: pointer;
  z-index: 3;
}

.wall-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  pointer-events: none;
}
</style>
