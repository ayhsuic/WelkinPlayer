<script setup lang="ts">
import { computed, ref } from "vue";
import { CalendarDays, ChevronRight, Disc3, Mic2, Music, Search } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import { usePlayerStore } from "../stores/player";
import type { Track } from "../stores/player";
import { groupTracks, isUnknownGroup, type GroupKind } from "../lib/grouping";
import { sortGroups, useGroupSort } from "../lib/sort";
import GroupSortMenu from "../components/GroupSortMenu.vue";

const props = withDefaults(defineProps<{ kind: GroupKind; loading?: boolean }>(), { loading: false });
const emit = defineEmits<{ open: [key: string] }>();
const { t } = useI18n();
const player = usePlayerStore();
const query = ref("");
// Each grid page keeps its own persistent choice; the component remounts per kind.
const { key: sortKey, dir: sortDir } = useGroupSort(props.kind);

/** Copy and icon per classification kind. */
const kindMeta = computed(() => {
  switch (props.kind) {
    case "years": return { icon: CalendarDays, eyebrow: "library.collections.yearsEyebrow", title: "library.collections.yearsTitle", subtitle: "library.collections.yearsSubtitle", search: "library.collections.searchYear", count: "library.collections.yearCount", unknown: "library.collections.unknownYear" };
    case "genres": return { icon: Music, eyebrow: "library.collections.genresEyebrow", title: "library.collections.genresTitle", subtitle: "library.collections.genresSubtitle", search: "library.collections.searchGenre", count: "library.collections.genreCount", unknown: "library.collections.unknownGenre" };
    case "albums": return { icon: Disc3, eyebrow: "library.collections.albumsEyebrow", title: "library.collections.albumsTitle", subtitle: "library.collections.albumsSubtitle", search: "library.collections.searchAlbum", count: "library.collections.albumCount", unknown: "library.collections.unknownAlbum" };
    default: return { icon: Mic2, eyebrow: "library.collections.artistsEyebrow", title: "library.collections.artistsTitle", subtitle: "library.collections.artistsSubtitle", search: "library.collections.searchArtist", count: "library.collections.artistCount", unknown: "library.collections.unknownArtist" };
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
  const value = query.value.trim().toLocaleLowerCase();
  const list = allGroups.value.map((group) => {
    const name = isUnknownGroup(group.key) ? t(kindMeta.value.unknown) : group.key;
    const coverTrack = group.tracks.find((track) => track.cover) ?? group.tracks[0];
    const count = group.tracks.length;
    const label = t("library.collections.trackCount", { count });
    const secondary = props.kind === "albums" && coverTrack?.artist ? `${coverTrack.artist} · ${label}` : label;
    return { key: group.key, name, count, coverTrack, secondary };
  });
  const filtered = value ? list.filter((card) => card.name.toLocaleLowerCase().includes(value)) : list;
  return sortGroups(filtered, sortKey.value, sortDir.value);
});
</script>

<template>
  <div class="h-full w-full overflow-y-auto">
    <div class="mx-auto flex w-full max-w-6xl flex-col px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <header class="shrink-0 border-b border-line pb-6">
        <p class="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.35em] text-accent"><span class="h-2 w-2 bg-accent"></span>{{ t(kindMeta.eyebrow) }}</p>
        <h1 class="mt-4 truncate text-4xl font-black leading-none tracking-tight sm:text-5xl">{{ t(kindMeta.title) }}</h1>
        <p class="mt-3 text-sm text-muted">{{ t(kindMeta.subtitle) }}</p>
        <div class="mt-5 flex flex-wrap items-center gap-3">
          <label class="flex h-10 min-w-0 flex-1 items-center gap-2 border border-line bg-surface px-3 sm:w-64 sm:flex-none"><Search :size="16" class="text-dim" /><input v-model="query" class="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-dim" :placeholder="t(kindMeta.search)" /></label>
          <GroupSortMenu :context="kind" />
          <span class="font-mono text-sm uppercase tracking-[0.2em] text-dim">{{ t(kindMeta.count, { count: total }) }}</span>
        </div>
      </header>

      <div v-if="player.tracks.length === 0" class="ak-frame mt-8 grid shrink-0 place-items-center gap-4 border border-dashed border-line bg-surface/50 px-6 py-20 text-center">
        <template v-if="loading"><span class="ak-pulse"></span><p class="text-sm font-semibold uppercase tracking-[0.2em] text-muted">{{ t("library.loading") }}</p></template>
        <template v-else><component :is="kindMeta.icon" :size="36" class="text-dim" /><p class="max-w-md text-sm text-muted">{{ t("library.collections.empty") }}</p></template>
      </div>
      <p v-else-if="cards.length === 0" class="py-10 text-center text-sm text-muted">{{ t("library.collections.empty") }}</p>

      <section v-else class="pt-4">
        <button v-for="card in cards" :key="card.key" type="button" class="flex w-full items-center gap-4 border-t border-line px-3 py-2 text-left transition-colors hover:bg-surface/60" @click="emit('open', card.key)">
          <span class="grid h-11 w-11 shrink-0 place-items-center overflow-hidden text-lg font-black text-white/90" :style="{ backgroundColor: card.coverTrack?.color ?? 'var(--accent)' }">
            <img v-if="card.coverTrack?.cover" :src="card.coverTrack.cover" alt="" loading="lazy" decoding="async" class="h-full w-full object-cover" />
            <template v-else>{{ card.name.charAt(0) }}</template>
          </span>
          <span class="grid min-w-0 flex-1 gap-0.5">
            <strong class="truncate text-sm font-semibold tracking-wide">{{ card.name }}</strong>
            <small class="truncate text-xs text-muted">{{ card.secondary }}</small>
          </span>
          <ChevronRight :size="16" class="shrink-0 text-dim" />
        </button>
      </section>
    </div>
  </div>
</template>
