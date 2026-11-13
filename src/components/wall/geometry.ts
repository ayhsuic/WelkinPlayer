/**
 * Copyright 2026 Atemukesu
 * SPDX-License-Identifier: GPL-3.0-only
 */

/**
 * Geometry for the cover wall: an endless, periodic field of poster blocks.
 *
 * One block is a 12 x 8 grid of cells holding exactly 12 posters. The block is
 * filled as four independent 6 x 4 quadrants, each tiled by one of the recipes
 * below — every recipe covers a 6 x 4 area with exactly three rectangles, with
 * no gap and no overlap — so a template is gapless by construction rather than
 * by hand-checked coordinates. Which recipe a quadrant uses, and which of the
 * four mirrorings the block takes, both come from a hash of the block's own
 * coordinates; that keeps the field from reading as a grid without threading
 * any state through the renderer.
 */

export const BLOCK_COLS = 12;
export const BLOCK_ROWS = 8;
export const SLOTS_PER_BLOCK = 12;

/** A poster's seat inside one block, in cells. */
export type Slot = { x: number; y: number; cols: number; rows: number };

/** A poster placed in world units. */
export type WallInstance = {
  id: string;
  queueIndex: number;
  cellSlot: number;
  /** The block this poster belongs to, in unbounded block coordinates. */
  blockColumn: number;
  blockRow: number;
  /** Which of the block's twelve seats this poster occupies. */
  slotIndex: number;
  repeatX: number;
  repeatY: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** The grown poster of the block the user opened. */
  expanded?: boolean;
};

/** How big one cell is and how much air sits between posters. */
export type WallMetrics = { cell: number; gap: number };

export type Bounds = { left: number; right: number; top: number; bottom: number };

/** Aspect of the repeating cell: a mild landscape bias keeps the recurrence even. */
const CELL_ASPECT = 2.2;

/** Hard ceiling on posters built for one frame, so a zoom-out cannot stall a view. */
export const MAX_INSTANCES = 400;

/* ------------------------------------------------------------------ recipes */

/**
 * Each recipe tiles a 6 x 4 quadrant with three rectangles. They are listed
 * together so a reviewer can check the invariant at a glance: every entry's
 * areas sum to 24, and the rectangles never share a cell.
 */
const QUADRANT_RECIPES: Slot[][] = [
  // vertical stripes
  [
    { x: 0, y: 0, cols: 2, rows: 4 },
    { x: 2, y: 0, cols: 2, rows: 4 },
    { x: 4, y: 0, cols: 2, rows: 4 },
  ],
  // horizontal stripes, the last one taller
  [
    { x: 0, y: 0, cols: 6, rows: 1 },
    { x: 0, y: 1, cols: 6, rows: 1 },
    { x: 0, y: 2, cols: 6, rows: 2 },
  ],
  // one big square plus two small ones stacked
  [
    { x: 0, y: 0, cols: 4, rows: 4 },
    { x: 4, y: 0, cols: 2, rows: 2 },
    { x: 4, y: 2, cols: 2, rows: 2 },
  ],
  // a wide band plus two below
  [
    { x: 0, y: 0, cols: 6, rows: 2 },
    { x: 0, y: 2, cols: 3, rows: 2 },
    { x: 3, y: 2, cols: 3, rows: 2 },
  ],
  // two tall halves, the right one split
  [
    { x: 0, y: 0, cols: 3, rows: 4 },
    { x: 3, y: 0, cols: 3, rows: 2 },
    { x: 3, y: 2, cols: 3, rows: 2 },
  ],
  // tall left, wide right
  [
    { x: 0, y: 0, cols: 4, rows: 2 },
    { x: 4, y: 0, cols: 2, rows: 4 },
    { x: 0, y: 2, cols: 4, rows: 2 },
  ],
];

/** Quadrant origins, in cells. */
const QUADRANTS: Array<{ x: number; y: number }> = [
  { x: 0, y: 0 },
  { x: 6, y: 0 },
  { x: 0, y: 4 },
  { x: 6, y: 4 },
];

