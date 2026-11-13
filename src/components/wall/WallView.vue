<!--
 Copyright 2026 Atemukesu
 SPDX-License-Identifier: GPL-3.0-only
-->

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Music2, Pause, Play } from "@lucide/vue";
import { usePlayerStore } from "../../stores/player";
import { useLyricsStore } from "../../stores/lyrics";
import { cameraAt, centerOf, geometryFor, layoutWall, locateNearest, visibleBounds, worldTransform } from "./geometry";
import type { WallFocus, WallInstance } from "./geometry";

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
/** `screen = camera + world * scale`. */
const camera = ref({ x: 0, y: 0, scale: 1 });
/** The block the user opened, and which of its twelve posters the card shows. */
const selected = ref<WallFocus | null>(null);

const tracks = computed(() => player.tracks);
const total = computed(() => tracks.value.length);
/** One cell of the lattice; a phone shows roughly five across. */
const metrics = computed(() => ({
  cell: Math.round(Math.min(112, Math.max(52, (width.value || 400) * 0.19))),
  gap: 10,
}));
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
  return tracks.value.findIndex((track) => track.id === current.id);
});
const current = computed(() => player.currentTrack);
const tiles = computed(() => layoutWall(geometry.value, total.value, bounds.value, 0, metrics.value, selected.value));
/** The grown poster, once a block is open. */
const openedTile = computed(() => tiles.value.find((tile) => tile.expanded) ?? null);
const cardTrack = computed(() => {
  const tile = openedTile.value;
  if (!tile) return null;
  return tracks.value[tile.queueIndex] ?? null;
});
/** Whether the open card is showing the song that is actually playing. */
const isCardCurrent = computed(() => Boolean(cardTrack.value && current.value && cardTrack.value.id === current.value.id));

/** The lyric line being sung, read from the word runs the parser produces. */
const activeLyric = computed(() => {
  const line = lyrics.lines[lyrics.activeIndex];
  if (!line) return "";
  return line.words.map((word) => word.word).join("").trim();
});
/** A card for some other song has no sung line to show. */
const cardLyric = computed(() => (isCardCurrent.value ? activeLyric.value : ""));

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
const MIN_SCALE = 0.45;
const MAX_SCALE = 2.6;
const SETTLE_MS = 340;

/** One animation at a time: a glide, a coast, or a pinch all own the camera. */
let motionFrame = 0;

function cancelMotion() {
  if (motionFrame) cancelAnimationFrame(motionFrame);
  motionFrame = 0;
}

function reducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/** Glide the camera so `center` lands under the view's centre. */
function panTo(center: { x: number; y: number }, ms = SETTLE_MS) {
  if (!width.value || !height.value) return;
  cancelMotion();
  const to = cameraAt(center, viewport.value);
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
  const target = event.currentTarget as HTMLElement | null;
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
  target?.setPointerCapture?.(event.pointerId);
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

/** World centre of the grown poster inside one block. */
function expandedCenter(block: { column: number; row: number }) {
  const geo = geometry.value;
  const { cell, gap } = metrics.value;
  const pitch = cell + gap;
  const repeatX = Math.floor(block.column / geo.blocksPerRow);
  const repeatY = Math.floor(block.row / geo.blockRows);
  const localColumn = block.column - repeatX * geo.blocksPerRow;
  const localRow = block.row - repeatY * geo.blockRows;
  return {
    // The grown poster is slot 0: cells 3..8 across, 1..6 down.
    x: repeatX * geo.cellWidth + localColumn * geo.blockWidth + 6 * pitch - gap / 2,
    y: repeatY * geo.cellHeight + localRow * geo.blockHeight + 4 * pitch - gap / 2,
  };
}

/** Tapping a poster opens its block; tapping the open card closes it. */
function onTileClick(tile: WallInstance) {
  if (performance.now() < ignoreClickUntil) return;
  if (tile.expanded) {
    selected.value = null;
    return;
  }
  const block = { column: tile.blockColumn, row: tile.blockRow };
  selected.value = { block, slotIndex: tile.slotIndex };
  panTo(expandedCenter(block));
}

function playCard() {
  const track = cardTrack.value;
  if (!track) return;
  if (isCardCurrent.value) {
    player.togglePlayback();
    return;
  }
  void player.playInQueue(tracks.value, track);
}

function openCardLyrics() {
  const track = cardTrack.value;
  if (!track) return;
  // The lyric sheet shows the playing song, so open it on what the card holds.
  if (!isCardCurrent.value) void player.playInQueue(tracks.value, track);
  emit("openLyrics");
}

/* --------------------------------------------------------- locate a song */

let pending: { index: number; expand: boolean } | null = null;

/** Bring one song to the middle; `expand` also opens its block. */
function centerOn(index: number, expand = false, instant = false) {
  if (!width.value || !height.value || total.value === 0) {
    pending = { index, expand };
    return;
  }
  const tile = locateNearest(geometry.value, total.value, index, centerOf(camera.value, viewport.value), metrics.value);
  if (!tile) return;
  const block = { column: tile.blockColumn, row: tile.blockRow };
  if (expand) {
    selected.value = { block, slotIndex: tile.slotIndex };
    panTo(expandedCenter(block), instant ? 0 : SETTLE_MS);
  } else {
    selected.value = null;
    panTo({ x: tile.x + tile.width / 2, y: tile.y + tile.height / 2 }, instant ? 0 : SETTLE_MS);
  }
  pending = null;
}

/** Centre the wall on the playing track and open it; answered by the strip's long press. */
function focusCurrent() {
  centerOn(currentIndex.value >= 0 ? currentIndex.value : 0, true);
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
    if (pending) centerOn(pending.index, pending.expand, true);
  };
  measure();
  observer = new ResizeObserver(measure);
  observer.observe(el);
  if (total.value > 0 && !centred) {
    centred = true;
    centerOn(currentIndex.value >= 0 ? currentIndex.value : 0, false, true);
  }
});

