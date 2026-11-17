// SPDX-License-Identifier: GPL-3.0-only
//
// Android NDK stub for the `automix` crate's optional RubberBand FFI.
//
// automix 2.0.1 unconditionally links the system C++ library `librubberband`
// and exposes a small C API through `src/mixer/rubberband_ffi.rs`. The NDK
// does not ship that library, and this app only consumes automix's pure-DSP
// analyser (`Analyzer` / `AudioBuffer` / `TrackFeatures`); the `Deck`
// time-stretch path that calls these symbols is never instantiated on
// Android. This translation unit provides empty definitions so the Android
// link step can resolve the FFI symbols without bundling a real RubberBand
// build. The signatures mirror `rubberband_ffi.rs` exactly.

#include <stddef.h>

void *rubberband_new(unsigned int sample_rate, unsigned int channels, int options,
                     double initial_time_ratio, double initial_pitch_scale) {
    (void)sample_rate;
    (void)channels;
    (void)options;
    (void)initial_time_ratio;
    (void)initial_pitch_scale;
    return NULL;
}

void rubberband_delete(void *state) {
    (void)state;
}

void rubberband_set_time_ratio(void *state, double ratio) {
    (void)state;
    (void)ratio;
}

void rubberband_set_max_process_size(void *state, unsigned int samples) {
    (void)state;
    (void)samples;
}

void rubberband_process(void *state, const float *const *input, unsigned int samples,
                        int final_) {
    (void)state;
    (void)input;
    (void)samples;
    (void)final_;
}

int rubberband_available(void *state) {
    (void)state;
    return 0;
}

unsigned int rubberband_retrieve(void *state, float *const *output, unsigned int samples) {
    (void)state;
    (void)output;
    (void)samples;
    return 0;
}
