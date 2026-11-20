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
 */
const HEADER_PEEK_PX = 12;

export function useCollapsibleHeader(rootEl: Ref<HTMLElement | null>) {
  const collapsed = ref(false);
  let scroller: HTMLElement | null = null;

  function syncCollapsed() {
    collapsed.value = (scroller?.scrollTop ?? 0) > HEADER_PEEK_PX;
  }

  onMounted(() => {
    let el: HTMLElement | null = rootEl.value;
    while (el) {
      const overflowY = getComputedStyle(el).overflowY;
      if (overflowY === "auto" || overflowY === "scroll") {
        scroller = el;
        break;
      }
      el = el.parentElement;
    }
    scroller?.addEventListener("scroll", syncCollapsed, { passive: true });
    syncCollapsed();
  });

  onBeforeUnmount(() => {
    scroller?.removeEventListener("scroll", syncCollapsed);
    scroller = null;
  });

  return { collapsed };
}
