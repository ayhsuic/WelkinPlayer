<!--
 Copyright 2026 Atemukesu
 SPDX-License-Identifier: GPL-3.0-only
-->

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { CircleCheck, HardDrive, HardDriveDownload, Mic2, Moon, Music2, Play, SlidersHorizontal, Sun } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import { invoke } from "../api";
import { formatBytes } from "../lib/format";
import { pushToast } from "../lib/toast";
import { accents } from "../lib/app";
import type { Accent, Theme } from "../lib/app";
import { localeOptions } from "../i18n";
import { useProfileStore } from "../stores/profile";
import { useSourcesStore } from "../stores/sources";
import { useCacheStore } from "../stores/cache";
import LyricsSettings from "../components/LyricsSettings.vue";
import pkg from "../../package.json";

const theme = defineModel<Theme>("theme", { required: true });
const accent = defineModel<Accent>("accent", { required: true });
const emit = defineEmits<{ sources: []; downloading: []; downloaded: []; friendlyError: [error: unknown] }>();
const { t, locale } = useI18n();
/** Public release codename (e.g. Lyra); shown in the About row instead of the numeric version. */
const appCodename = pkg.codename ?? pkg.version;
/** Settings categories. Only the active panel is shown, so the page stays
 * short on phones instead of stacking every card at once. */
const tabItems = [
  { key: "general", labelKey: "settings.tabs.general", icon: SlidersHorizontal },
  { key: "playback", labelKey: "settings.tabs.playback", icon: Play },
  { key: "lyrics", labelKey: "settings.tabs.lyrics", icon: Mic2 },
] as const;
type SettingsTab = (typeof tabItems)[number]["key"];
const TAB_STORAGE_KEY = "welkin.settings.tab";
/** Restore the last used category so a trip to the source manager and back
 * does not dump the user at the top of the settings page. */
function readInitialTab(): SettingsTab {
  try {
    const saved = localStorage.getItem(TAB_STORAGE_KEY);
    if (tabItems.some((item) => item.key === saved)) return saved as SettingsTab;
  } catch { /* storage may be unavailable */ }
  return "general";
}
const activeTab = ref<SettingsTab>(readInitialTab());
watch(activeTab, (tab) => {
  try { localStorage.setItem(TAB_STORAGE_KEY, tab); } catch { /* ignore */ }
});
function selectTab(tab: SettingsTab) { activeTab.value = tab; }
/** Roving-tabindex keyboard support for the category bar. */
function onTabKeydown(event: KeyboardEvent, index: number) {
  const last = tabItems.length - 1;
  let next = index;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") next = index === last ? 0 : index + 1;
  else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = index === 0 ? last : index - 1;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = last;
  else return;
  event.preventDefault();
  const tab = tabItems[next];
  activeTab.value = tab.key;
  requestAnimationFrame(() => document.getElementById(`settings-tab-${tab.key}`)?.focus());
}
const profile = useProfileStore();
const sources = useSourcesStore();
const cache = useCacheStore();
const cacheDir = ref("");
const streamEnabled = ref(true);
const prefetchSeconds = ref(120);
const maxConcurrentDownloads = ref(3);
const streamBytes = ref(0);
const streamLimitBytes = ref(256 * 1024 * 1024);
/** Manually pinned (user-cached) tracks. */
const cachePinned = ref(0);
const clearingCache = ref(false);
const streamPercent = computed(() => (streamLimitBytes.value > 0 ? Math.min(100, (streamBytes.value / streamLimitBytes.value) * 100) : 0));
let usageTimer = 0;
async function refreshUsage() {
  try {
    const usage = await invoke<{ streamBytes: number; streamLimitBytes: number; pinnedBytes: number }>("cache_usage");
    streamBytes.value = usage.streamBytes;
    streamLimitBytes.value = usage.streamLimitBytes;
    cachePinned.value = usage.pinnedBytes;
  } catch { /* ignore */ }
}
async function saveCacheDir() { try { cacheDir.value = await invoke<string>("set_cache_dir", { dir: cacheDir.value }); pushToast("success", t("settings.cache.saved")); } catch (error) { emit("friendlyError", error); } }
/** Persist the read-ahead pre-buffer window; the backend clamps it to 30-200s. */
async function savePrefetchSeconds() { try { prefetchSeconds.value = await invoke<number>("set_prefetch_seconds", { seconds: prefetchSeconds.value }); pushToast("success", t("settings.cache.prefetchSaved")); } catch (error) { emit("friendlyError", error); } }
/** Persist how many manual-cache downloads may run at once; extra tracks queue. */
async function saveMaxConcurrentDownloads() { try { maxConcurrentDownloads.value = await invoke<number>("set_max_concurrent_downloads", { maxConcurrentDownloads: maxConcurrentDownloads.value }); pushToast("success", t("settings.cache.concurrentSaved")); } catch (error) { emit("friendlyError", error); } }
/** Persist the read-ahead buffer toggle; revert the switch on failure. */
async function toggleStreamEnabled() {
  const next = !streamEnabled.value;
  streamEnabled.value = next;
  try {
    streamEnabled.value = await invoke<boolean>("set_stream_cache_enabled", { enabled: next });
  } catch (error) {
    streamEnabled.value = !next;
    emit("friendlyError", error);
  }
}
/** Clear the read-ahead buffer; manually pinned tracks are kept. */
async function clearCache() {
  clearingCache.value = true;
  try {
    await invoke("clear_cache");
    pushToast("success", t("settings.cache.cleared"));
    void cache.refresh();
    void refreshUsage();
  } catch (error) {
    emit("friendlyError", error);
  } finally {
    clearingCache.value = false;
  }
}
onMounted(() => {
  void invoke<string>("get_cache_dir").then((dir) => (cacheDir.value = dir)).catch(() => {});
  void invoke<{ streamEnabled: boolean; prefetchSeconds: number; maxConcurrentDownloads: number }>("get_cache_config")
    .then((config) => {
      streamEnabled.value = config.streamEnabled;
      prefetchSeconds.value = config.prefetchSeconds;
      maxConcurrentDownloads.value = config.maxConcurrentDownloads;
    })
    .catch(() => {});
  void refreshUsage();
  usageTimer = window.setInterval(() => void refreshUsage(), 3000);
});
onUnmounted(() => { window.clearInterval(usageTimer); });
</script>

