<!--
 Copyright 2026 Atemukesu
 SPDX-License-Identifier: GPL-3.0-only
-->

<script setup lang="ts">
import { computed, ref } from "vue";
import { ChevronLeft, ChevronRight, HeartHandshake, Menu, Music2, Settings2 } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import { libraryNavItems, primaryNavItems, systemNavItems, type NavItem } from "../lib/app";
import type { View } from "../lib/app";

const props = withDefaults(defineProps<{ activeView: View; placement: "header" | "sidebar" | "mobile"; collapsed?: boolean; activePlaylistId?: string | null; activeArtist?: string | null; activeAlbum?: string | null; activeYear?: string | null; activeGenre?: string | null; activeSource?: string | null }>(), { collapsed: false, activePlaylistId: null, activeArtist: null, activeAlbum: null, activeYear: null, activeGenre: null, activeSource: null });
const emit = defineEmits<{ navigate: [view: View]; toggle: []; createPlaylist: []; openPlaylist: [id: string] }>();
const { t } = useI18n();
const playlistsActive = computed(() => props.activeView === "playlists" || (props.activeView === "tracks" && !!props.activePlaylistId));
/** Drawer navigation (hamburger on the mobile header): overlay slide-in from the left. */
const drawerOpen = ref(false);
function toggleDrawer() { drawerOpen.value = !drawerOpen.value; }
function closeDrawer() { drawerOpen.value = false; }
function navigateDrawer(view: View) { closeDrawer(); emit("navigate", view); }
function isClassificationActive(id: View): boolean {
  if (id === "artists") return props.activeView === "artists" || !!props.activeArtist;
  if (id === "albums") return props.activeView === "albums" || !!props.activeAlbum;
  if (id === "years") return props.activeView === "years" || !!props.activeYear;
  if (id === "genres") return props.activeView === "genres" || !!props.activeGenre;
  if (id === "sources") return props.activeView === "sources" || props.activeView === "source-config" || props.activeView === "source-browser" || !!props.activeSource;
  return false;
}
/** Highlight a sidebar/drawer entry per its own drill-down rules. */
function navItemActive(item: NavItem): boolean {
  switch (item.id) {
    case "library": return props.activeView === "library";
    case "queue": return props.activeView === "queue";
    case "playlists": return playlistsActive.value;
    case "tracks": return props.activeView === "tracks" && !props.activePlaylistId && !props.activeArtist && !props.activeAlbum && !props.activeYear && !props.activeGenre && !props.activeSource;
    case "sources": return isClassificationActive("sources");
    default: return isClassificationActive(item.id);
  }
}
</script>

