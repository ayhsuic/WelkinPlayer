<script setup lang="ts">
import { computed, ref } from "vue";
import { CalendarDays, Disc3, Mic2, Music } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import { usePlayerStore } from "../stores/player";
import type { Track } from "../stores/player";
import { groupTracks, isUnknownGroup, type GroupKind } from "../lib/grouping";
import { sortGroups, useGroupSort } from "../lib/sort";
import GroupSortMenu from "../components/GroupSortMenu.vue";
import { useCollapsibleHeader } from "../composables/useCollapsibleHeader";

const props = withDefaults(defineProps<{ kind: GroupKind; loading?: boolean }>(), { loading: false });
const emit = defineEmits<{ open: [key: string] }>();
const { t } = useI18n();
const player = usePlayerStore();

const rootEl = ref<HTMLElement | null>(null);
const { collapsed } = useCollapsibleHeader(rootEl);
// Each grid page keeps its own persistent choice; the component remounts per kind.
const { key: sortKey, dir: sortDir } = useGroupSort(props.kind);

/** Copy and icon per classification kind. */
const kindMeta = computed(() => {
  switch (props.kind) {
    case "years": return { icon: CalendarDays, title: "library.collections.yearsTitle", count: "library.collections.yearCount", unknown: "library.collections.unknownYear" };
    case "genres": return { icon: Music, title: "library.collections.genresTitle", count: "library.collections.genreCount", unknown: "library.collections.unknownGenre" };
    case "albums": return { icon: Disc3, title: "library.collections.albumsTitle", count: "library.collections.albumCount", unknown: "library.collections.unknownAlbum" };
    default: return { icon: Mic2, title: "library.collections.artistsTitle", count: "library.collections.artistCount", unknown: "library.collections.unknownArtist" };
  }
});

const allGroups = computed(() => groupTracks(player.tracks, props.kind));
const total = computed(() => allGroups.value.length);

interface GroupCard {
  key: string;
  name: string;
  count: number;
  coverTrack?: Track;
  secondary: string;
}

const cards = computed<GroupCard[]>(() => {
  const list = allGroups.value.map((group) => {
    const name = isUnknownGroup(group.key) ? t(kindMeta.value.unknown) : group.key;
    const coverTrack = group.tracks.find((track) => track.cover) ?? group.tracks[0];
    const count = group.tracks.length;
    const label = t("library.collections.trackCount", { count });
    return { key: group.key, name, count, coverTrack, secondary: label };
  });
  return sortGroups(list, sortKey.value, sortDir.value);
});

/** Albums use a square-cover grid; artists and years use plain text rows. */
const isAlbumGrid = computed(() => props.kind === "albums");
</script>

<template>
  <div ref="rootEl" class="w-full">
    <div class="mx-auto w-full max-w-6xl px-6 pb-2 pt-6">
      <header
        class="sticky top-0 z-20 -mx-6 mb-4 mt-2 flex items-center justify-between gap-4 px-6 transition-[padding,background-color,border-color] duration-200"
        :class="collapsed ? 'border-b border-line bg-bg/95 py-2 backdrop-blur' : 'border-b border-transparent bg-transparent py-1'"
      >
        <div class="min-w-0">
          <h1
            class="truncate font-black tracking-tight transition-[font-size] duration-200"
            :class="collapsed ? 'text-base' : 'text-2xl'"
          >{{ t(kindMeta.title) }}</h1>
          <p v-if="!collapsed" class="mt-1 text-sm text-muted">{{ t(kindMeta.count, { count: total }) }}</p>
        </div>
        <GroupSortMenu :context="kind" />
      </header>

      <div v-if="player.tracks.length === 0" class="ak-frame mt-8 grid shrink-0 place-items-center gap-4 border border-dashed border-line bg-surface/50 px-6 py-20 text-center">
        <template v-if="loading"><span class="ak-pulse"></span><p class="text-sm font-semibold uppercase tracking-[0.2em] text-muted">{{ t("library.loading") }}</p></template>
        <template v-else><component :is="kindMeta.icon" :size="36" class="text-dim" /><p class="max-w-md text-sm text-muted">{{ t("library.collections.empty") }}</p></template>
      </div>
      <p v-else-if="cards.length === 0" class="py-10 text-center text-sm text-muted">{{ t("library.collections.empty") }}</p>

      <!-- Albums: square cover cards on a two/three column grid. -->
      <section v-else-if="isAlbumGrid" class="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3">
        <button v-for="card in cards" :key="card.key" type="button" class="group text-left" @click="emit('open', card.key)">
          <div class="relative aspect-square">
            <div class="ak-clip absolute inset-0 -translate-x-1.5 -translate-y-1.5 bg-accent-soft"></div>
            <div class="ak-clip-tr relative aspect-square overflow-hidden" :style="{ backgroundColor: card.coverTrack?.color ?? 'var(--accent)' }">
              <img v-if="card.coverTrack?.cover" :src="card.coverTrack.cover" alt="" loading="lazy" decoding="async" class="absolute inset-0 h-full w-full object-cover" />
              <span v-else class="absolute inset-0 grid place-items-center text-3xl font-black text-white/90">{{ card.name.charAt(0) }}</span>
            </div>
          </div>
          <p class="mt-2 truncate text-sm font-medium">{{ card.name }}</p>
        </button>
      </section>

      <!-- Artists / years: plain text rows with an index and a trailing count. -->
      <section v-else class="pt-1">
        <button v-for="(card, index) in cards" :key="card.key" type="button" class="flex w-full items-center gap-4 px-3 py-3 text-left transition-colors hover:bg-surface/60" @click="emit('open', card.key)">
          <span class="w-6 shrink-0 text-sm tabular-nums text-dim">{{ index + 1 }}</span>
          <span class="min-w-0 flex-1 truncate text-sm font-semibold">{{ card.name }}</span>
          <span class="shrink-0 text-xs text-muted">{{ card.secondary }}</span>
        </button>
      </section>
    </div>
  </div>
</template>
