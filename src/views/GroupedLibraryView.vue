<script setup lang="ts">
import { computed } from "vue";
import { CalendarDays, Disc3, Mic2, Music } from "@lucide/vue";
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
  artist?: string;
}

const cards = computed<GroupCard[]>(() => {
  const list = allGroups.value.map((group) => {
    const name = isUnknownGroup(group.key) ? t(kindMeta.value.unknown) : group.key;
    const coverTrack = group.tracks.find((track) => track.cover) ?? group.tracks[0];
    const count = group.tracks.length;
    const label = t("library.collections.trackCount", { count });
    const artist = props.kind === "albums" ? coverTrack?.artist ?? undefined : undefined;
    return { key: group.key, name, count, coverTrack, secondary: label, artist };
  });
  return sortGroups(list, sortKey.value, sortDir.value);
});

/** Albums use a square-cover grid; artists and years use plain text rows. */
const isAlbumGrid = computed(() => props.kind === "albums");
</script>

<template>
  <div class="h-full w-full overflow-y-auto">
    <div class="mx-auto w-full max-w-6xl px-6 py-6">
      <header class="mb-4 mt-2 flex items-end justify-between gap-4">
        <div class="min-w-0">
          <h1 class="truncate text-2xl font-black tracking-tight">{{ t(kindMeta.title) }}</h1>
          <p class="mt-1 text-sm text-muted">{{ t(kindMeta.count, { count: total }) }}</p>
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
          <div class="ak-clip-tr relative aspect-square overflow-hidden" :style="{ backgroundColor: card.coverTrack?.color ?? 'var(--accent)' }">
            <img v-if="card.coverTrack?.cover" :src="card.coverTrack.cover" alt="" loading="lazy" decoding="async" class="absolute inset-0 h-full w-full object-cover" />
            <span v-else class="absolute inset-0 grid place-items-center text-3xl font-black text-white/90">{{ card.name.charAt(0) }}</span>
          </div>
          <p class="mt-2 truncate text-sm font-medium">{{ card.name }}</p>
          <p v-if="card.artist" class="truncate text-xs text-muted">{{ card.artist }}</p>
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
