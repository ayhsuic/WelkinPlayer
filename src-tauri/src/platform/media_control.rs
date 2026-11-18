// Copyright 2026 Atemukesu
// SPDX-License-Identifier: GPL-3.0-only

//! System media controls for Android.
//!
//! The frontend is the single source of truth for playback; this module mirrors
//! its snapshots onto the native `MediaSession` hosted by the foreground service
//! (notification / lock-screen controls) and forwards transport commands back
//! through the native bridge (see `android.rs`).

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::core::error::AppError;

/// One metadata + playback snapshot pushed by the frontend.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaControlPayload {
    pub title: String,
    #[serde(default)]
    pub artist: String,
    #[serde(default)]
    pub album: String,
    #[serde(default)]
    pub duration_ms: f64,
    #[serde(default)]
    pub position_ms: f64,
    #[serde(default)]
    pub playing: bool,
    #[serde(default)]
    pub volume: f64,
    /// Hex cache id of the cover thumbnail, used to serve artwork.
    #[serde(default)]
    pub cover_hash: Option<String>,
}

/// Managed state placeholder. Android owns its session in the native bridge, so
/// there is no handle to keep here; the empty state only satisfies the command
/// handlers' `State<MediaControlState>` parameter.
#[derive(Default)]
pub struct MediaControlState {}

/// Push a snapshot to the OS transport UI (wired to `media_control_update`).
#[tauri::command]
pub fn media_control_update(
    app: AppHandle,
    _state: tauri::State<MediaControlState>,
    payload: MediaControlPayload,
) -> Result<(), AppError> {
    apply_payload(&app, payload)
}

/// Shared implementation behind `media_control_update` and the Rust-driven
/// `push_update`. Feeds the native MediaSession from a fully-formed payload.
pub(crate) fn apply_payload(
    app: &AppHandle,
    payload: MediaControlPayload,
) -> Result<(), AppError> {
    // A `mediaPlayback` foreground service may only be started while media is
    // actually playing; starting it for a paused/restored track can be rejected
    // (and take the lyric overlay down with it). Only start it on play;
    // otherwise just refresh an already-running session.
    if payload.playing {
        crate::platform::android::media_control_start().map_err(AppError::other)?;
    }
    let json = android_payload(app, &payload)?;
    crate::platform::android::media_control_update(&json).map_err(AppError::other)?;
    Ok(())
}

/// Update only the playhead, leaving the metadata untouched.
#[tauri::command]
pub fn media_control_position(
    state: tauri::State<MediaControlState>,
    position_ms: f64,
    playing: bool,
) -> Result<(), AppError> {
    let _ = &state;
    crate::platform::android::media_control_position(position_ms, playing)
        .map_err(AppError::other)?;
    Ok(())
}

/// Clear the transport UI when playback stops entirely.
#[tauri::command]
pub fn media_control_clear(
    app: AppHandle,
    state: tauri::State<MediaControlState>,
) -> Result<(), AppError> {
    let _ = &app;
    let _ = &state;
    crate::platform::android::media_control_stop().map_err(AppError::other)?;
    Ok(())
}

/// Drain a transport action queued by the native MediaSession.
#[tauri::command]
pub fn media_control_take_control() -> Result<Option<String>, AppError> {
    crate::platform::android::media_control_take_control().map_err(AppError::other)
}

/// Serialize the snapshot for the Android bridge, inlining the cover bytes.
fn android_payload(app: &AppHandle, payload: &MediaControlPayload) -> Result<String, AppError> {
    use base64::Engine;

    let mut value = serde_json::to_value(payload)?;
    if let Some(hash) = valid_hash(payload.cover_hash.as_deref()) {
        let file = crate::commands::media::cover_file(
            &crate::commands::media::resolve_cache_dir(app),
            hash,
        );
        if let Ok(bytes) = std::fs::read(file) {
            let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
            value["coverBase64"] = serde_json::Value::String(encoded);
        }
    }
    Ok(value.to_string())
}

/// Validate a cache cover id (lowercase/upper hex, non-empty).
fn valid_hash(hash: Option<&str>) -> Option<&str> {
    hash.filter(|value| !value.is_empty() && value.chars().all(|c| c.is_ascii_hexdigit()))
}

/// Resolve a track's display metadata (title / artist / album / cover hash) from
/// its `source_id::path`, reading the on-disk parse cache when available.
fn resolve_meta(
    app: &AppHandle,
    source_id: &str,
    path: &str,
) -> (String, String, String, Option<String>) {
    let hash = crate::commands::media::asset_hash(source_id, path);
    let dir = crate::commands::media::resolve_cache_dir(app);
    let meta = crate::commands::media::read_meta(&dir, &hash);
    let cover = if valid_hash(Some(&hash)).is_some() {
        Some(hash)
    } else {
        None
    };
    let (title, artist, album) = match &meta {
        Some(meta) => (
            meta.title.clone().unwrap_or_default(),
            meta.artist.clone().unwrap_or_default(),
            meta.album.clone().unwrap_or_default(),
        ),
        None => (String::new(), String::new(), String::new()),
    };
    // Fall back to the file name so the control always gets a distinct string
    // rather than an empty title when the tag is not cached yet.
    let title = if title.is_empty() {
        std::path::Path::new(path)
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| path.to_string())
    } else {
        title
    };
    (title, artist, album, cover)
}

/// Push the current playback to the OS media controls, deriving the display
/// metadata from `source_id::path`. Called by the Rust playback event thread so
/// reporting no longer depends on the webview being alive.
///
/// An empty `source_id`/`path` means nothing is loaded: clear the OS UI.
pub(crate) fn push_update(
    app: &AppHandle,
    source_id: &str,
    path: &str,
    duration_ms: f64,
    position_ms: f64,
    playing: bool,
    volume: f64,
) {
    if source_id.is_empty() || path.is_empty() {
        let _ = crate::platform::android::media_control_stop();
        return;
    }
    let (title, artist, album, cover_hash) = resolve_meta(app, source_id, path);
    let payload = MediaControlPayload {
        title,
        artist,
        album,
        duration_ms,
        position_ms,
        playing,
        volume,
        cover_hash,
    };
    let _ = apply_payload(app, payload);
}