/** Which recipe each quadrant of a block uses; eight blocks make one period. */
const TEMPLATE_RECIPES: Array<[number, number, number, number]> = [
  [0, 1, 2, 3],
  [1, 2, 3, 4],
  [2, 3, 4, 5],
  [3, 4, 5, 0],
  [4, 5, 0, 1],
  [5, 0, 1, 2],
  [0, 3, 4, 1],
  [1, 4, 5, 2],
];

const flipX = (slots: Slot[]): Slot[] => slots.map((slot) => ({ ...slot, x: BLOCK_COLS - slot.x - slot.cols }));
const flipY = (slots: Slot[]): Slot[] => slots.map((slot) => ({ ...slot, y: BLOCK_ROWS - slot.y - slot.rows }));

/** Reflections preserve slot order, so a poster keeps its index in every orientation. */
const REFLECTIONS: Array<(slots: Slot[]) => Slot[]> = [
  (slots) => slots,
  flipX,
  flipY,
  (slots) => flipX(flipY(slots)),
];

/** Expands one recipe into a full 12 x 8 block. */
function buildTemplate(recipes: [number, number, number, number]): Slot[] {
  const slots: Slot[] = [];
  recipes.forEach((recipeIndex, quadrant) => {
    const origin = QUADRANTS[quadrant];
    for (const slot of QUADRANT_RECIPES[recipeIndex]) {
      slots.push({ x: origin.x + slot.x, y: origin.y + slot.y, cols: slot.cols, rows: slot.rows });
    }
  });
  return slots;
}

/** Every template, every mirroring: the orientations a block may take. */
const ORIENTATIONS: Slot[][] = TEMPLATE_RECIPES.flatMap((recipes) => {
  const template = buildTemplate(recipes);
  return REFLECTIONS.map((reflect) => reflect(template));
});

/** Integer hash; picks the mirroring so the field never settles into a visible period. */
function mixCoords(blockColumn: number, blockRow: number): number {
  let value = Math.imul(blockColumn, 0x9e3779b1) ^ Math.imul(blockRow, 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 15), 0x2c1b3c6d);
  value ^= value >>> 12;
  return value >>> 0;
}

/**
 * Resolves a block's orientation from its own coordinates, with no state to
 * thread through. The template steps linearly so neighbouring blocks can never
 * share one, while the mirroring comes from the hash.
 */
function orientationFor(blockColumn: number, blockRow: number): number {
  const count = TEMPLATE_RECIPES.length;
  const template = ((blockColumn + blockRow * 2) % count + count) % count;
  return template * REFLECTIONS.length + (mixCoords(blockColumn, blockRow) % REFLECTIONS.length);
}

export function slotsForBlock(blockColumn: number, blockRow: number): Slot[] {
  return ORIENTATIONS[orientationFor(blockColumn, blockRow)];
}

/* ----------------------------------------------------------------- geometry */

/** The repeating unit: enough blocks to hold one pass over the queue. */
export type WallGeometry = {
  blocksPerRow: number;
  blockRows: number;
  cellSlots: number;
  cellWidth: number;
  cellHeight: number;
  blockWidth: number;
  blockHeight: number;
};

export const pitchOf = (metrics: WallMetrics) => metrics.cell + metrics.gap;

export function geometryFor(totalEntries: number, metrics: WallMetrics): WallGeometry {
  const pitch = pitchOf(metrics);
  const blockWidth = BLOCK_COLS * pitch;
  const blockHeight = BLOCK_ROWS * pitch;
  const blocks = Math.max(1, Math.ceil(Math.max(0, totalEntries) / SLOTS_PER_BLOCK));
  const blocksPerRow = blocks <= 1
    ? 1
    : Math.max(1, Math.round(Math.sqrt((CELL_ASPECT * blocks * BLOCK_ROWS) / BLOCK_COLS)));
  const blockRows = Math.ceil(blocks / blocksPerRow);

  return {
    blocksPerRow,
    blockRows,
    cellSlots: blocksPerRow * blockRows * SLOTS_PER_BLOCK,
    cellWidth: blocksPerRow * blockWidth,
    cellHeight: blockRows * blockHeight,
    blockWidth,
    blockHeight,
  };
}

