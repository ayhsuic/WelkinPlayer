/**
 * Copyright 2026 Atemukesu
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { onBeforeUnmount, onMounted, ref, type Ref } from "vue";

/**
 * Shared collapsible sticky-header behaviour, mirrored from the home page:
 * once the list scrolls past a short peek, the large title tucks into a pinned
 * top bar. Resolves the nearest vertically scrollable ancestor (including the
 * root element itself when it owns the scroll) and listens to its scroll.
 *
 * The resolved `scroller` is also exposed so page-level lists can attach their
 * own scroll observers to the same external container.
 */
const HEADER_PEEK_PX = 12;

export function useCollapsibleHeader(rootEl: Ref<HTMLElement | null>) {
  const collapsed = ref(false);
  const scroller = ref<HTMLElement | null>(null);
  let scrollerEl: HTMLElement | null = null;

  function syncCollapsed() {
    collapsed.value = (scrollerEl?.scrollTop ?? 0) > HEADER_PEEK_PX;
  }

  onMounted(() => {
    let el: HTMLElement | null = rootEl.value;
    while (el) {
      const overflowY = getComputedStyle(el).overflowY;
      if (overflowY === "auto" || overflowY === "scroll") {
        scrollerEl = el;
        break;
      }
      el = el.parentElement;
    }
    scroller.value = scrollerEl;
    scrollerEl?.addEventListener("scroll", syncCollapsed, { passive: true });
    syncCollapsed();
  });

  onBeforeUnmount(() => {
    scrollerEl?.removeEventListener("scroll", syncCollapsed);
    scrollerEl = null;
    scroller.value = null;
  });

  return { collapsed, scroller };
}
