/**
 * Copyright 2026 Atemukesu
 * SPDX-License-Identifier: GPL-3.0-only
 */

import type { Component } from "vue";
import { CircleCheck, HardDriveDownload, LayoutGrid, Library, Server } from "@lucide/vue";

export type View = "wall" | "library" | "tracks" | "favorites" | "artists" | "albums" | "years" | "genres" | "sources" | "folders" | "webdav" | "source-browser" | "source-config" | "playlists" | "playlist-new" | "lyrics-edit" | "track-edit" | "track-info" | "downloading" | "downloaded" | "settings" | "search" | "player";
export type Theme = "light" | "dark";
export type Accent = "amber" | "orange" | "cyan" | "red" | "green" | "blue";

export interface NavItem {
  id: View;
  labelKey: string;
  index: string;
  icon: Component;
}

/** Primary group: the cover wall and the library entry. */
export const primaryNavItems: NavItem[] = [
  { id: "wall", labelKey: "nav.wall", index: "00", icon: LayoutGrid },
  { id: "library", labelKey: "nav.media", index: "01", icon: Library },
];

/** The bottom tabs of the mobile drawer; settings is reached from the home avatar instead. */
export type MainTab = "home" | "library" | "settings" | "search";

export interface MainTabItem {
  id: MainTab;
  /** Underlying view the tab opens inside the drawer. */
  view: View;
  labelKey: string;
  icon: Component;
}

export const mainNavTabs: MainTabItem[] = [
  { id: "home", view: "library", labelKey: "nav.home", icon: Library },
];

/** Primary destinations shown in the horizontal pager and the top-bar entries.
 *  The home view carries overview / search / detail states in one shell; there
 *  is no separate library tab. */
export const mainPagerTabs: MainTab[] = ["home"];

/** System group: the merged source entry (local folders + WebDAV together). */
export const systemNavItems: NavItem[] = [
  { id: "sources", labelKey: "nav.sources", index: "09", icon: Server },
];

/**
 * Synthetic playlist ids for the generated built-in collections. They have no
 * stored playlist record; the views resolve them from the profile and library
 * instead.
 *
 * - `RECENT_PLAYS_ID`: tracks from the play history, most recently played first.
 * - `RECENTLY_ADDED_ID`: library tracks ordered by source modification time,
 *   newest first.
 */
export const RECENT_PLAYS_ID = "builtin-recent-plays";
export const RECENTLY_ADDED_ID = "builtin-recently-added";

/** Manual cache download manager, grouped with the library entries. */
export const downloadNavItems: NavItem[] = [
  { id: "downloading", labelKey: "nav.downloading", index: "D", icon: HardDriveDownload },
  { id: "downloaded", labelKey: "nav.downloaded", index: "C", icon: CircleCheck },
];

export const accents: { id: Accent; key: string; swatch: string }[] = [
  { id: "amber", key: "accent.amber", swatch: "#f0a500" },
  { id: "orange", key: "accent.orange", swatch: "#ff6a00" },
  { id: "cyan", key: "accent.cyan", swatch: "#00b8d4" },
  { id: "red", key: "accent.red", swatch: "#e63946" },
  { id: "green", key: "accent.green", swatch: "#16c79a" },
  { id: "blue", key: "accent.blue", swatch: "#3d7dff" },
];
