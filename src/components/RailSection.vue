<script setup lang="ts">
import { computed, type Component } from "vue";
import { useI18n } from "vue-i18n";
import type { Playlist } from "../lib/profile";
import PlaylistCover from "./PlaylistCover.vue";

/** A card rendered inside a reusable horizontal rail section. */
export interface RailSectionCard {
  key: string;
  title: string;
  subtitle?: string;
  /** Image URL for track / group covers. */
  cover?: string | null;
  /** Fallback solid colour when there is no image. */
  color?: string;
  /** Single glyph used as the no-cover placeholder. */
  initial?: string;
  /** When set, a user playlist renders through PlaylistCover. */
  playlist?: Playlist;
}

const props = withDefaults(defineProps<{
  titleKey: string;
  cards: RailSectionCard[];
  variant?: "large" | "small";
  actionLabelKey?: string;
  actionIcon?: Component;
  emptyTextKey?: string;
}>(), {
  variant: "small",
  actionLabelKey: undefined,
  actionIcon: undefined,
  emptyTextKey: undefined,
});

const emit = defineEmits<{
  open: [card: RailSectionCard];
  action: [];
}>();

const { t } = useI18n();
const isLarge = computed(() => props.variant === "large");
</script>

<template>
  <section v-if="cards.length" class="home-mt-section">
    <div class="home-mb-title home-mt-card flex items-center justify-between">
      <span class="home-section-title font-bold tracking-tight">{{ t(titleKey) }}</span>
      <button
        v-if="actionLabelKey"
        type="button"
        class="home-chip ak-clip flex items-center border border-line bg-surface font-medium text-muted transition-colors hover:text-fg"
        @click="emit('action')"
      >
        <component :is="actionIcon" v-if="actionIcon" :size="13" class="home-chip__icon" />{{ t(actionLabelKey) }}
      </button>
    </div>

    <div class="home-scroll-pad home-gap-x home-pb-rail no-scrollbar flex overflow-x-auto">
      <!-- Large recommend-style square card. -->
      <button
        v-if="isLarge"
        v-for="card in cards"
        :key="card.key"
        type="button"
        class="home-rec-card ak-clip-tr group relative aspect-square shrink-0 overflow-hidden text-left"
        :style="{ backgroundColor: card.color ?? 'var(--accent)' }"
        @click="emit('open', card)"
      >
        <PlaylistCover v-if="card.playlist" :playlist="card.playlist" class="absolute inset-0 h-full w-full" />
        <img v-else-if="card.cover" :src="card.cover" alt="" loading="lazy" decoding="async" class="absolute inset-0 h-full w-full object-cover" />
        <span v-else class="home-rec-initial absolute inset-0 grid place-items-center font-black text-white/90">{{ card.initial ?? card.title.charAt(0) }}</span>
        <div class="home-pad-cover absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent">
          <p class="home-rec-title truncate font-semibold text-white">{{ card.title }}</p>
          <p v-if="card.subtitle" class="home-rec-artist home-mt-caption truncate text-white/75">{{ card.subtitle }}</p>
        </div>
      </button>

      <!-- Small rail card: square cover on top, caption below. -->
      <button
        v-else
        v-for="card in cards"
        :key="card.key"
        type="button"
        class="home-rail-card rail-section__card flex shrink-0 cursor-pointer flex-col text-left"
        @click="emit('open', card)"
      >
        <div
          class="home-card-cover rail-section__cover ak-clip-tr relative aspect-square w-full overflow-hidden"
          :style="{ backgroundColor: card.color ?? 'var(--accent)' }"
        >
            <PlaylistCover v-if="card.playlist" :playlist="card.playlist" class="absolute inset-0 h-full w-full" />
            <img v-else-if="card.cover" :src="card.cover" alt="" loading="lazy" decoding="async" class="absolute inset-0 h-full w-full object-cover" />
            <span v-else class="home-card-initial absolute inset-0 grid place-items-center font-black text-white/90">{{ card.initial ?? card.title.charAt(0) }}</span>
          </div>
        <div class="home-mt-card w-full min-w-0">
          <p class="home-card-title truncate font-medium">{{ card.title }}</p>
          <p v-if="card.subtitle" class="home-card-artist truncate text-muted">{{ card.subtitle }}</p>
        </div>
      </button>
    </div>
  </section>

  <section v-else-if="emptyTextKey" class="home-mt-section">
    <p class="home-mb-title home-mt-card text-sm text-muted">{{ t(emptyTextKey) }}</p>
  </section>
</template>