const overlaps = (rect: Bounds, view: Bounds) => (
  rect.left < view.right && rect.right > view.left && rect.top < view.bottom && rect.bottom > view.top
);

/**
 * Maps a grown block's seat to the seat whose song it shows.
 *
 * The opened block keeps its own twelve songs: the poster the user chose takes the
 * big card, and the eleven ring seats carry the rest of the block in order. Without
 * this the card would have to borrow a song from outside the block and the block's
 * own copy would show up twice.
 */
function grownSourceSlot(slotIndex: number, focusSlot: number): number {
  if (slotIndex === EXPANDED_SLOT_INDEX) return focusSlot;
  const index = slotIndex - 1;
  return index < focusSlot ? index : index + 1;
}

/** Builds the poster in one slot of one block, addressed by unbounded block coordinates. */
function buildInstance(
  geometry: WallGeometry,
  totalEntries: number,
  blockColumn: number,
  blockRow: number,
  slotIndex: number,
  metrics: WallMetrics,
  focus?: WallFocus | null,
): WallInstance {
  const repeatX = Math.floor(blockColumn / geometry.blocksPerRow);
  const repeatY = Math.floor(blockRow / geometry.blockRows);
  const localColumn = blockColumn - repeatX * geometry.blocksPerRow;
  const localRow = blockRow - repeatY * geometry.blockRows;
  const cellSlot = (localRow * geometry.blocksPerRow + localColumn) * SLOTS_PER_BLOCK + slotIndex;
  const grown = focus !== undefined && focus !== null && blockColumn === focus.block.column && blockRow === focus.block.row;
  const slot = grown ? EXPANDED_SLOTS[slotIndex] : slotsForBlock(localColumn, localRow)[slotIndex];
  const pitch = pitchOf(metrics);
  const expanded = grown && slotIndex === EXPANDED_SLOT_INDEX;
  const sourceSlot = grown && focus ? grownSourceSlot(slotIndex, focus.slotIndex) : slotIndex;
  const blockBase = cellSlot - slotIndex;

  return {
    id: `${cellSlot}:${repeatX}:${repeatY}`,
    // A cell seats whole blocks, so it usually holds more slots than songs; wrapping
    // fills the remainder instead of leaving a gap that would recur in every cell.
    queueIndex: totalEntries > 0 ? (blockBase + sourceSlot) % totalEntries : -1,
    cellSlot,
    blockColumn,
    blockRow,
    slotIndex,
    repeatX,
    repeatY,
    expanded,
    // The slot's own x/y is relative to the block, so the local block column and row
    // are what place it inside the cell.
    x: repeatX * geometry.cellWidth + localColumn * geometry.blockWidth + slot.x * pitch,
    y: repeatY * geometry.cellHeight + localRow * geometry.blockHeight + slot.y * pitch,
    width: slot.cols * pitch - metrics.gap,
    height: slot.rows * pitch - metrics.gap,
  };
}

/**
 * One block grown around the poster the user opened: the middle 6 x 6 becomes a
 * single card and the eleven posters that shared the block move into the ring it
 * leaves. The ring is filled exactly — the left and right thirds hold four 3 x 2
 * posters each, the strip above the card holds two 3 x 1, the one below a single
 * 6 x 1 — so the block still covers its 96 cells with twelve posters, with no gap
 * and no overlap. That is the same construction rule the plain recipes follow, so
 * a grown block cannot leave a hole either.
 */
