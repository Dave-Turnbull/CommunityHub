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
