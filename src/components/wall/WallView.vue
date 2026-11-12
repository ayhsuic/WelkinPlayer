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
import { blockForEntry, cameraAt, centerOf, geometryFor, layoutWall, visibleBounds, worldTransform } from "./geometry";
import type { WallFocus, WallInstance } from "./geometry";

/**
 * The cover wall: the whole library as one endless field of posters, laid out by
 * `geometry.ts` and culled to the viewport. Panning moves a camera over a fixed
 * world rather than scrolling a container, which is what lets the field repeat
 * forever without ever growing the DOM to the size of the queue.
 *
 * The block seating the playing song is grown: its middle becomes one large
 * poster carrying the cover, the transport and the current lyric, and the eleven
 * posters that shared the block move out into the ring around it. Everything is
 * still sized in wall cells, so the grown card zooms and pans with the field.
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
/** The block around the playing song, nearest the camera; its middle poster is grown. */
const focus = computed<WallFocus | null>(() => {
  if (currentIndex.value < 0) return null;
  const block = blockForEntry(geometry.value, total.value, currentIndex.value, centerOf(camera.value, viewport.value));
  return block ? { block, queueIndex: currentIndex.value } : null;
});
const tiles = computed(() => layoutWall(geometry.value, total.value, bounds.value, 0, metrics.value, focus.value));

/** The lyric line being sung, read from the word runs the parser produces. */
const activeLyric = computed(() => {
  const line = lyrics.lines[lyrics.activeIndex];
  if (!line) return "";
  return line.words.map((word) => word.word).join("").trim();
});

/* -------------------------------------------------------------------- pan */

const drag = { active: false, moved: false, id: -1, x: 0, y: 0, cameraX: 0, cameraY: 0 };

function onPointerDown(event: PointerEvent) {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  drag.active = true;
  drag.moved = false;
  drag.id = event.pointerId;
  drag.x = event.clientX;
  drag.y = event.clientY;
  drag.cameraX = camera.value.x;
  drag.cameraY = camera.value.y;
  (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
}

function onPointerMove(event: PointerEvent) {
  if (!drag.active || event.pointerId !== drag.id) return;
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  // A short wobble is a tap on a poster, not a pan.
  if (!drag.moved && Math.hypot(dx, dy) <= 8) return;
  drag.moved = true;
  camera.value = { ...camera.value, x: drag.cameraX + dx, y: drag.cameraY + dy };
}

function onPointerUp(event: PointerEvent) {
  if (event.pointerId !== drag.id) return;
  drag.active = false;
  (event.currentTarget as HTMLElement | null)?.releasePointerCapture?.(event.pointerId);
}

function onWheel(event: WheelEvent) {
  const next = camera.value.scale * (event.deltaY > 0 ? 0.9 : 1.1);
  const scale = Math.min(2.4, Math.max(0.45, next));
  // Keep the world point under the cursor still while zooming.
  const stageRect = stage.value?.getBoundingClientRect();
  const point = stageRect
    ? { x: event.clientX - stageRect.left, y: event.clientY - stageRect.top }
    : { x: width.value / 2, y: height.value / 2 };
  const cx = (point.x - camera.value.x) / camera.value.scale;
  const cy = (point.y - camera.value.y) / camera.value.scale;
  camera.value = { x: point.x - cx * scale, y: point.y - cy * scale, scale };
}

/* ------------------------------------------------------------------- play */

function playTile(tile: WallInstance) {
  if (drag.moved) return;
  // The grown poster is already the playing song: tapping it is the transport,
  // not a re-selection that would restart the track from zero.
  if (tile.expanded) {
    player.togglePlayback();
    return;
  }
  const track = tracks.value[tile.queueIndex];
  if (!track) return;
  void player.playInQueue(tracks.value, track);
}

/* --------------------------------------------------------- locate current */

let pendingIndex = -1;

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

function centerOn(index: number) {
  if (!width.value || !height.value || total.value === 0) {
    pendingIndex = index;
    return;
  }
  const block = blockForEntry(geometry.value, total.value, index, centerOf(camera.value, viewport.value));
  if (!block) return;
  camera.value = cameraAt(expandedCenter(block), viewport.value);
  pendingIndex = -1;
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
    if (pendingIndex >= 0) centerOn(pendingIndex);
  };
  measure();
  observer = new ResizeObserver(measure);
  observer.observe(el);
  if (total.value > 0 && !centred) {
    centred = true;
    focusCurrent();
  }
});

watch(total, (next, previous) => {
  if (!next) return;
  // The library arriving is what gives the wall its first reason to move; after
  // that the camera belongs to the user and must not jump under their finger.
  if (!previous && !centred) {
    centred = true;
    focusCurrent();
  }
});

/** A long press on the navigation strip asks the wall to re-centre on the playing track. */
watch(() => props.focusToken, () => focusCurrent());

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
});

defineExpose({ focusCurrent, focusFirst });
</script>

<template>
  <div ref="stage" class="wall-stage" @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp" @wheel.prevent="onWheel">
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
        @click="playTile(tile)"
        @keydown.enter.prevent="playTile(tile)"
      >
        <img v-if="tracks[tile.queueIndex]?.cover" class="wall-cover" :src="tracks[tile.queueIndex]?.cover" alt="" loading="lazy" decoding="async" draggable="false" />
        <span v-else class="wall-fallback" :style="{ background: tracks[tile.queueIndex]?.color ?? 'var(--line)' }">{{ tracks[tile.queueIndex]?.title?.slice(0, 1) ?? "" }}</span>
        <template v-if="tile.expanded">
          <span class="wall-card-shade" aria-hidden="true" />
          <div class="wall-card">
            <span class="wall-card-kicker">{{ t("nav.wall") }}</span>
            <h2 class="wall-card-title">{{ current?.title }}</h2>
            <span class="wall-card-artist">{{ current?.artist }}</span>
            <p v-if="activeLyric" class="wall-card-lyric">{{ activeLyric }}</p>
            <div class="wall-card-actions">
              <button type="button" class="wall-card-action is-primary" :aria-label="player.isPlaying ? 'Pause' : 'Play'" @click.stop="player.togglePlayback()">
                <Pause v-if="player.isPlaying" :size="20" />
                <Play v-else :size="20" />
              </button>
              <button type="button" class="wall-card-action" aria-label="Lyrics" @click.stop="emit('openLyrics')">
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

/* The grown poster around the playing song: a page, not a tile. */
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