const EXPANDED_SLOTS: Slot[] = [
  { x: 3, y: 1, cols: 6, rows: 6 },
  { x: 0, y: 0, cols: 3, rows: 2 },
  { x: 0, y: 2, cols: 3, rows: 2 },
  { x: 0, y: 4, cols: 3, rows: 2 },
  { x: 0, y: 6, cols: 3, rows: 2 },
  { x: 9, y: 0, cols: 3, rows: 2 },
  { x: 9, y: 2, cols: 3, rows: 2 },
  { x: 9, y: 4, cols: 3, rows: 2 },
  { x: 9, y: 6, cols: 3, rows: 2 },
  { x: 3, y: 0, cols: 3, rows: 1 },
  { x: 6, y: 0, cols: 3, rows: 1 },
  { x: 3, y: 7, cols: 6, rows: 1 },
];

/** The grown poster is the first slot of the expanded block. */
const EXPANDED_SLOT_INDEX = 0;

/**
 * The block seating `queueIndex` that sits closest to a world point. Used to
 * centre the wall on a song without moving the camera anywhere the user did not
 * ask for.
 */
export function blockForEntry(
  geometry: WallGeometry,
  totalEntries: number,
  queueIndex: number,
  point: { x: number; y: number },
): { column: number; row: number } | null {
  if (totalEntries <= 0 || queueIndex < 0 || queueIndex >= totalEntries) return null;

  let best: { column: number; row: number } | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let cellSlot = queueIndex; cellSlot < geometry.cellSlots; cellSlot += totalEntries) {
    const blockInCell = Math.floor(cellSlot / SLOTS_PER_BLOCK);
    const localColumn = blockInCell % geometry.blocksPerRow;
    const localRow = Math.floor(blockInCell / geometry.blocksPerRow);
    const blockX = localColumn * geometry.blockWidth;
    const blockY = localRow * geometry.blockHeight;
    const repeatX = Math.round((point.x - blockX - geometry.blockWidth / 2) / geometry.cellWidth);
    const repeatY = Math.round((point.y - blockY - geometry.blockHeight / 2) / geometry.cellHeight);
    const centerX = repeatX * geometry.cellWidth + blockX + geometry.blockWidth / 2;
    const centerY = repeatY * geometry.cellHeight + blockY + geometry.blockHeight / 2;
    const distance = (centerX - point.x) ** 2 + (centerY - point.y) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = {
        column: repeatX * geometry.blocksPerRow + localColumn,
        row: repeatY * geometry.blockRows + localRow,
      };
    }
  }

  return best;
}

/** What an opened block needs: which block, and which of its seats the card shows. */
export type WallFocus = { block: { column: number; row: number }; slotIndex: number };

/** Posters intersecting the viewport. Cost scales with what is on screen, never with queue length. */
export function layoutWall(
  geometry: WallGeometry,
  totalEntries: number,
  bounds: Bounds,
  overscan: number,
  metrics: WallMetrics,
  focus?: WallFocus | null,
): WallInstance[] {
  if (totalEntries <= 0 || geometry.blockWidth <= 0 || geometry.blockHeight <= 0) return [];

  const view: Bounds = {
    left: bounds.left - overscan,
    right: bounds.right + overscan,
    top: bounds.top - overscan,
    bottom: bounds.bottom + overscan,
  };
  const fromColumn = Math.floor(view.left / geometry.blockWidth);
  const toColumn = Math.floor(view.right / geometry.blockWidth);
  const fromRow = Math.floor(view.top / geometry.blockHeight);
  const toRow = Math.floor(view.bottom / geometry.blockHeight);
  const result: WallInstance[] = [];

  for (let row = fromRow; row <= toRow; row += 1) {
    for (let column = fromColumn; column <= toColumn; column += 1) {
      for (let slotIndex = 0; slotIndex < SLOTS_PER_BLOCK; slotIndex += 1) {
        const instance = buildInstance(geometry, totalEntries, column, row, slotIndex, metrics, focus);
        const rect: Bounds = {
          left: instance.x,
          right: instance.x + instance.width,
          top: instance.y,
          bottom: instance.y + instance.height,
        };
        if (!overlaps(rect, view)) continue;
        result.push(instance);
        if (result.length >= MAX_INSTANCES) return result;
      }
    }
  }

  return result;
}

