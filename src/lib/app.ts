/**
 * Copyright 2026 Atemukesu
 * SPDX-License-Identifier: GPL-3.0-only
 */

import type { Component } from "vue";
import { CircleCheck, Folder, HardDriveDownload, LayoutGrid, Library, Search, Server } from "@lucide/vue";

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
  { id: "library", view: "playlists", labelKey: "nav.media", icon: LayoutGrid },
  { id: "search", view: "search", labelKey: "nav.search", icon: Search },
];

/** System group: the two source kinds (kept separate on purpose). */
export const systemNavItems: NavItem[] = [
  { id: "folders", labelKey: "nav.folders", index: "09", icon: Folder },
  { id: "webdav", labelKey: "nav.webdav", index: "10", icon: Server },
];

/**
 * Synthetic playlist id for the auto-generated "play ranking" playlist: the
 * library sorted by play count, most played first. It has no stored playlist
 * record, so the views resolve it from `profile.playCounts` instead.
 */
export const RECENT_PLAYS_ID = "builtin-recent-plays";

/** The five swipeable category panels, in sidebar order. */
export const categoryViews: View[] = ["playlists", "artists", "albums", "tracks", "years"];

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