<template>
  <template v-if="placement === 'header'">
    <header class="z-40 shrink-0 border-b border-line bg-surface md:hidden" style="padding-top: env(safe-area-inset-top)">
      <div class="flex h-11 items-center gap-2 px-2">
        <button type="button" class="grid h-9 w-9 place-items-center text-fg transition-colors hover:text-accent" :aria-label="t('nav.more')" :aria-expanded="drawerOpen" aria-haspopup="dialog" @click="toggleDrawer"><Menu :size="20" :stroke-width="1.8" /></button>
        <span class="flex-1"></span>
      </div>
    </header>
    <Teleport to="body">
      <Transition name="sheet-backdrop"><div v-if="drawerOpen" class="fixed inset-0 z-[70] bg-black/40 md:hidden" @pointerdown="closeDrawer"></div></Transition>
      <Transition name="drawer">
        <section v-if="drawerOpen" class="drawer-shell fixed bottom-0 left-0 top-0 z-[71] flex w-[280px] flex-col overflow-y-auto overscroll-contain border-r border-line bg-surface pb-3 md:hidden" style="padding-top: env(safe-area-inset-top)" role="dialog" aria-modal="true" aria-label="navigation">
          <div class="flex items-center justify-between border-b border-line px-5 py-4">
            <span class="flex items-center gap-2">
              <span class="sidebar-logo grid h-7 w-7 shrink-0 place-items-center bg-accent text-accent-fg" aria-hidden="true"><Music2 :size="14" :stroke-width="2.2" /></span>
              <span class="text-sm font-black uppercase tracking-[0.25em]">Welkin</span>
            </span>
          </div>
          <nav class="flex flex-col gap-px p-3">
            <button v-for="item in primaryNavItems" :key="item.id" type="button" class="relative flex h-11 items-center gap-3 border border-transparent px-3 text-left text-[13px] font-semibold uppercase tracking-[0.15em] transition-colors" :class="navItemActive(item) ? 'ak-select' : 'text-muted ak-hover hover:text-fg'" @click="navigateDrawer(item.id)"><component :is="item.icon" :size="18" :stroke-width="1.8" /><span class="truncate">{{ t(item.labelKey) }}</span></button>
          </nav>
          <div class="mx-3 border-t border-line"></div>
          <nav class="flex flex-col gap-px p-3">
            <button v-for="item in libraryNavItems" :key="item.id" type="button" class="relative flex h-11 items-center gap-3 border border-transparent px-3 text-left text-[13px] font-semibold uppercase tracking-[0.15em] transition-colors" :class="navItemActive(item) ? 'ak-select' : 'text-muted ak-hover hover:text-fg'" @click="navigateDrawer(item.id)"><component :is="item.icon" :size="18" :stroke-width="1.8" /><span class="truncate">{{ t(item.labelKey) }}</span></button>
          </nav>
          <div class="mx-3 border-t border-line"></div>
          <nav class="flex flex-col gap-px p-3">
            <button v-for="item in systemNavItems" :key="item.id" type="button" class="relative flex h-11 items-center gap-3 border border-transparent px-3 text-left text-[13px] font-semibold uppercase tracking-[0.15em] transition-colors" :class="navItemActive(item) ? 'ak-select' : 'text-muted ak-hover hover:text-fg'" @click="navigateDrawer(item.id)"><component :is="item.icon" :size="18" :stroke-width="1.8" /><span class="truncate">{{ t(item.labelKey) }}</span></button>
          </nav>
          <div class="mt-auto border-t border-line pt-3">
            <nav class="flex flex-col gap-px p-3">
              <button type="button" class="relative flex h-11 items-center gap-3 border border-transparent px-3 text-left text-[13px] font-semibold uppercase tracking-[0.15em] transition-colors" :class="activeView === 'settings' ? 'ak-select' : 'text-muted ak-hover hover:text-fg'" @click="navigateDrawer('settings')"><Settings2 :size="18" :stroke-width="1.8" /><span class="truncate">{{ t("nav.settings") }}</span></button>
              <button type="button" class="relative flex h-11 items-center gap-3 border border-transparent px-3 text-left text-[13px] font-semibold uppercase tracking-[0.15em] transition-colors" :class="activeView === 'sponsor' ? 'ak-select' : 'text-muted ak-hover hover:text-fg'" @click="navigateDrawer('sponsor')"><HeartHandshake :size="18" :stroke-width="1.8" /><span class="truncate">{{ t("nav.sponsor") }}</span></button>
              <button type="button" class="relative flex h-11 items-center gap-3 border border-transparent px-3 text-left text-[13px] font-semibold uppercase tracking-[0.15em] text-muted transition-colors ak-hover hover:text-fg" @click="closeDrawer"><ChevronLeft :size="18" :stroke-width="1.8" /><span class="truncate">{{ t("controls.collapse") }}</span></button>
            </nav>
          </div>
        </section>
      </Transition>
    </Teleport>
  </template>
  <aside v-if="placement === 'sidebar'" class="sidebar-shell hidden min-h-0 shrink-0 flex-col overflow-y-auto overscroll-contain border-r border-line bg-surface md:flex" :class="{ 'is-collapsed': collapsed }">
    <div class="sidebar-brand flex items-center border-b border-line pb-5" :class="collapsed ? 'justify-center' : 'gap-3'"><span class="sidebar-logo grid h-9 w-9 shrink-0 place-items-center bg-accent text-accent-fg" aria-hidden="true"><Music2 :size="18" :stroke-width="2.2" /></span><div class="sidebar-brand-copy"><p class="text-sm font-black uppercase tracking-[0.25em] leading-none">Welkin</p></div></div>
    <nav class="flex flex-col gap-px" :class="collapsed ? 'mt-4' : 'mt-6'"><button v-for="item in primaryNavItems" :key="item.id" class="relative flex h-11 items-center border border-transparent text-left text-[13px] font-semibold uppercase tracking-[0.2em] transition-colors" :class="[collapsed ? 'justify-center px-0' : 'gap-2 px-3', navItemActive(item) ? 'ak-select' : 'text-muted ak-hover hover:text-fg']" :title="collapsed ? t(item.labelKey) : undefined" :aria-current="navItemActive(item) ? 'page' : undefined" @click="emit('navigate', item.id)"><component :is="item.icon" :size="16" :stroke-width="1.8" /><span class="sidebar-nav-label truncate">{{ t(item.labelKey) }}</span></button></nav>
    <div class="mt-5 border-t border-line pt-4">
      <nav class="flex flex-col gap-px"><button v-for="item in libraryNavItems" :key="item.id" class="relative flex h-11 w-full items-center border border-transparent text-left text-[13px] font-semibold uppercase tracking-[0.2em] transition-colors" :class="[collapsed ? 'justify-center px-0' : 'gap-2 px-3', navItemActive(item) ? 'ak-select' : 'text-muted ak-hover hover:text-fg']" :title="collapsed ? t(item.labelKey) : undefined" :aria-current="navItemActive(item) ? 'page' : undefined" @click="emit('navigate', item.id)"><component :is="item.icon" :size="16" :stroke-width="1.8" /><span class="sidebar-nav-label truncate">{{ t(item.labelKey) }}</span></button></nav>
      <div class="my-3 border-t border-line"></div>
      <nav class="flex flex-col gap-px"><button v-for="item in systemNavItems" :key="item.id" class="relative flex h-11 w-full items-center border border-transparent text-left text-[13px] font-semibold uppercase tracking-[0.2em] transition-colors" :class="[collapsed ? 'justify-center px-0' : 'gap-2 px-3', navItemActive(item) ? 'ak-select' : 'text-muted ak-hover hover:text-fg']" :title="collapsed ? t(item.labelKey) : undefined" :aria-current="navItemActive(item) ? 'page' : undefined" @click="emit('navigate', item.id)"><component :is="item.icon" :size="16" :stroke-width="1.8" /><span class="sidebar-nav-label truncate">{{ t(item.labelKey) }}</span></button></nav>
    </div>
    <div class="mt-auto border-t border-line pt-3">
      <button class="relative flex h-11 w-full items-center border border-transparent text-left text-[13px] font-semibold uppercase tracking-[0.2em] transition-colors" :class="[collapsed ? 'justify-center px-0' : 'gap-2 px-3', activeView === 'settings' ? 'ak-select' : 'text-muted ak-hover hover:text-fg']" :title="collapsed ? t('nav.settings') : undefined" :aria-current="activeView === 'settings' ? 'page' : undefined" @click="emit('navigate', 'settings')"><Settings2 :size="16" :stroke-width="1.8" /><span class="sidebar-nav-label truncate">{{ t("nav.settings") }}</span></button>
      <button type="button" class="relative mt-1.5 flex h-11 w-full items-center border border-transparent text-left text-[13px] font-semibold uppercase tracking-[0.2em] transition-colors" :class="[collapsed ? 'justify-center px-0' : 'gap-2 px-3', activeView === 'sponsor' ? 'ak-select' : 'text-muted ak-hover hover:text-fg']" :title="collapsed ? t('nav.sponsor') : undefined" :aria-current="activeView === 'sponsor' ? 'page' : undefined" @click="emit('navigate', 'sponsor')"><HeartHandshake :size="16" :stroke-width="1.8" /><span class="sidebar-nav-label truncate">{{ t("nav.sponsor") }}</span></button>
      <button type="button" class="sidebar-collapse-btn relative mt-1 flex h-11 w-full items-center border border-transparent text-left text-[13px] font-semibold uppercase tracking-[0.2em] text-muted transition-colors hover:text-fg" :class="collapsed ? 'justify-center px-0' : 'gap-2 px-3'" :title="t(collapsed ? 'controls.expand' : 'controls.collapse')" @click="emit('toggle')"><ChevronRight v-if="collapsed" :size="16" :stroke-width="1.8" /><ChevronLeft v-else :size="16" :stroke-width="1.8" /><span class="sidebar-nav-label truncate">{{ t(collapsed ? 'controls.expand' : 'controls.collapse') }}</span></button>
    </div>
  </aside>
