/**
 * Copyright 2026 Atemukesu
 * SPDX-License-Identifier: GPL-3.0-only
 */

import type { Track } from "../stores/player";
import { profileKeyForTrack } from "../stores/profile";

/** A track together with how many times the profile has counted a full play. */
export interface RankedTrack {
  track: Track;
  count: number;
}

/**
 * Library tracks ordered by play count, most played first.
 *
 * Only tracks that carry a profile key and have been played at least once are
 * included, so stale play-count keys (a track removed from a source) never show
 * up as ghost entries.
 */
export function rankTracksByPlayCount(
  tracks: Track[],
  counts: Record<string, number>,
): RankedTrack[] {
  return tracks
    .map((track) => ({ track, key: profileKeyForTrack(track) }))
    .filter(
      (item): item is { track: Track; key: string } =>
        !!item.key && (counts[item.key] ?? 0) > 0,
    )
    .map((item) => ({ track: item.track, count: counts[item.key] }))
    .sort((a, b) => b.count - a.count);
}
