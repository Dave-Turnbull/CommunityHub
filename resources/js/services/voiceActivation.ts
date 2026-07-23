import { computeLevel } from '@/services/audioLevel'

export interface VoiceActivationHandle {
    stop(): void
}

/**
 * Gates whether a local mic stream should currently be transmitted, based on
 * a live level check against `threshold` (0..1, the same scale
 * services/audioLevel.ts's meter uses) — "voice activation" mode, as opposed
 * to always-on. `onGateChange` fires once immediately with the current state
 * and again every time it flips.
 *
 * `threshold <= 0` (the default — nobody has touched the sensitivity slider)
 * reports open once and does nothing further: it deliberately never touches
 * AudioContext/RAF in that case, so joining a call with voice activation off
 * costs nothing beyond the existing getUserMedia call.
 */
export function startVoiceActivation(
    stream: MediaStream,
    threshold: number,
    onGateChange: (open: boolean) => void
): VoiceActivationHandle {
    if (threshold <= 0) {
        onGateChange(true)
        return { stop() {} }
    }

    const context = new AudioContext()
    const analyser = context.createAnalyser()
    analyser.fftSize = 512
    context.createMediaStreamSource(stream).connect(analyser)
    const data = new Uint8Array(analyser.fftSize)

    let open: boolean | null = null
    let raf: number

    const tick = () => {
        analyser.getByteTimeDomainData(data)
        const shouldBeOpen = computeLevel(data) >= threshold
        if (shouldBeOpen !== open) {
            open = shouldBeOpen
            onGateChange(open)
        }
        raf = requestAnimationFrame(tick)
    }
    tick()

    return {
        stop() {
            cancelAnimationFrame(raf)
            context.close()
        },
    }
}