watch(total, (next, previous) => {
  if (!next) return;
  // The library arriving is what gives the wall its first reason to move; after
  // that the camera belongs to the user and must not jump under their finger.
  if (!previous && !centred) {
    centred = true;
    centerOn(currentIndex.value >= 0 ? currentIndex.value : 0, false, true);
  }
});

/** A long press on the navigation strip asks the wall to re-centre on the playing track. */
watch(() => props.focusToken, () => focusCurrent());

onBeforeUnmount(() => {
  cancelMotion();
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
        :class="{ 'is-current': tile.queueIndex === currentIndex && !tile.expanded, 'is-expanded': tile.expanded }"
        :style="{ left: `${tile.x}px`, top: `${tile.y}px`, width: `${tile.width}px`, height: `${tile.height}px`, zIndex: tile.expanded ? 5 : tile.queueIndex === currentIndex ? 2 : 1 }"
        role="button"
        tabindex="0"
        :aria-label="tracks[tile.queueIndex]?.title ?? ''"
        @click="onTileClick(tile)"
        @keydown.enter.prevent="onTileClick(tile)"
      >
        <img v-if="tracks[tile.queueIndex]?.cover" class="wall-cover" :src="tracks[tile.queueIndex]?.cover" alt="" loading="lazy" decoding="async" draggable="false" />
        <span v-else class="wall-fallback" :style="{ background: tracks[tile.queueIndex]?.color ?? 'var(--line)' }">{{ tracks[tile.queueIndex]?.title?.slice(0, 1) ?? "" }}</span>
        <template v-if="tile.expanded && cardTrack">
          <span class="wall-card-shade" aria-hidden="true" />
          <div class="wall-card">
            <span class="wall-card-kicker">{{ t("nav.wall") }}</span>
            <h2 class="wall-card-title">{{ cardTrack.title }}</h2>
            <span class="wall-card-artist">{{ cardTrack.artist }}</span>
            <p v-if="cardLyric" class="wall-card-lyric">{{ cardLyric }}</p>
            <div class="wall-card-actions">
              <button type="button" class="wall-card-action is-primary" :aria-label="isCardCurrent && player.isPlaying ? 'Pause' : 'Play'" @click.stop="playCard()">
                <Pause v-if="isCardCurrent && player.isPlaying" :size="20" />
                <Play v-else :size="20" />
              </button>
              <button type="button" class="wall-card-action" aria-label="Lyrics" @click.stop="openCardLyrics()">
                <Music2 :size="18" />
              </button>
            </div>
          </div>
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
  border-radius: 2px;
  background: var(--surface-2, var(--surface));
  cursor: pointer;
}

.wall-tile.is-current {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 55%, transparent);
}

/* The grown poster: a page, not a tile. */
.wall-tile.is-expanded {
  border-color: color-mix(in srgb, var(--accent) 58%, var(--line));
  border-radius: 16px;
  box-shadow: 0 22px 52px rgba(0, 0, 0, 0.34);
}

.wall-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.wall-fallback {
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  font-size: 15px;
  font-weight: 800;
  color: var(--fg);
  opacity: 0.35;
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

.wall-card-kicker {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  opacity: 0.6;
}

.wall-card-title {
  margin: 0;
  font-size: 23px;
  font-weight: 800;
  line-height: 1.14;
  letter-spacing: -0.01em;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.wall-card-artist {
  font-size: 13px;
  font-weight: 500;
  opacity: 0.72;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wall-card-lyric {
  margin: 2px 0 0;
  font-size: 13px;
  line-height: 1.45;
  opacity: 0.62;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.wall-card-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  pointer-events: auto;
}

.wall-card-action {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.24);
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  backdrop-filter: blur(10px);
  cursor: pointer;
}

.wall-card-action.is-primary {
  width: 52px;
  height: 52px;
  border-color: transparent;
  background: var(--accent);
  color: var(--accent-fg);
}

.wall-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  pointer-events: none;
}
</style>
