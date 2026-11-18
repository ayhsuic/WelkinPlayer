// Copyright 2026 Atemukesu
// SPDX-License-Identifier: GPL-3.0-only

mod commands;
mod core;
mod data;
mod platform;
mod streaming;

// Smart-transition analysis decodes audio through the playback source layer.
mod analysis;

// The Rust playback engine decodes and renders through `rodio` + `cpal`
// (Oboe / AAudio on Android), so decoding and output never touch the webview
// or hand-written JNI.
mod playback;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    core::logging::init();

    // Android has no keyring backend; install the Keystore-backed one before
    // anything touches the keychain. A failure is recorded so the WebDAV
    // commands report an unavailable keychain instead of silently writing to
    // keyring's non-persistent mock store.
    #[cfg(target_os = "android")]
    commands::webdav::set_keychain_init_error(platform::android::initialize_keychain());

    let builder = tauri::Builder::default().runtime(tauri_runtime_wry::Wry::default());

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(commands::desktop_lyric::DesktopLyricCache::default())
        .manage(platform::media_control::MediaControlState::default())
        .setup(|app| {
            app.manage(commands::smart_transition::TransitionJobs::default());

            // Let the webview load cached cover thumbnails as plain asset URLs.
            commands::media::allow_cache_dir(app.handle());
            match streaming::state::start(app.handle().clone()) {
                Ok(stream_state) => {
                    // The playback engine decodes in Rust and reads the
                    // stream/manual caches directly; it shares their handles.
                    let engine = playback::engine::start(
                        app.handle().clone(),
                        stream_state.cache.clone(),
                        stream_state.manual.clone(),
                    );
                    // The playback context (queue / shuffle / repeat) is owned
                    // by Rust so playback survives a dead or throttled webview.
                    // It wraps the engine and drives it directly. Build its clone
                    // *before* moving `engine` into Tauri state, so the original
                    // engine stays alive for the whole process (dropping it would
                    // run `Engine::drop`, which stops the worker).
                    let context =
                        playback::context::PlaybackContext::new(engine.clone(), app.handle().clone());
                    if !app.manage(engine) {
                        log::error!(
                            "playback: Engine was already managed; the newly started worker was dropped"
                        );
                    }
                    app.manage(stream_state);
                    if !app.manage(context) {
                        log::error!("playback: PlaybackContext was already managed");
                    }
                    // Drain the native Android MediaSession action queue from a
                    // Rust timer (the webview cannot be relied on to poll).
                    playback::context::start_media_control_poller(app.handle().clone());

                    // The floating-lyric tick driver runs from Rust (not the
                    // main webview) so the layer keeps advancing even after the
                    // main webview is hidden, backgrounded, or dead.
                    commands::desktop_lyric::start_ticker(app.handle().clone());
                }
                Err(error) => log::error!("failed to initialize streaming caches: {error}"),
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::ping,
            commands::echo,
            commands::log_message,
            commands::fonts::list_system_fonts,
            commands::webdav::load_source_password,
            commands::webdav::save_source_password,
            commands::webdav::delete_source_password,
            commands::webdav::webdav_url_risk,
            commands::sources::pick_local_folder,
            commands::sources::local_file_access_granted,
            commands::sources::request_local_file_access,
            commands::sources::list_source_audio,
            commands::sources::list_source_directory,
            commands::sources::list_source_audio_under,
            commands::sources::test_source_connection,
            commands::sources::test_source_write,
            commands::update::check_update,
            commands::profile::load_local_profile,
            commands::profile::load_remote_profile,
            commands::profile::save_profile,
            commands::neteasecover::netease_search_songs,
            commands::neteasecover::netease_fetch_cover,
            commands::qqcover::qq_search_songs,
            commands::qqcover::qq_fetch_cover,
            commands::covers::upload_playlist_cover,
            commands::covers::resolve_playlist_covers,
            commands::covers::delete_playlist_cover,
            commands::editor::read_track_tags,
            commands::editor::edit_track_metadata,
            commands::playback::load_local_playback,
            commands::playback::load_remote_playback,
            commands::playback::save_playback,
            commands::media::read_track_metadata,
            commands::media::read_track_metadata_batch,
            commands::media::download_track_metadata,
            commands::media::probe_track,
            commands::media::read_track_lyrics,
            commands::media::get_cached_lyrics,
            commands::lyrics::lyric_http_get,
            commands::lyrics::save_track_lyrics,
            commands::media::get_cached_metadata,
            commands::media::get_cover,
            commands::media::get_cached_cover,
            commands::media::load_cached_tracks,
            commands::media::cover_path,
            commands::media::get_cache_dir,
            commands::media::set_cache_dir,
            commands::sort::load_sort_readings,
            commands::sort::save_sort_readings,
            commands::media::load_library_cache,
            commands::media::save_library_cache,
            commands::media::refresh_source_library,
            streaming::state::prefetch_track,
            streaming::state::report_stream_progress,
            streaming::state::stream_progress,
            streaming::state::pin_track,
            streaming::state::unpin_track,
            streaming::state::cache_status,
            streaming::state::cache_usage,
            streaming::state::network_status,
            streaming::state::get_cache_config,
            streaming::state::set_stream_cache_enabled,
            streaming::state::set_prefetch_seconds,
            streaming::state::set_max_concurrent_downloads,
            streaming::state::clear_cache,
            playback::commands::audio_load,
            playback::commands::audio_play,
            playback::commands::audio_pause,
            playback::commands::audio_seek,
            playback::commands::audio_set_volume,
            playback::commands::audio_set_mute,
            playback::commands::audio_set_speed,
            playback::commands::audio_device_info,
            playback::commands::audio_devices,
            playback::commands::audio_set_device,
            playback::commands::audio_set_quality,
            playback::commands::audio_stop,
            playback::commands::audio_state,
            playback::commands_context::playback_set_queue,
            playback::commands_context::playback_reorder,
            playback::commands_context::playback_select,
            playback::commands_context::playback_toggle,
            playback::commands_context::playback_play,
            playback::commands_context::playback_pause,
            playback::commands_context::playback_next,
            playback::commands_context::playback_previous,
            playback::commands_context::playback_toggle_shuffle,
            playback::commands_context::playback_set_shuffle,
            playback::commands_context::playback_cycle_repeat,
            playback::commands_context::playback_set_repeat,
            playback::commands_context::playback_restore,
            playback::commands_context::playback_state,
            playback::commands_context::playback_set_transition_plans,
            playback::commands_context::playback_clear_transition_plans,
            commands::desktop_lyric::desktop_lyric_open,
            commands::desktop_lyric::desktop_lyric_close,
            commands::desktop_lyric::desktop_lyric_load,
            commands::desktop_lyric::desktop_lyric_tick,
            commands::desktop_lyric::desktop_lyric_set_settings,
            commands::desktop_lyric::desktop_lyric_status,
            commands::desktop_lyric::desktop_lyric_take_control,
            commands::desktop_lyric::desktop_lyric_request_permission,
            commands::desktop_lyric::desktop_lyric_set_visible,
            platform::media_control::media_control_update,
            platform::media_control::media_control_position,
            platform::media_control::media_control_clear,
            platform::media_control::media_control_take_control,
            commands::smart_transition::smart_transition_analyze,
            commands::smart_transition::smart_transition_load,
            commands::smart_transition::smart_transition_plans,
            commands::smart_transition::smart_transition_delete,
            commands::smart_transition::smart_transition_cancel,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                if let Some(engine) = app.try_state::<playback::engine::Engine>() {
                    engine.shutdown();
                }
            }
        });
}
