import { afterEach, describe, expect, it, vi } from 'vitest'
import { startVoiceActivation } from '@/services/voiceActivation'

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

    const rafCallbacks: (() => void)[] = []
    vi.stubGlobal('requestAnimationFrame', vi.fn((cb: () => void) => {
        rafCallbacks.push(cb)
        return rafCallbacks.length
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    return {
        close,
        // Runs the next scheduled frame, feeding the next amplitude in the list.
        nextFrame() {
            const cb = rafCallbacks.shift()
            cb?.()
        },
    }
}

describe('voiceActivation', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('a threshold of 0 reports open immediately and never touches AudioContext', () => {
        vi.stubGlobal('AudioContext', vi.fn())
        const onGateChange = vi.fn()

        startVoiceActivation({} as MediaStream, 0, onGateChange)

        expect(onGateChange).toHaveBeenCalledWith(true)
        expect(AudioContext).not.toHaveBeenCalled()
    })

    it('a negative threshold is also treated as always-on', () => {
        vi.stubGlobal('AudioContext', vi.fn())
        const onGateChange = vi.fn()

        startVoiceActivation({} as MediaStream, -5, onGateChange)

        expect(onGateChange).toHaveBeenCalledWith(true)
        expect(AudioContext).not.toHaveBeenCalled()
    })

    it('reports the initial gate state from the first sample above threshold', () => {
        stubAudioContext([0.5])
        const onGateChange = vi.fn()

        startVoiceActivation({} as MediaStream, 0.2, onGateChange)

        expect(onGateChange).toHaveBeenCalledWith(true)
    })

    it('reports the initial gate state as closed when the first sample is below threshold', () => {
        // 0.0001 sits below the dB floor services/audioLevel.ts clamps to, so
        // it reads as level 0 — a realistic "silence/background noise" fixture
        // on the log scale, unlike a linear scale where 0.01 would already
        // have worked (see the level-meter task this threshold logic reuses).
        stubAudioContext([0.0001])
        const onGateChange = vi.fn()

        startVoiceActivation({} as MediaStream, 0.2, onGateChange)

        expect(onGateChange).toHaveBeenCalledWith(false)
    })

    it('only re-fires onGateChange when the open/closed state actually flips', () => {
        const ctx = stubAudioContext([0.5, 0.5, 0.5])
        const onGateChange = vi.fn()
        startVoiceActivation({} as MediaStream, 0.2, onGateChange)
        onGateChange.mockClear()

        ctx.nextFrame()
        ctx.nextFrame()

        expect(onGateChange).not.toHaveBeenCalled()
    })

    it('closes the gate once the level drops back below threshold', () => {
        const ctx = stubAudioContext([0.5, 0.0001])
        const onGateChange = vi.fn()
        startVoiceActivation({} as MediaStream, 0.2, onGateChange)
        onGateChange.mockClear()

        ctx.nextFrame()

        expect(onGateChange).toHaveBeenCalledWith(false)
    })

    it('stop() cancels the animation frame loop and closes the audio context', () => {
        const ctx = stubAudioContext([0.5])
        const handle = startVoiceActivation({} as MediaStream, 0.2, vi.fn())

        handle.stop()

        expect(cancelAnimationFrame).toHaveBeenCalled()
        expect(ctx.close).toHaveBeenCalled()
    })
})
