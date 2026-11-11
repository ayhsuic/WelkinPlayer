<!--
 Copyright 2026 Atemukesu
 SPDX-License-Identifier: GPL-3.0-only
-->

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { usePlayerStore } from "../../stores/player";
import { cameraAt, centerOf, geometryFor, layoutWall, locateNearest, visibleBounds, worldTransform } from "./geometry";

/**
 * The cover wall: the whole library as one endless field of posters, laid out by
 * `geometry.ts` and culled to the viewport. Panning moves a camera over a fixed
 * world rather than scrolling a container, which is what lets the field repeat
 * forever without ever growing the DOM to the size of the queue.
 */
const props = withDefaults(defineProps<{ focusToken?: number }>(), { focusToken: 0 });
const { t } = useI18n();
const player = usePlayerStore();

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
const bounds = computed(() => visibleBounds(
  centerOf(camera.value, { width: width.value, height: height.value, scale: camera.value.scale }),
  { width: width.value, height: height.value, scale: camera.value.scale },
  { overscan: 320 },
));
const tiles = computed(() => layoutWall(geometry.value, total.value, bounds.value, 0, metrics.value));
const currentIndex = computed(() => {
  const current = player.currentTrack;
  if (!current) return -1;
  return tracks.value.findIndex((track) => track.id === current.id);
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

function playTile(index: number) {
  if (drag.moved) return;
  const track = tracks.value[index];
  if (!track) return;
  void player.playInQueue(tracks.value, track);
}

/* --------------------------------------------------------- locate current */

let pendingIndex = -1;

function centerOn(index: number) {
  if (!width.value || !height.value || total.value === 0) {
    pendingIndex = index;
    return;
  }
  const instance = locateNearest(
    geometry.value,
    total.value,
    index,
    centerOf(camera.value, { width: width.value, height: height.value, scale: camera.value.scale }),
    metrics.value,
  );
  if (!instance) return;
  camera.value = cameraAt(
    { x: instance.x + instance.width / 2, y: instance.y + instance.height / 2 },
    { width: width.value, height: height.value, scale: camera.value.scale },
  );
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
      <button
        v-for="tile in tiles"
        :key="tile.id"
        type="button"
        class="wall-tile"
        :class="{ 'is-current': tile.queueIndex === currentIndex }"
        :style="{ left: `${tile.x}px`, top: `${tile.y}px`, width: `${tile.width}px`, height: `${tile.height}px`, zIndex: tile.queueIndex === currentIndex ? 2 : 1 }"
        :aria-label="tracks[tile.queueIndex]?.title ?? ''"
        @click="playTile(tile.queueIndex)"
      >
        <img v-if="tracks[tile.queueIndex]?.cover" class="wall-cover" :src="tracks[tile.queueIndex]?.cover" alt="" loading="lazy" decoding="async" draggable="false" />
        <span v-else class="wall-fallback" :style="{ background: tracks[tile.queueIndex]?.color ?? 'var(--line)' }">{{ tracks[tile.queueIndex]?.title?.slice(0, 1) ?? "" }}</span>
      </button>
    </div>
    <div v-if="total === 0" class="wall-empty">
      <span class="text-[13px] font-semibold uppercase tracking-[0.2em] text-muted">{{ t("nav.wall") }}</span>
    </div>
  </div>
</template>

<style scoped>
.wall-stage {
  position: relative;
  min-height: 0;
  flex: 1;
  overflow: hidden;
  background: var(--surface);
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
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 2px;
  background: var(--surface-2, var(--surface));
}

.wall-tile.is-current {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 55%, transparent);
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

.wall-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  pointer-events: none;
}
</style>
