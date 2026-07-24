import { afterEach, describe, expect, it, vi } from 'vitest'
import { computeThresholds, createHangTimeGate, nextGateState, startVoiceActivation } from '@/services/voiceActivation'

// Encodes a square wave whose RMS equals `amplitude` (0..1) into `data`,
// matching services/audioLevel.test.ts's fixture approach.
function writeSamples(data: Uint8Array, amplitude: number): void {
    const swing = Math.round(amplitude * 128)
    for (let i = 0; i < data.length; i++) {
        data[i] = i % 2 === 0 ? 128 + swing : 128 - swing
    }
}

function stubAudioContext(amplitudes: number[]) {
    let call = 0
    const close = vi.fn()
    const analyser = {
        fftSize: 0,
        getByteTimeDomainData: vi.fn((data: Uint8Array) => {
            writeSamples(data, amplitudes[Math.min(call, amplitudes.length - 1)])
            call += 1
        }),
    }
    const audioContext = {
        createAnalyser: vi.fn(() => analyser),
        createMediaStreamSource: vi.fn(() => ({ connect: vi.fn() })),
        close,
    }
    vi.stubGlobal('AudioContext', vi.fn().mockImplementation(function (this: unknown) {
        return audioContext
    }))

    const rafCallbacks: ((timestamp?: number) => void)[] = []
    vi.stubGlobal('requestAnimationFrame', vi.fn((cb: (timestamp?: number) => void) => {
        rafCallbacks.push(cb)
        return rafCallbacks.length
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    return {
        close,
        // Runs the next scheduled frame, feeding the next amplitude in the
        // list. `timestamp`, when given, is what drives peak-hold decay
        // (services/audioLevel.ts's createPeakHold) — omit it (or call twice
        // in a row without one) to simulate "no meaningful time elapsed."
        nextFrame(timestamp?: number) {
            const cb = rafCallbacks.shift()
            cb?.(timestamp)
        },
    }
}

// A symmetric pair (no hysteresis gap) — the shape most existing tests use.
const fixed = (threshold: number) => ({ open: threshold, close: threshold })

// Inverse of audioLevel.ts's rmsToLevel (MIN_DB = -60) — picks the exact
// amplitude that maps to a given 0..1 level, so hysteresis tests can place a
// sample precisely between two thresholds instead of guessing at amplitudes.
function amplitudeForLevel(level: number): number {
    const db = level * 60 - 60
    return 10 ** (db / 20)
}

describe('voiceActivation', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('reports open regardless of level when the open threshold is 0 (always-on)', () => {
        stubAudioContext([0.0001])
        const onGateChange = vi.fn()

        startVoiceActivation({} as MediaStream, () => fixed(0), onGateChange)

        expect(onGateChange).toHaveBeenCalledWith(true)
    })

    it('reports open regardless of level when the open threshold is negative', () => {
        stubAudioContext([0.0001])
        const onGateChange = vi.fn()

        startVoiceActivation({} as MediaStream, () => fixed(-5), onGateChange)

        expect(onGateChange).toHaveBeenCalledWith(true)
    })

    it('reports the initial gate state from the first sample above threshold', () => {
        stubAudioContext([0.5])
        const onGateChange = vi.fn()

        startVoiceActivation({} as MediaStream, () => fixed(0.2), onGateChange)

        expect(onGateChange).toHaveBeenCalledWith(true)
    })

    it('reports the initial gate state as closed when the first sample is below threshold', () => {
        // 0.0001 sits below the dB floor services/audioLevel.ts clamps to, so
        // it reads as level 0 — a realistic "silence/background noise" fixture
        // on the log scale, unlike a linear scale where 0.01 would already
        // have worked (see the level-meter task this threshold logic reuses).
        stubAudioContext([0.0001])
        const onGateChange = vi.fn()

        startVoiceActivation({} as MediaStream, () => fixed(0.2), onGateChange)

        expect(onGateChange).toHaveBeenCalledWith(false)
    })

    it('only re-fires onGateChange when the open/closed state actually flips', () => {
        const ctx = stubAudioContext([0.5, 0.5, 0.5])
        const onGateChange = vi.fn()
        startVoiceActivation({} as MediaStream, () => fixed(0.2), onGateChange)
        onGateChange.mockClear()

        ctx.nextFrame()
        ctx.nextFrame()

        expect(onGateChange).not.toHaveBeenCalled()
    })

    it('a brief instant drop does not immediately close the gate (peak hold)', () => {
        const ctx = stubAudioContext([0.5, 0.0001])
        const onGateChange = vi.fn()
        startVoiceActivation({} as MediaStream, () => fixed(0.2), onGateChange)
        onGateChange.mockClear()

        // The first real timestamp only establishes a baseline (no prior
        // timestamp to diff against yet) — the elapsed-time delta that
        // actually drives decay only exists from the second one onward.
        ctx.nextFrame(0)
        ctx.nextFrame(10) // 10ms later — negligible decay

        expect(onGateChange).not.toHaveBeenCalled()
    })

    it('closes once the level has stayed low long enough for the held peak to actually decay past threshold', () => {
        const ctx = stubAudioContext([0.5, 0.0001])
        const onGateChange = vi.fn()
        startVoiceActivation({} as MediaStream, () => fixed(0.2), onGateChange)
        onGateChange.mockClear()

        ctx.nextFrame(0) // baseline
        ctx.nextFrame(2000) // 2 real seconds later — plenty of time to decay away

        expect(onGateChange).toHaveBeenCalledWith(false)
    })

    it('reads the thresholds fresh on every tick, so a live change takes effect without restarting', () => {
        // A constant, moderate level throughout — only the threshold changes.
        const ctx = stubAudioContext([0.3, 0.3, 0.3])
        let threshold = 0.9 // above the level: starts closed
        const onGateChange = vi.fn()
        startVoiceActivation({} as MediaStream, () => fixed(threshold), onGateChange)
        expect(onGateChange).toHaveBeenCalledWith(false)
        onGateChange.mockClear()

        threshold = 0.05 // now below the level, same running monitor
        ctx.nextFrame()

        expect(onGateChange).toHaveBeenCalledWith(true)
    })

    it('with a hysteresis gap, a brief instant dip below even the close threshold does not immediately close the gate', () => {
        // open at 0.5, close at 0.2 — the second sample's raw instant level
        // (~0.05) is below the close threshold, but peak hold should still
        // carry the held level above it moments later.
        const ctx = stubAudioContext([amplitudeForLevel(0.6), amplitudeForLevel(0.05)])
        const onGateChange = vi.fn()
        startVoiceActivation({} as MediaStream, () => ({ open: 0.5, close: 0.2 }), onGateChange)
        expect(onGateChange).toHaveBeenCalledWith(true)
        onGateChange.mockClear()

        ctx.nextFrame(0) // baseline
        ctx.nextFrame(10) // 10ms later

        expect(onGateChange).not.toHaveBeenCalled()
    })

    it('with a hysteresis gap, eventually closes once the low level persists long enough to decay past the close threshold', () => {
        const ctx = stubAudioContext([amplitudeForLevel(0.6), amplitudeForLevel(0.05)])
        const onGateChange = vi.fn()
        startVoiceActivation({} as MediaStream, () => ({ open: 0.5, close: 0.2 }), onGateChange)
        onGateChange.mockClear()

        ctx.nextFrame(0) // baseline
        ctx.nextFrame(2000) // 2 real seconds later

        expect(onGateChange).toHaveBeenCalledWith(false)
    })

    it('stop() cancels the animation frame loop and closes the audio context', () => {
        const ctx = stubAudioContext([0.5])
        const handle = startVoiceActivation({} as MediaStream, () => fixed(0.2), vi.fn())

        handle.stop()

        expect(cancelAnimationFrame).toHaveBeenCalled()
        expect(ctx.close).toHaveBeenCalled()
    })

    it('with a getTimeoutMs configured, force-closes on continual noise between close and open that never re-hits open', () => {
        // A level between close (0.2) and open (0.5), forever — hysteresis
        // alone would never close this.
        const ctx = stubAudioContext([
            amplitudeForLevel(0.6), amplitudeForLevel(0.3), amplitudeForLevel(0.3),
        ])
        const onGateChange = vi.fn()
        startVoiceActivation(
            {} as MediaStream,
            () => ({ open: 0.5, close: 0.2 }),
            onGateChange,
            () => 1000
        )
        onGateChange.mockClear()

        ctx.nextFrame(0) // baseline, still well within any timeout
        expect(onGateChange).not.toHaveBeenCalled()

        ctx.nextFrame(2000) // 2s since the level last hit the open threshold
        expect(onGateChange).toHaveBeenCalledWith(false)
    })

    it('defaults getTimeoutMs to "off" when not provided, so continual in-between noise never forces a close', () => {
        const ctx = stubAudioContext([
            amplitudeForLevel(0.6), amplitudeForLevel(0.3), amplitudeForLevel(0.3),
        ])
        const onGateChange = vi.fn()
        startVoiceActivation({} as MediaStream, () => ({ open: 0.5, close: 0.2 }), onGateChange)
        onGateChange.mockClear()

        ctx.nextFrame(0)
        ctx.nextFrame(100_000) // an enormous amount of time, still no timeout configured

        expect(onGateChange).not.toHaveBeenCalled()
    })
})

describe('nextGateState', () => {
    it('always reports open when the open threshold is 0', () => {
        expect(nextGateState(false, 0, { open: 0, close: 0 })).toBe(true)
        expect(nextGateState(true, 1, { open: 0, close: 0 })).toBe(true)
    })

    it('while closed, opens once the level reaches the open threshold', () => {
        expect(nextGateState(false, 0.49, { open: 0.5, close: 0.2 })).toBe(false)
        expect(nextGateState(false, 0.5, { open: 0.5, close: 0.2 })).toBe(true)
    })

    it('while open, stays open until the level drops below the close threshold', () => {
        expect(nextGateState(true, 0.21, { open: 0.5, close: 0.2 })).toBe(true)
        expect(nextGateState(true, 0.19, { open: 0.5, close: 0.2 })).toBe(false)
    })

    it('with no gap (open === close), behaves like a single threshold', () => {
        expect(nextGateState(false, 0.2, { open: 0.2, close: 0.2 })).toBe(true)
        expect(nextGateState(true, 0.19, { open: 0.2, close: 0.2 })).toBe(false)
    })
})

describe('createHangTimeGate', () => {
    const thresholds = { open: 0.5, close: 0.2 }

    it('with timeout off (null), behaves exactly like level-based hysteresis alone', () => {
        const gate = createHangTimeGate()

        expect(gate.update(0.6, thresholds, null, 0)).toBe(true)
        // Continual noise sitting between close and open forever, huge
        // elapsed time — stays open since the timeout is off.
        expect(gate.update(0.3, thresholds, null, 100_000)).toBe(true)
    })

    it('force-closes once the open threshold has not been hit within timeoutMs, even while still above close', () => {
        const gate = createHangTimeGate()

        gate.update(0.6, thresholds, 1000, 0) // opens, lastOpenHitAt = 0
        // Continual background noise: above close, below open, forever.
        const stillOpen = gate.update(0.3, thresholds, 1000, 500) // 500ms later — within the timeout
        const closedByTimeout = gate.update(0.3, thresholds, 1000, 1500) // 1500ms since the last open hit

        expect(stillOpen).toBe(true)
        expect(closedByTimeout).toBe(false)
    })

    it('resets the clock every time the level re-hits the open threshold', () => {
        const gate = createHangTimeGate()

        gate.update(0.6, thresholds, 1000, 0) // opens, resets clock to t=0
        gate.update(0.6, thresholds, 1000, 900) // re-hits open at t=900, resets clock again
        // Without the reset, t=1500 would be 1500ms since the original hit
        // (past the 1000ms timeout) and would close. With the reset (last
        // hit at 900), only 600ms has passed since — still open.
        const stillOpen = gate.update(0.3, thresholds, 1000, 1500)

        expect(stillOpen).toBe(true)
    })

    it('closes immediately via ordinary hysteresis if the level drops below close, regardless of the timeout', () => {
        const gate = createHangTimeGate()

        gate.update(0.6, thresholds, 5000, 0)
        const closed = gate.update(0.01, thresholds, 5000, 10) // well within the 5s timeout

        expect(closed).toBe(false)
    })

    it('never times out before any real timestamp is available', () => {
        const gate = createHangTimeGate()

        gate.update(0.6, thresholds, 1000, undefined)
        const stillOpen = gate.update(0.3, thresholds, 1000, undefined)

        expect(stillOpen).toBe(true)
    })

    it('opening from closed still works normally with a timeout configured', () => {
        const gate = createHangTimeGate()

        expect(gate.update(0.01, thresholds, 1000, 0)).toBe(false)
        expect(gate.update(0.6, thresholds, 1000, 100)).toBe(true)
    })

    it('is unaffected by the timeout when the open threshold is 0 (always-on)', () => {
        const gate = createHangTimeGate()

        expect(gate.update(0, { open: 0, close: 0 }, 500, 0)).toBe(true)
        expect(gate.update(0, { open: 0, close: 0 }, 500, 100_000)).toBe(true)
    })
})

describe('computeThresholds', () => {
    it('converts 0-100 threshold and 0-30 closeGap to a 0..1 ThresholdPair', () => {
        expect(computeThresholds({ threshold: 50, closeGap: 20, autoGainControl: false }))
            .toEqual({ open: 0.5, close: 0.3 })
    })

    it('a closeGap of 0 makes open and close equal', () => {
        expect(computeThresholds({ threshold: 40, closeGap: 0, autoGainControl: false }))
            .toEqual({ open: 0.4, close: 0.4 })
    })

    it('clamps close at 0 rather than going negative when the gap exceeds the threshold', () => {
        expect(computeThresholds({ threshold: 10, closeGap: 30, autoGainControl: false }))
            .toEqual({ open: 0.1, close: 0 })
    })

    it('collapses to always-on (0, 0) when autoGainControl is on, regardless of threshold/closeGap', () => {
        expect(computeThresholds({ threshold: 60, closeGap: 20, autoGainControl: true }))
            .toEqual({ open: 0, close: 0 })
    })
})