/**
 * The copy of one song sitting closest to a world point. A song can seat more
 * than once per cell, so every seat is checked and each snapped to its nearest
 * repeat. This is what centres the wall on a track without moving the camera
 * anywhere the user did not ask for.
 */
export function locateNearest(
  geometry: WallGeometry,
  totalEntries: number,
  queueIndex: number,
  point: { x: number; y: number },
  metrics: WallMetrics,
): WallInstance | null {
  if (totalEntries <= 0 || queueIndex < 0 || queueIndex >= totalEntries) return null;

  let best: WallInstance | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let cellSlot = queueIndex; cellSlot < geometry.cellSlots; cellSlot += totalEntries) {
    const blockInCell = Math.floor(cellSlot / SLOTS_PER_BLOCK);
    const localColumn = blockInCell % geometry.blocksPerRow;
    const localRow = Math.floor(blockInCell / geometry.blocksPerRow);
    const slotIndex = cellSlot % SLOTS_PER_BLOCK;
    const base = buildInstance(geometry, totalEntries, localColumn, localRow, slotIndex, metrics);
    const repeatX = Math.round((point.x - base.x - base.width / 2) / geometry.cellWidth);
    const repeatY = Math.round((point.y - base.y - base.height / 2) / geometry.cellHeight);
    const candidate = buildInstance(
      geometry,
      totalEntries,
      repeatX * geometry.blocksPerRow + localColumn,
      repeatY * geometry.blockRows + localRow,
      slotIndex,
      metrics,
    );
    const dx = candidate.x + candidate.width / 2 - point.x;
    const dy = candidate.y + candidate.height / 2 - point.y;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  return best;
}

/* ------------------------------------------------------------------ camera */

/** Camera for the world layer: `screen = camera + world * scale`, in screen px. */
export type WallCamera = { x: number; y: number; scale: number };

export type WallViewport = { width: number; height: number; scale: number; lineX?: number };

export const viewLineX = (view: WallViewport) => view.lineX ?? view.width / 2;

/**
 * The world layer's transform. The translation is snapped to whole device pixels
 * because Chromium rasterizes a transformed layer on the pixel grid: a fractional
 * translation changes every frame of a drag and throws the visible tiles away each
 * time, so panning would re-rasterize the wall continuously instead of moving it.
 */
export const worldTransform = (camera: WallCamera, devicePixelRatio = window.devicePixelRatio || 1): string => {
  const snap = (value: number) => Math.round(value * devicePixelRatio) / devicePixelRatio;
  return `translate3d(${snap(camera.x)}px, ${snap(camera.y)}px, 0) scale(${camera.scale})`;
};

/** World point under the view's centre. */
export const centerOf = (camera: WallCamera, view: WallViewport) => ({
  x: (viewLineX(view) - camera.x) / camera.scale,
  y: (view.height / 2 - camera.y) / camera.scale,
});

/** Camera that puts a given world point under the view's centre. */
export const cameraAt = (center: { x: number; y: number }, view: WallViewport): WallCamera => ({
  x: viewLineX(view) - center.x * view.scale,
  y: view.height / 2 - center.y * view.scale,
  scale: view.scale,
});

/** World rect currently on screen, widened by a seam and by the overscan margin. */
export const visibleBounds = (
  center: { x: number; y: number },
  view: WallViewport,
  { overscan = 0 }: { overscan?: number } = {},
): Bounds => {
  const lineX = viewLineX(view);
  return {
    left: center.x - lineX / view.scale - overscan,
    right: center.x + (view.width - lineX) / view.scale + overscan,
    top: center.y - view.height / 2 / view.scale - overscan,
    bottom: center.y + view.height / 2 / view.scale + overscan,
  };
};
