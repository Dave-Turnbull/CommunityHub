import { describe, expect, it } from 'vitest'
import { computeLevel, createPeakHold, rms, rmsToLevel } from '@/services/audioLevel'

function samplesAt(amplitude: number, length = 512): Uint8Array {
    // A square wave at the given amplitude (0..1) has RMS equal to its
    // amplitude, making it a convenient fixture for exact RMS assertions.
    const data = new Uint8Array(length)
    const swing = Math.round(amplitude * 128)
    for (let i = 0; i < length; i++) {
        data[i] = i % 2 === 0 ? 128 + swing : 128 - swing
    }
    return data
}

describe('audioLevel', () => {
    it('rms of silence (all samples at the 128 midpoint) is 0', () => {
        expect(rms(new Uint8Array(512).fill(128))).toBe(0)
    })

    it('rms of a full-scale square wave is 1', () => {
        expect(rms(samplesAt(1))).toBeCloseTo(1, 2)
    })

    it('rms of a half-amplitude square wave is 0.5', () => {
        expect(rms(samplesAt(0.5))).toBeCloseTo(0.5, 2)
    })

    it('rmsToLevel maps silence to 0', () => {
        expect(rmsToLevel(0)).toBe(0)
    })

    it('rmsToLevel maps full scale to 1', () => {
        expect(rmsToLevel(1)).toBeCloseTo(1, 5)
    })

    it('rmsToLevel never exceeds 1 or drops below 0', () => {
        expect(rmsToLevel(10)).toBeLessThanOrEqual(1)
        expect(rmsToLevel(0.0000001)).toBeGreaterThanOrEqual(0)
    })

    it('a moderate speech-level RMS reads well above a quarter of the meter (the linear meter this replaces underrepresented it)', () => {
        // 0.1 RMS is a realistic conversational-speech level.
        expect(rmsToLevel(0.1)).toBeGreaterThan(0.6)
    })

    it('is monotonically increasing with input amplitude', () => {
        const levels = [0.01, 0.05, 0.1, 0.3, 0.6, 1].map((amp) => computeLevel(samplesAt(amp)))
        for (let i = 1; i < levels.length; i++) {
            expect(levels[i]).toBeGreaterThan(levels[i - 1])
        }
    })
})

describe('createPeakHold', () => {
    it('jumps to a new instant level immediately (fast attack)', () => {
        const peakHold = createPeakHold()

        expect(peakHold.update(0.8, 0)).toBe(0.8)
    })

    it('holds a spike instead of immediately dropping to a lower instant level', () => {
        const peakHold = createPeakHold(1.2)
        peakHold.update(0.8, 0)

        // A tiny time step later, level drops to near-silence — the peak
        // should still be close to 0.8, not immediately reflect the drop.
        const held = peakHold.update(0.01, 0.01)

        expect(held).toBeGreaterThan(0.7)
    })

    it('decays linearly at the configured rate per second', () => {
        const peakHold = createPeakHold(1.0) // 1.0 level-units/second
        peakHold.update(0.8, 0)

        const held = peakHold.update(0, 0.3) // 0.3s later, no new signal

        expect(held).toBeCloseTo(0.5, 5) // 0.8 - 1.0*0.3
    })

    it('never decays below 0', () => {
        const peakHold = createPeakHold(1.0)
        peakHold.update(0.2, 0)

        const held = peakHold.update(0, 10) // a long silence

        expect(held).toBe(0)
    })

    it('tracks a rising instant level even while a previous peak is still decaying', () => {
        const peakHold = createPeakHold(1.0)
        peakHold.update(0.3, 0)
        peakHold.update(0, 0.1) // decays partway toward 0

        const held = peakHold.update(0.9, 0.01) // a new, louder spike arrives

        expect(held).toBe(0.9)
    })

    it('starts at 0 before any update', () => {
        const peakHold = createPeakHold()

        expect(peakHold.update(0, 0)).toBe(0)
    })
})
