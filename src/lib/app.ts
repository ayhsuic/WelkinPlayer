/**
 * Copyright 2026 Atemukesu
 * SPDX-License-Identifier: GPL-3.0-only
 */

import type { Component } from "vue";
import { CalendarDays, CircleCheck, Disc3, Folder, HardDriveDownload, LayoutGrid, Library, ListMusic, ListPlus, Mic2, Music, Search, Server, Settings2 } from "@lucide/vue";

export type View = "wall" | "library" | "tracks" | "queue" | "favorites" | "artists" | "albums" | "years" | "genres" | "sources" | "folders" | "webdav" | "source-browser" | "source-config" | "playlists" | "playlist-new" | "lyrics-edit" | "track-edit" | "track-info" | "downloading" | "downloaded" | "settings" | "sponsor" | "search" | "player";
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

/** The four bottom tabs of the mobile drawer, modelled on lmusic's NavigateTabBar. */
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
  { id: "settings", view: "settings", labelKey: "nav.settings", icon: Settings2 },
  { id: "search", view: "search", labelKey: "nav.search", icon: Search },
];

/** Library group: playlists plus the swipeable classifications. */
export const libraryNavItems: NavItem[] = [
  { id: "playlists", labelKey: "nav.playlists", index: "03", icon: ListPlus },
  { id: "artists", labelKey: "nav.artists", index: "04", icon: Mic2 },
  { id: "albums", labelKey: "nav.albums", index: "05", icon: Disc3 },
  { id: "tracks", labelKey: "nav.tracks", index: "06", icon: ListMusic },
  { id: "genres", labelKey: "nav.genres", index: "07", icon: Music },
  { id: "years", labelKey: "nav.years", index: "08", icon: CalendarDays },
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

/** The six swipeable category panels, in sidebar order. */
export const categoryViews: View[] = ["playlists", "artists", "albums", "tracks", "genres", "years"];

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
