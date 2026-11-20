<script setup lang="ts">
import { computed, ref } from "vue";
import { Heart, ListMusic, Pencil, Plus, Sparkles, TrendingUp } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import { useProfileStore } from "../stores/profile";
import { usePlayerStore } from "../stores/player";
import { RECENT_PLAYS_ID } from "../lib/app";
import { rankTracksByPlayCount } from "../lib/playRanking";
import type { View } from "../lib/app";
import PlaylistCover from "../components/PlaylistCover.vue";
import { useCollapsibleHeader } from "../composables/useCollapsibleHeader";

const emit = defineEmits<{ openPlaylist: [id: string]; editPlaylist: [id: string]; createPlaylist: []; navigate: [view: View] }>();
const { t } = useI18n();
const profile = useProfileStore();
const player = usePlayerStore();

const rootEl = ref<HTMLElement | null>(null);
const { collapsed } = useCollapsibleHeader(rootEl);

const playlists = computed(() => profile.playlists);

/** Favorites act as the default playlist; its card is pinned first in the grid. */
const favoriteCount = computed(() => profile.favorites.length);
/** The generated play-ranking playlist: library tracks ordered by play count. */
const rankedCount = computed(() => rankTracksByPlayCount(player.tracks, profile.profile.playCounts).length);
</script>

<template>
  <div ref="rootEl" class="h-full w-full overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+84px)]">
    <div class="mx-auto w-full max-w-6xl px-6 py-6">
      <header
        class="sticky top-0 z-20 -mx-6 mb-4 mt-2 flex items-center justify-between gap-4 px-6 transition-[padding,background-color,border-color] duration-200"
        :class="collapsed ? 'border-b border-line bg-bg/95 py-2 backdrop-blur' : 'border-b border-transparent bg-transparent py-1'"
      >
        <div class="min-w-0">
          <h1
            class="truncate font-black tracking-tight transition-[font-size] duration-200"
            :class="collapsed ? 'text-base' : 'text-2xl'"
          >{{ t("playlistsPage.title") }}</h1>
          <p v-if="!collapsed" class="mt-1 text-sm text-muted">{{ t("playlistsPage.total", { count: playlists.length }) }}</p>
        </div>
        <button type="button" class="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-surface px-3 text-xs font-medium text-muted transition-colors hover:text-fg" @click="emit('createPlaylist')"><Plus :size="13" :stroke-width="2.2" />{{ t("playlistsPage.create") }}</button>
      </header>

      <div v-if="profile.playlists.length === 0 && favoriteCount === 0 && rankedCount === 0" class="ak-frame mt-8 grid place-items-center gap-4 border border-dashed border-line bg-surface/50 px-6 py-20 text-center">
        <ListMusic :size="36" class="text-dim" />
        <p class="max-w-md text-sm text-muted">{{ t("playlistsPage.empty") }}</p>
        <button type="button" class="flex h-8 items-center gap-1.5 rounded-full bg-surface px-3 text-xs font-medium text-muted transition-colors hover:text-fg" @click="emit('createPlaylist')">{{ t("playlistsPage.create") }}</button>
      </div>
      <section v-else class="pt-1">
        <button type="button" class="flex w-full items-center gap-4 px-3 py-3 text-left transition-colors hover:bg-surface/60" :title="t('playlistsPage.open')" @click="emit('navigate', 'favorites')">
          <span class="grid h-11 w-11 shrink-0 place-items-center overflow-hidden bg-accent/15 text-accent"><Heart :size="18" :stroke-width="2" /></span>
          <span class="grid min-w-0 flex-1 gap-0.5">
            <strong class="truncate text-sm font-semibold">{{ t("nav.favorites") }}</strong>
            <small class="text-xs text-muted">{{ t("playlistsPage.count", { count: favoriteCount }) }}</small>
          </span>
        </button>
        <button type="button" class="flex w-full items-center gap-4 px-3 py-3 text-left transition-colors hover:bg-surface/60" :title="t('playlistsPage.open')" @click="emit('openPlaylist', RECENT_PLAYS_ID)">
          <span class="grid h-11 w-11 shrink-0 place-items-center overflow-hidden bg-accent/15 text-accent"><TrendingUp :size="18" :stroke-width="2" /></span>
          <span class="grid min-w-0 flex-1 gap-0.5">
            <strong class="truncate text-sm font-semibold">{{ t("playlistsPage.recentTitle") }}</strong>
            <small class="text-xs text-muted">{{ t("playlistsPage.count", { count: rankedCount }) }}</small>
          </span>
        </button>
        <div v-for="playlist in playlists" :key="playlist.id" class="flex w-full items-center gap-4 px-3 py-3 text-left transition-colors hover:bg-surface/60">
          <button type="button" class="flex min-w-0 flex-1 items-center gap-4 text-left" :title="t('playlistsPage.open')" @click="emit('openPlaylist', playlist.id)">
            <span class="grid h-11 w-11 shrink-0 place-items-center overflow-hidden"><PlaylistCover :playlist="playlist" class="h-full w-full text-lg" :icon-size="18" /></span>
            <span class="grid min-w-0 flex-1 gap-0.5">
              <strong class="flex min-w-0 items-center gap-1.5">
                <span class="truncate">{{ playlist.name }}</span>
                <span v-if="playlist.smartTransition?.status === 'ready'" class="flex shrink-0 items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-accent"><Sparkles :size="11" />{{ t("playlistsPage.smartBadge") }}</span>
                <span v-else-if="playlist.smartTransition?.status === 'stale'" class="shrink-0 border border-amber-500/50 px-1 text-[10px] font-mono uppercase text-amber-400">{{ t("playlistsPage.smartStale") }}</span>
              </strong>
              <small class="text-xs text-muted">{{ t("playlistsPage.count", { count: playlist.tracks.length }) }}</small>
            </span>
          </button>
          <button type="button" class="grid h-8 w-8 shrink-0 place-items-center text-dim transition-colors hover:text-fg" :title="t('playlistsPage.edit')" @click="emit('editPlaylist', playlist.id)"><Pencil :size="15" /></button>
        </div>
      </section>
    </div>
  </div>
</template>
