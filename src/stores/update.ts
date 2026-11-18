/**
 * Copyright 2026 Atemukesu
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { describeError, invoke } from "../api";

/** Update metadata returned by the Rust `check_update` command. */
export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  version: string | null;
  notes: string | null;
  date: string | null;
  /** Populated on Android only; the `.apk` download URL to open in a browser. */
  downloadUrl: string | null;
}

/** LocalStorage key holding the version the user chose to skip. */
const SKIP_KEY = "welkin-skip-version";

/** Read the skipped version, tolerating storage being unavailable. */
function readSkipped(): string | null {
  try {
    return localStorage.getItem(SKIP_KEY);
  } catch {
    return null;
  }
}

/**
 * In-app update state. On Android there is no in-app installer, so the caller
 * opens [`UpdateInfo.downloadUrl`] in the browser instead of installing.
 */
export const useUpdateStore = defineStore("update", () => {
  const checking = ref(false);
  const info = ref<UpdateInfo | null>(null);
  const error = ref<string | null>(null);
  /** True once at least one check has completed, so the UI can say "up to date". */
  const checked = ref(false);
  /** Whether the update modal is open. */
  const open = ref(false);
  /** Version the user chose to skip, silenced by automatic checks. */
  const skipped = ref<string | null>(readSkipped());

  const available = computed(() => info.value?.available === true);
  /** True when an update should be offered to the user (newer than any skip). */
  const shouldPrompt = computed(() => available.value && info.value?.version !== skipped.value);

  /** Ask the backend for an update; rethrows so the caller can surface details. */
  async function check(): Promise<UpdateInfo> {
    checking.value = true;
    error.value = null;
    try {
      info.value = await invoke<UpdateInfo>("check_update");
      checked.value = true;
      return info.value;
    } catch (failure) {
      error.value = describeError(failure);
      throw failure;
    } finally {
      checking.value = false;
    }
  }

  /** Open the update modal. */
  function show() {
    open.value = true;
  }

  /** Close the update modal. */
  function hide() {
    open.value = false;
  }

  /** "Remind me later": dismiss the modal, to be prompted again next launch. */
  function remindLater() {
    hide();
  }

  /** "Skip this version": silence the update until a newer one is released. */
  function skipVersion() {
    skipped.value = info.value?.version ?? null;
    try {
      if (skipped.value) localStorage.setItem(SKIP_KEY, skipped.value);
    } catch {
      // Storage may be unavailable; the in-memory skip still applies.
    }
    hide();
  }

  /** Clear a previous skip, e.g. when the user checks manually. */
  function clearSkip() {
    skipped.value = null;
    try {
      localStorage.removeItem(SKIP_KEY);
    } catch {
      // Ignore storage failures.
    }
  }

  return {
    checking,
    info,
    error,
    checked,
    open,
    skipped,
    available,
    shouldPrompt,
    check,
    show,
    hide,
    remindLater,
    skipVersion,
    clearSkip,
  };
});