</template>

<style scoped>
.sidebar-shell {
  width: 248px;
  padding: 1.25rem;
  transition: width 360ms cubic-bezier(0.2, 0.8, 0.2, 1), padding 360ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.sidebar-shell.is-collapsed {
  width: 72px;
  padding-right: 0.75rem;
  padding-left: 0.75rem;
}

.sidebar-brand-copy,
.sidebar-nav-label {
  overflow: hidden;
  max-width: 180px;
  opacity: 1;
  transform: translateX(0);
  transition: max-width 300ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 180ms ease, transform 300ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.sidebar-nav-label {
  max-width: 160px;
}

.sidebar-logo {
  clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px));
}

/* 折叠态下隐藏选中块的重影偏移层，窄栏视觉更干净 */
.sidebar-shell.is-collapsed .ak-select::after {
  display: none;
}

/* 折叠按钮：展开态沿用切角悬停；折叠态改为居中小圆形悬停底 */
.sidebar-collapse-btn {
  isolation: isolate;
}

.sidebar-shell.is-collapsed .sidebar-collapse-btn::before {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 40px;
  height: 40px;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--fg) 7%, transparent);
  z-index: -1;
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.92);
  transition: opacity 180ms cubic-bezier(0.2, 0.8, 0.2, 1), transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.sidebar-shell.is-collapsed .sidebar-collapse-btn:hover::before {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1);
}

/* 键盘焦点态：accent 内描边环（不破坏选中块） */
.sidebar-shell button:focus-visible {
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--accent) 45%, transparent);
}

.sidebar-shell.is-collapsed .sidebar-brand-copy,
.sidebar-shell.is-collapsed .sidebar-nav-label {
  max-width: 0;
  opacity: 0;
  transform: translateX(-8px);
  pointer-events: none;
}

.sheet-enter-active,
.sheet-leave-active {
  transition: transform 300ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.sheet-enter-from,
.sheet-leave-to {
  transform: translateY(100%);
}

.drawer-enter-active,
.drawer-leave-active {
  transition: transform 300ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.drawer-enter-from,
.drawer-leave-to {
  transform: translateX(-100%);
}

/* 汉堡按钮：切角悬停 + 焦点环（与侧栏一致） */
.header-drawer-btn {
  clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px));
}

.header-drawer-btn:focus-visible {
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--accent) 45%, transparent);
}

.sheet-backdrop-enter-active,
.sheet-backdrop-leave-active {
  transition: opacity 220ms ease;
}

.sheet-backdrop-enter-from,
.sheet-backdrop-leave-to {
  opacity: 0;
}
</style>
