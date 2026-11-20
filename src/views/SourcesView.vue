<!--
 Copyright 2026 Atemukesu
 SPDX-License-Identifier: GPL-3.0-only
-->

<script setup lang="ts">
import { computed } from "vue";
import { FolderOpen, FolderTree, HardDrive, Server, Settings2 } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import { usePlayerStore } from "../stores/player";
import { useSourcesStore } from "../stores/sources";
import { SOURCE_KINDS } from "../lib/sources";
import type { SongSource, SourceKind } from "../lib/sources";

/**
 * Source list for one kind. Folders and WebDAV are separate pages (and separate
 * sheet entries), so this view only ever shows the kind it was opened for.
 */
const props = defineProps<{ kind: SourceKind; loading: boolean }>();
const emit = defineEmits<{ open: [id: string]; manage: [] }>();
const { t } = useI18n();
const player = usePlayerStore();
const sources = useSourcesStore();

interface SourceRow {
  source: SongSource;
  count: number;
  isSync: boolean;
}

const rows = computed<SourceRow[]>(() =>
  sources.sources
    .filter((source) => source.kind === props.kind)
    .map((source) => ({
      source,
      count: player.tracks.filter((track) => track.sourceId === source.id).length,
      isSync: source.id === sources.syncId,
    })),
);

/** Page copy for the current kind, keeping both halves in one place. */
const copy = computed(() =>
  props.kind === "webdav"
    ? {
        title: t("sources.webdavTitle"),
        desc: t("sources.webdavDesc"),
        emptyTitle: t("sources.webdavEmptyTitle"),
        emptyDesc: t("sources.webdavEmptyDesc"),
      }
    : {
        title: t("sources.foldersTitle"),
        desc: t("sources.foldersDesc"),
        emptyTitle: t("sources.foldersEmptyTitle"),
        emptyDesc: t("sources.foldersEmptyDesc"),
      },
);

/** Localized label for a source kind, falling back to the raw kind. */
function kindLabel(kind: SourceKind): string {
  const key = SOURCE_KINDS.find((item) => item.kind === kind)?.labelKey;
  return key ? t(key) : kind;
}
</script>

<template>
  <div class="mx-auto w-full max-w-6xl px-6 py-6">
    <header class="mb-4 mt-2 flex items-end justify-between gap-4">
      <div class="min-w-0">
        <h1 class="truncate text-2xl font-black tracking-tight">{{ copy.title }}</h1>
        <p class="mt-1 text-sm text-muted">{{ copy.desc }}</p>
      </div>
      <button type="button" class="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-surface px-3 text-xs font-medium text-muted transition-colors hover:text-fg" @click="emit('manage')"><Settings2 :size="13" />{{ t("sources.manage") }}</button>
    </header>

    <p v-if="kind === 'local' && !sources.hasCloudSync && sources.hasSources" class="ak-frame mt-6 border border-accent/60 bg-accent/5 p-4 text-sm text-fg">{{ t("sources.localOnlyWarning") }}</p>

    <div v-if="rows.length === 0" class="ak-frame mt-8 grid place-items-center gap-4 border border-dashed border-line bg-surface/50 px-6 py-20 text-center">
      <Server v-if="kind === 'webdav'" :size="36" class="text-dim" />
      <FolderOpen v-else :size="36" class="text-dim" />
      <p class="text-base font-semibold">{{ copy.emptyTitle }}</p>
      <p class="max-w-md text-sm text-muted">{{ copy.emptyDesc }}</p>
      <button type="button" class="flex h-8 items-center gap-1.5 rounded-full bg-surface px-3 text-xs font-medium text-muted transition-colors hover:text-fg" @click="emit('manage')"><Settings2 :size="13" />{{ t("sources.manage") }}</button>
    </div>

    <div v-else class="mt-6 grid gap-4 sm:grid-cols-2">
      <button v-for="row in rows" :key="row.source.id" type="button" class="ak-frame group flex items-center gap-4 border border-line bg-surface p-5 text-left transition-colors hover:border-accent" @click="emit('open', row.source.id)">
        <span class="grid h-12 w-12 shrink-0 place-items-center bg-accent/10 text-accent"><Server v-if="row.source.kind === 'webdav'" :size="20" :stroke-width="2" /><HardDrive v-else :size="20" :stroke-width="2" /></span>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-semibold">{{ sources.label(row.source) }}</p>
          <p class="mt-1 text-xs text-muted">{{ kindLabel(row.source.kind) }} · {{ t("library.tracks", { count: row.count }) }}</p>
        </div>
        <span class="shrink-0 text-dim transition-colors group-hover:text-accent"><FolderTree :size="16" :stroke-width="2" /></span>
        <span v-if="row.isSync" class="shrink-0 border border-accent px-2 py-1 text-[10px] font-mono uppercase tracking-[0.2em] text-accent">{{ t("sources.syncBadge") }}</span>
      </button>
    </div>
  </div>
</template>
