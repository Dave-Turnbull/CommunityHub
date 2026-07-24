// A linear RMS-to-0..1 mapping badly undersells normal speech (typical
// conversational RMS sits well under 0.25 of full scale), so the mic level
// meter and any future threshold/speaking-detection logic instead convert to
// dBFS and normalize against a floor, the way real level meters do.
const MIN_DB = -60

export function rms(samples: Uint8Array): number {
    let sumSquares = 0
    for (let i = 0; i < samples.length; i++) {
        const normalized = (samples[i] - 128) / 128
        sumSquares += normalized * normalized
    }
    return Math.sqrt(sumSquares / samples.length)
}

export function rmsToLevel(value: number): number {
    if (value <= 0) return 0
    const db = 20 * Math.log10(value)
    return Math.max(0, Math.min(1, (db - MIN_DB) / -MIN_DB))
}

export function computeLevel(samples: Uint8Array): number {
    return rmsToLevel(rms(samples))
}

export interface PeakHold {
    /**
     * Feeds a new instantaneous level reading and returns the current
     * held/decaying peak. `deltaSeconds` is the time elapsed since the
     * previous call (0 for the very first).
     */
    update(instantLevel: number, deltaSeconds: number): number
}

// Fast attack (jumps to a new peak immediately), slow release (decays this
// many level-units per second otherwise). A single `computeLevel()` reading
// is an instantaneous RMS over one small (512-sample, ~10ms) analyser
// window sampled once per animation frame — real speech varies enough
// frame-to-frame (syllable boundaries, brief pauses, consonants) that a
// short, real spike can land entirely between two sampled windows and never
// show up at all. Peak-hold keeps a spike visible/usable for a brief window
// afterward instead of only ever reflecting whatever the instant of the
// current frame happens to be — used for both the level meter's display and
// the voice-activation gate's decision, so what you see is what triggers it.
const DEFAULT_DECAY_PER_SECOND = 1.2

export function createPeakHold(decayPerSecond: number = DEFAULT_DECAY_PER_SECOND): PeakHold {
    let peak = 0

    return {
        update(instantLevel, deltaSeconds) {
            const decayed = peak - decayPerSecond * deltaSeconds
            peak = Math.max(instantLevel, decayed, 0)
            return peak
        },
    }
}
