// Copyright 2026 Atemukesu
// SPDX-License-Identifier: GPL-3.0-only

//! Floating lyrics layer for Android.
//!
//! The main window is the single source of truth; it ships a lyric snapshot,
//! a style document and a high-frequency playhead document here. The native
//! `WindowManager` overlay hosted by the foreground service (see `android.rs`)
//! feeds its WebView the exact same documents over JNI.

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::core::error::AppError;

/// Last documents pushed by the frontend, replayed once the overlay WebView has
/// actually loaded (events emitted before then would be lost).
#[derive(Default)]
pub struct DesktopLyricCache {
    pub load: Mutex<Option<DesktopLyricLoadPayload>>,
    pub settings: Mutex<Option<serde_json::Value>>,
    /// Whether the floating layer should currently be painted. Pushed by the main
    /// window (lyrics suppressed / enabled) so a Rust-driven tick keeps the layer
    /// hidden without depending on the main webview staying alive.
    pub visible: Mutex<bool>,
    /// Whether a floating layer is currently open. Gates the tick driver so it
    /// only emits while there is a renderer to receive it.
    pub active: Mutex<bool>,
}

/// Overlay markup, bundled so Android needs no asset-server plumbing.
const OVERLAY_HTML: &str = include_str!("../../../public/desktop-lyric-overlay.html");

/// Overlay renderer script; Android injects it directly because its bare WebView
/// cannot resolve the app asset path.
const OVERLAY_JS: &str = include_str!("../../../public/desktop-lyric-overlay.js");

/// Marker removed before handing the markup to the Android WebView.
const SCRIPT_TAG: &str = r#"<script src="/desktop-lyric-overlay.js"></script>"#;

/// One karaoke word.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopLyricWord {
    pub text: String,
    pub start: f64,
    pub end: f64,
}

/// One flattened lyric line.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopLyricLine {
    pub text: String,
    pub translation: String,
    pub roman: String,
    pub words: Vec<DesktopLyricWord>,
    #[serde(rename = "isBG")]
    pub is_bg: bool,
    pub is_duet: bool,
    /// Line timing (ms), mirrored from the parsed source so the Rust tick driver
    /// can pick the active line without a JS round-trip.
    pub start_time: f64,
    pub end_time: f64,
}

/// Full snapshot (track / lyrics / settings change).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopLyricLoadPayload {
    pub title: String,
    pub artist: String,
    pub lines: Vec<DesktopLyricLine>,
    pub settings: serde_json::Value,
}

/// Small playhead document pushed at ~30 Hz.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopLyricTickPayload {
    pub position_ms: f64,
    pub playing: bool,
    pub active_index: i64,
    pub active_indices: Vec<i64>,
    pub visible: bool,
}

/// Status returned to the settings UI.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopLyricStatus {
    pub supported: bool,
    pub permission_granted: bool,
    pub active: bool,
}

/// A flattened lyric line the active-line algorithm reasons about.
#[derive(Debug, Clone)]
struct ActiveLine {
    start_ms: f64,
    end_ms: f64,
    is_bg: bool,
}