<style scoped>
button {
  transition-property: color, background-color, border-color, transform, opacity;
  transition-duration: 240ms;
  transition-timing-function: cubic-bezier(0.2, 0.8, 0.2, 1);
}

button.ak-clip-tr:not(.bg-accent):hover:not(:disabled) {
  background-color: var(--accent);
  color: var(--accent-fg);
}

button.ak-clip-tr.bg-accent:hover:not(:disabled) {
  transform: scale(1.02);
}

button.ak-clip-tr.bg-accent:active:not(:disabled) {
  transform: scale(0.95);
}

button.text-dim:hover:not(:disabled) {
  color: var(--fg);
}
</style>

<template>
  <div class="mx-auto w-full max-w-4xl p-6 lg:p-8">
    <header class="pb-4">
      <p class="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.35em] text-accent"><span class="h-2 w-2 bg-accent"></span>{{ t("settings.eyebrow") }}</p>
      <h1 class="mt-4 text-4xl font-black uppercase leading-none tracking-tight sm:text-5xl">{{ t("settings.title") }}</h1>
    </header>

    <nav class="sticky top-0 z-20 -mx-6 border-b border-line bg-bg/95 px-6 py-2 backdrop-blur lg:-mx-8 lg:px-8" role="tablist" :aria-label="t('settings.tabs.label')">
      <div class="grid grid-cols-3 gap-1">
        <button
          v-for="(item, index) in tabItems"
          :id="`settings-tab-${item.key}`"
          :key="item.key"
          type="button"
          role="tab"
          class="relative flex h-11 min-w-0 items-center justify-center gap-1.5 border border-transparent px-1 text-[11px] font-bold uppercase tracking-[0.1em] sm:gap-2 sm:px-3 sm:text-[13px] sm:tracking-[0.18em]"
          :class="activeTab === item.key ? 'ak-select' : 'border-line text-muted hover:bg-fg/5 hover:text-fg'"
          :aria-selected="activeTab === item.key"
          :aria-controls="`settings-panel-${item.key}`"
          :tabindex="activeTab === item.key ? 0 : -1"
          @click="selectTab(item.key)"
          @keydown="onTabKeydown($event, index)"
        >
          <component :is="item.icon" class="hidden shrink-0 sm:block" :size="15" :stroke-width="2" />
          <span class="truncate">{{ t(item.labelKey) }}</span>
        </button>
      </div>
    </nav>

    <div class="mt-6">
      <div v-show="activeTab === 'general'" id="settings-panel-general" role="tabpanel" aria-labelledby="settings-tab-general" class="space-y-6">
        <section class="ak-frame grid gap-6 border border-line bg-surface p-6 lg:grid-cols-[1fr_1.3fr]">
          <div><h2 class="text-sm font-bold uppercase tracking-[0.2em]">{{ t("settings.profile.title") }}</h2><p class="mt-2 text-sm text-muted">{{ t("settings.profile.desc") }}</p></div>
          <div class="grid gap-4">
            <label class="grid gap-2 text-[13px] font-semibold uppercase tracking-[0.2em] text-dim">{{ t("settings.profile.nickname") }}<input v-model="profile.profile.nickname" maxlength="32" class="h-10 border border-line bg-bg px-3 text-sm font-normal normal-case tracking-normal text-fg outline-none focus:border-accent" :placeholder="t('settings.profile.nicknamePlaceholder')" @change="profile.setNickname(profile.profile.nickname)" /></label>
            <p class="flex items-center gap-2 text-[11px] normal-case text-dim"><span class="h-2 w-2" :class="sources.hasCloudSync ? 'bg-accent' : 'bg-dim'"></span>{{ sources.hasCloudSync ? t("settings.profile.synced") : t("settings.profile.localOnly") }}</p>
          </div>
        </section>

        <section class="ak-frame grid gap-6 border border-line bg-surface p-6 lg:grid-cols-[1fr_1.3fr]">
          <div><h2 class="text-sm font-bold uppercase tracking-[0.2em]">{{ t("settings.appearance.title") }}</h2><p class="mt-2 text-sm text-muted">{{ t("settings.appearance.desc") }}</p></div>
          <div class="grid gap-5">
            <div class="flex items-center justify-between gap-4">
              <span class="text-[13px] font-semibold uppercase tracking-[0.2em] text-dim">{{ t("theme.label") }}</span>
              <div class="inline-flex border border-line"><button type="button" class="flex h-9 items-center gap-2 px-3 text-[13px] font-semibold uppercase tracking-[0.2em]" :class="theme === 'light' ? 'bg-accent text-accent-fg' : 'text-muted hover:text-fg'" @click="theme = 'light'"><Sun :size="14" />{{ t("theme.light") }}</button><button type="button" class="flex h-9 items-center gap-2 border-l border-line px-3 text-[13px] font-semibold uppercase tracking-[0.2em]" :class="theme === 'dark' ? 'bg-accent text-accent-fg' : 'text-muted hover:text-fg'" @click="theme = 'dark'"><Moon :size="14" />{{ t("theme.dark") }}</button></div>
            </div>
            <div class="flex items-center justify-between gap-4">
              <span class="text-[13px] font-semibold uppercase tracking-[0.2em] text-dim">{{ t("accent.label") }}</span>
              <div class="flex items-center gap-2"><button v-for="item in accents" :key="item.id" type="button" class="h-5 w-5 border-2 transition-transform hover:scale-110" :style="{ backgroundColor: item.swatch, borderColor: accent === item.id ? 'var(--fg)' : 'transparent' }" :title="t(item.key)" @click="accent = item.id"></button></div>
            </div>
            <div class="flex items-center justify-between gap-4">
              <span class="text-[13px] font-semibold uppercase tracking-[0.2em] text-dim">{{ t("language.label") }}</span>
              <div class="inline-flex border border-line"><button v-for="(item, index) in localeOptions" :key="item.id" type="button" class="h-9 px-4 text-[13px] font-semibold uppercase tracking-[0.2em]" :class="[index ? 'border-l border-line' : '', locale === item.id ? 'bg-accent text-accent-fg' : 'text-muted hover:text-fg']" @click="locale = item.id">{{ t(item.labelKey) }}</button></div>
            </div>
          </div>
        </section>

        <section class="ak-frame grid gap-6 border border-line bg-surface p-6 lg:grid-cols-[1fr_1.3fr]">
          <div><h2 class="text-sm font-bold uppercase tracking-[0.2em]">{{ t("settings.sources.title") }}</h2><p class="mt-2 text-sm text-muted">{{ t("settings.sources.desc") }}</p></div>
          <div class="grid gap-4">
            <p class="text-sm text-muted">{{ t("settings.sources.count", { count: sources.sources.length }) }}</p>
            <p class="flex items-center gap-2 text-[11px] text-dim"><span class="h-2 w-2" :class="sources.hasCloudSync ? 'bg-accent' : 'bg-dim'"></span>{{ sources.hasCloudSync ? t("settings.sources.cloudAvailable") : t("settings.sources.cloudUnavailable") }}</p>
            <div class="flex justify-end"><button type="button" class="ak-clip-tr flex h-10 items-center gap-2 bg-accent px-5 text-[13px] font-bold uppercase tracking-[0.25em] text-accent-fg" @click="emit('sources')"><HardDrive :size="15" />{{ t("settings.sources.manage") }}</button></div>
          </div>
        </section>

        <section class="ak-frame grid gap-6 border border-line bg-surface p-6 lg:grid-cols-[1fr_1.3fr]">
          <div><h2 class="text-sm font-bold uppercase tracking-[0.2em]">{{ t("settings.downloads.title") }}</h2><p class="mt-2 text-sm text-muted">{{ t("settings.downloads.desc") }}</p></div>
          <div class="grid gap-3 sm:grid-cols-2">
            <button type="button" class="flex flex-col items-start gap-2 border border-line bg-bg p-4 text-left transition-colors hover:border-accent" @click="emit('downloading')">
              <HardDriveDownload :size="18" class="text-accent" />
              <span class="text-[13px] font-semibold">{{ t("settings.downloads.downloading") }}</span>
            </button>
            <button type="button" class="flex flex-col items-start gap-2 border border-line bg-bg p-4 text-left transition-colors hover:border-accent" @click="emit('downloaded')">
              <CircleCheck :size="18" class="text-accent" />
              <span class="text-[13px] font-semibold">{{ t("settings.downloads.downloaded") }}</span>
            </button>
          </div>
        </section>

        <section class="ak-frame relative border border-line bg-surface">
          <div class="relative grid gap-6 p-8">
            <div class="grid gap-6">
              <div class="flex items-center gap-5"><span class="grid h-24 w-24 shrink-0 place-items-center bg-accent text-accent-fg"><Music2 :size="42" :stroke-width="2" /></span><div class="min-w-0"><h2 class="text-3xl font-black uppercase leading-none tracking-tight sm:text-4xl">{{ t("settings.about.title") }}</h2><p class="mt-3 max-w-lg text-sm leading-[1.7] text-muted">{{ t("settings.about.tagline") }}</p></div></div>
              <div class="grid gap-1 text-sm leading-relaxed">
                <p class="flex flex-wrap items-baseline gap-1.5"><span class="font-semibold uppercase tracking-[0.2em] text-dim">{{ t("settings.about.version") }}</span><span class="text-dim">{{ locale === "zh-CN" ? "：" : ":" }}</span><span class="font-semibold">{{ appCodename }}</span></p>
                <p class="flex flex-wrap items-baseline gap-1.5"><span class="font-semibold uppercase tracking-[0.2em] text-dim">{{ t("settings.about.author") }}</span><span class="text-dim">{{ locale === "zh-CN" ? "：" : ":" }}</span><span class="font-semibold">{{ t("settings.about.authorName") }}</span></p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div v-show="activeTab === 'playback'" id="settings-panel-playback" role="tabpanel" aria-labelledby="settings-tab-playback" class="space-y-6">
        <section class="ak-frame grid gap-6 border border-line bg-surface p-6 lg:grid-cols-[1fr_1.3fr]">
          <div><h2 class="text-sm font-bold uppercase tracking-[0.2em]">{{ t("settings.cache.title") }}</h2><p class="mt-2 text-sm text-muted">{{ t("settings.cache.desc") }}</p></div>
          <div class="grid gap-5">
            <label class="grid gap-2 text-[13px] font-semibold uppercase tracking-[0.2em] text-dim">{{ t("settings.cache.dir") }}<input v-model="cacheDir" class="h-10 border border-line bg-bg px-3 text-sm font-normal normal-case tracking-normal text-fg outline-none focus:border-accent" /></label>
            <div class="flex justify-end"><button type="button" class="ak-clip-tr h-10 border border-line px-5 text-[13px] font-semibold uppercase tracking-[0.25em]" @click="saveCacheDir">{{ t("settings.cache.save") }}</button></div>

            <div class="grid gap-4 border border-line bg-bg p-4">
              <label class="flex items-start justify-between gap-4">
                <span class="grid gap-1 text-[13px] font-semibold uppercase tracking-[0.2em] text-dim">{{ t("settings.cache.streamTitle") }}<span class="text-[11px] font-normal normal-case tracking-normal text-dim">{{ t("settings.cache.streamDesc") }}</span></span>
                <input :checked="streamEnabled" class="ak-switch shrink-0" type="checkbox" :aria-label="t('settings.cache.streamEnabled')" @change="toggleStreamEnabled" />
              </label>
              <div class="grid gap-2">
                <div class="flex items-baseline justify-between text-[11px] font-semibold uppercase tracking-[0.2em] text-dim"><span>{{ t("settings.cache.streamUsed") }}</span><span class="tabular-nums">{{ formatBytes(streamBytes) }} / {{ formatBytes(streamLimitBytes) }}</span></div>
                <span class="block h-2 w-full overflow-hidden bg-fg/10"><span class="block h-full bg-accent transition-[width]" :style="{ width: `${streamPercent}%` }"></span></span>
              </div>
              <label class="grid gap-2 text-[13px] font-semibold uppercase tracking-[0.2em] text-dim">{{ t("settings.cache.prefetch") }}<input v-model.number="prefetchSeconds" type="number" min="30" max="200" step="10" class="h-10 border border-line bg-bg px-3 text-sm font-normal normal-case tracking-normal text-fg outline-none focus:border-accent" /><span class="text-[11px] font-normal normal-case tracking-normal text-dim">{{ t("settings.cache.prefetchDesc") }}</span></label>
              <div class="flex justify-end"><button type="button" class="ak-clip-tr h-10 border border-line px-5 text-[13px] font-semibold uppercase tracking-[0.25em]" @click="savePrefetchSeconds">{{ t("settings.cache.prefetchSave") }}</button></div>
              <label class="grid gap-2 text-[13px] font-semibold uppercase tracking-[0.2em] text-dim">{{ t("settings.cache.concurrent") }}<input v-model.number="maxConcurrentDownloads" type="number" min="1" max="8" step="1" class="h-10 border border-line bg-bg px-3 text-sm font-normal normal-case tracking-normal text-fg outline-none focus:border-accent" /><span class="text-[11px] font-normal normal-case tracking-normal text-dim">{{ t("settings.cache.concurrentDesc") }}</span></label>
              <div class="flex justify-end"><button type="button" class="ak-clip-tr h-10 border border-line px-5 text-[13px] font-semibold uppercase tracking-[0.25em]" @click="saveMaxConcurrentDownloads">{{ t("settings.cache.concurrentSave") }}</button></div>
            </div>

            <div class="flex items-baseline justify-between text-[11px] font-semibold uppercase tracking-[0.2em] text-dim"><span>{{ t("settings.cache.pinned") }}</span><span class="tabular-nums">{{ formatBytes(cachePinned) }}</span></div>

            <p class="text-[11px] leading-relaxed text-dim">{{ t("settings.cache.clearHint") }}</p>
            <div class="flex justify-end">
              <button type="button" class="ak-clip-tr h-10 border border-rose-500/60 px-5 text-[13px] font-semibold uppercase tracking-[0.25em] text-rose-500 disabled:opacity-60" :disabled="clearingCache" @click="clearCache">{{ t(clearingCache ? "settings.cache.clearing" : "settings.cache.clear") }}</button>
            </div>
          </div>
        </section>

      </div>

      <div v-show="activeTab === 'lyrics'" id="settings-panel-lyrics" role="tabpanel" aria-labelledby="settings-tab-lyrics" class="space-y-6">
        <LyricsSettings />
      </div>
    </div>
  </div>
</template>