/// Port of `lyric-kit::pickLatestStartedIndex`: the index of the last line whose
/// `start` is at or before `time`. Lines are sorted by `start`.
fn pick_latest_started(lines: &[ActiveLine], time: f64) -> i64 {
    if lines.is_empty() {
        return -1;
    }
    let mut low: i64 = 0;
    let mut high: i64 = (lines.len() - 1) as i64;
    let mut result: i64 = -1;
    while low <= high {
        let mid = low + ((high - low) / 2);
        if lines[mid as usize].start_ms <= time {
            result = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }
    result
}

/// Port of `lyric-kit::pickPrimaryIndex`, the single-line index a single-line
/// floating layer should show.
fn pick_primary_index(lines: &[ActiveLine], time: f64) -> i64 {
    if lines.is_empty() {
        return -1;
    }
    if time < lines[0].start_ms {
        return 0;
    }
    let active = pick_latest_started(lines, time);
    if active == -1 {
        return -1;
    }
    let active = active as usize;
    if lines[active].is_bg {
        for search in (0..active).rev() {
            if !lines[search].is_bg
                && time >= lines[search].start_ms
                && time < lines[search].end_ms
            {
                return search as i64;
            }
        }
    }
    if time >= lines[active].end_ms && active + 1 < lines.len() {
        return (active + 1) as i64;
    }
    active as i64
}

/// Port of `lyric-kit::findActiveLyricIndices`: every line whose window contains
/// the `time` (BG + duet lines that overlap the playhead).
fn find_active_indices(lines: &[ActiveLine], time: f64) -> Vec<i64> {
    let mut result = Vec::new();
    for (index, line) in lines.iter().enumerate() {
        if time >= line.start_ms && time < line.end_ms {
            result.push(index as i64);
        } else if line.start_ms > time {
            break;
        }
    }
    result
}

/// Sends one playhead tick to the Android overlay over JNI.
fn emit_tick(
    app: &AppHandle,
    position_ms: f64,
    playing: bool,
    active_index: i64,
    active_indices: Vec<i64>,
    visible: bool,
) {
    let _ = app;
    let payload = DesktopLyricTickPayload {
        position_ms,
        playing,
        active_index,
        active_indices,
        visible,
    };
    if let Ok(json) = serde_json::to_string(&payload) {
        let _ = crate::platform::android::desktop_lyric_update("tick", &json);
    }
}

/// Spawns the long-lived tick driver. It runs independent of the main webview:
/// every 80 ms it reads the cached lyric snapshot and the engine's authoritative
/// playhead and emits a tick, so the floating layer keeps advancing even after
/// the main webview is hidden, backgrounded, or destroyed.
pub fn start_ticker(app: AppHandle) {
    std::thread::Builder::new()
        .name("welkin-lyric-tick".to_string())
        .spawn(move || loop {
            std::thread::sleep(std::time::Duration::from_millis(80));
            let Some(cache) = app.try_state::<DesktopLyricCache>() else {
                continue;
            };
            // Only work while a floating layer is open; the flag is flipped by
            // `desktop_lyric_open` / `desktop_lyric_close`.
            let active = *cache.active.lock().unwrap_or_else(|e| e.into_inner());
            if !active {
                continue;
            }
            let (load, visible) = {
                let load = cache.load.lock().unwrap_or_else(|e| e.into_inner()).clone();
                let visible = *cache.visible.lock().unwrap_or_else(|e| e.into_inner());
                (load, visible)
            };
            let Some(load) = load else {
                continue;
            };
            // The authoritative playhead lives in the Rust playback engine, which
            // stays alive regardless of the webview's fate.
            let Some(engine) = app.try_state::<crate::playback::engine::Engine>() else {
                continue;
            };
            let shared = engine.shared();
            let position_ms = shared.position_ms();
            let playing = shared.is_playing();
            let lines: Vec<ActiveLine> = load
                .lines
                .iter()
                .map(|line| ActiveLine {
                    start_ms: line.start_time,
                    end_ms: line.end_time,
                    is_bg: line.is_bg,
                })
                .collect();
            let primary = pick_primary_index(&lines, position_ms);
            let indices = find_active_indices(&lines, position_ms);
            emit_tick(&app, position_ms, playing, primary, indices, visible);
        })
        .expect("failed to start lyric tick thread");
}

/// Current renderer status for this platform.
fn status(app: &AppHandle) -> DesktopLyricStatus {
    let _ = app;
    DesktopLyricStatus {
        supported: crate::platform::android::desktop_lyric_supported(),
        permission_granted: crate::platform::android::desktop_lyric_has_permission(),
        active: crate::platform::android::desktop_lyric_is_running(),
    }
}

/// Bring the floating renderer up (idempotent).
#[tauri::command]
pub async fn desktop_lyric_open(app: AppHandle) -> Result<DesktopLyricStatus, AppError> {
    if crate::platform::android::desktop_lyric_has_permission() {
        let html = OVERLAY_HTML.replace(SCRIPT_TAG, "");
        crate::platform::android::desktop_lyric_start(&html, OVERLAY_JS).map_err(|error| {
            log::warn!("failed to start lyric overlay: {error}");
            AppError::other(error)
        })?;
    } else {
        log::warn!("lyric overlay skipped: overlay permission not granted");
    }
    // The floating layer now exists; arm the Rust tick driver. The main webview's
    // fate no longer matters to the overlay once this is set.
    if let Some(cache) = app.try_state::<DesktopLyricCache>() {
        let mut active = cache.active.lock().unwrap_or_else(|e| e.into_inner());
        *active = true;
        // Optimistically show; the main webview pushes the authoritative value
        // (it can be suppressed) a moment later, and the tick keeps honouring it.
        drop(active);
        *cache.visible.lock().unwrap_or_else(|e| e.into_inner()) = true;
    }
    Ok(status(&app))
}

/// Tear the floating renderer down.
#[tauri::command]
pub fn desktop_lyric_close(app: AppHandle) -> Result<(), AppError> {
    let _ = &app;
    crate::platform::android::desktop_lyric_stop().map_err(AppError::other)?;
    // Disarm the tick driver so it stops emitting once the renderer is gone.
    if let Some(cache) = app.try_state::<DesktopLyricCache>() {
        *cache.active.lock().unwrap_or_else(|e| e.into_inner()) = false;
    }
    Ok(())
}

/// Push a full lyric snapshot to the renderer.
#[tauri::command]
pub fn desktop_lyric_load(
    app: AppHandle,
    payload: DesktopLyricLoadPayload,
) -> Result<(), AppError> {
    if let Ok(mut cached) = app.state::<DesktopLyricCache>().load.lock() {
        *cached = Some(payload.clone());
    }
    let json = serde_json::to_string(&payload)?;
    crate::platform::android::desktop_lyric_update("load", &json).map_err(AppError::other)?;
    Ok(())
}

/// Push the high-frequency playhead document to the renderer.
#[tauri::command]
pub fn desktop_lyric_tick(
    app: AppHandle,
    payload: DesktopLyricTickPayload,
) -> Result<(), AppError> {
    let _ = &app;
    let json = serde_json::to_string(&payload)?;
    crate::platform::android::desktop_lyric_update("tick", &json).map_err(AppError::other)?;
    Ok(())
}

/// Push a live style change to the renderer (without reloading the lyrics).
#[tauri::command]
pub fn desktop_lyric_set_settings(
    app: AppHandle,
    settings: serde_json::Value,
) -> Result<(), AppError> {
    if let Ok(mut cached) = app.state::<DesktopLyricCache>().settings.lock() {
        *cached = Some(settings.clone());
    }
    let json = serde_json::to_string(&settings)?;
    crate::platform::android::desktop_lyric_update("settings", &json)
        .map_err(AppError::other)?;
    Ok(())
}

/// Report the current renderer status.
#[tauri::command]
pub fn desktop_lyric_status(app: AppHandle) -> Result<DesktopLyricStatus, AppError> {
    Ok(status(&app))
}

/// Tell the Rust tick driver whether the floating layer should currently be
/// painted. The main webview pushes this; the tick keeps honouring it even if
/// the webview later dies.
#[tauri::command]
pub fn desktop_lyric_set_visible(app: AppHandle, visible: bool) -> Result<(), AppError> {
    if let Some(cache) = app.try_state::<DesktopLyricCache>() {
        *cache.visible.lock().unwrap_or_else(|e| e.into_inner()) = visible;
    }
    Ok(())
}

/// Drain a playback action requested from the overlay WebView. The overlay cannot
/// invoke commands, so it parks the action in the Kotlin bridge; the main window
/// polls this on a short interval.
#[tauri::command]
pub fn desktop_lyric_take_control() -> Result<Option<String>, AppError> {
    crate::platform::android::desktop_lyric_take_control().map_err(AppError::other)
}

/// Open the system "display over other apps" settings screen.
#[tauri::command]
pub fn desktop_lyric_request_permission() -> Result<(), AppError> {
    crate::platform::android::desktop_lyric_open_settings().map_err(AppError::other)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Build lines from `(start_ms, end_ms, is_bg)` tuples, sorted by start.
    fn lines(spec: &[(f64, f64, bool)]) -> Vec<ActiveLine> {
        spec.iter()
            .map(|(start, end, bg)| ActiveLine {
                start_ms: *start,
                end_ms: *end,
                is_bg: *bg,
            })
            .collect()
    }

    #[test]
    fn primary_picks_first_line_before_start() {
        let lines = lines(&[(1000.0, 2000.0, false), (2000.0, 3000.0, false)]);
        assert_eq!(pick_primary_index(&lines, 0.0), 0);
    }

    #[test]
    fn primary_advances_on_latest_started() {
        let lines = lines(&[(1000.0, 2000.0, false), (2000.0, 3000.0, false)]);
        assert_eq!(pick_primary_index(&lines, 1500.0), 0);
        assert_eq!(pick_primary_index(&lines, 2500.0), 1);
    }

    #[test]
    fn primary_skips_to_next_after_end() {
        let lines = lines(&[(1000.0, 2000.0, false), (3000.0, 4000.0, false)]);
        assert_eq!(pick_primary_index(&lines, 2500.0), 1);
    }

    #[test]
    fn primary_avoids_bg_in_window() {
        let lines = lines(&[(1000.0, 2000.0, true), (1200.0, 1800.0, false)]);
        assert_eq!(pick_primary_index(&lines, 1500.0), 1);
    }

    #[test]
    fn active_indices_overlap() {
        let lines = lines(&[
            (1000.0, 2000.0, false),
            (1500.0, 2500.0, false),
            (3000.0, 4000.0, false),
        ]);
        assert_eq!(find_active_indices(&lines, 1700.0), vec![0, 1]);
        assert_eq!(find_active_indices(&lines, 3500.0), vec![2]);
        assert!(find_active_indices(&lines, 500.0).is_empty());
    }

    #[test]
    fn empty_lines_yield_negative() {
        assert_eq!(pick_primary_index(&[], 1000.0), -1);
        assert!(find_active_indices(&[], 1000.0).is_empty());
    }
}
