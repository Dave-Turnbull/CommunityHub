import { computeLevel, createPeakHold } from '@/services/audioLevel'

export interface VoiceActivationHandle {
    stop(): void
}

export interface ThresholdPair {
    // The level a currently-closed gate must reach to open (0..1).
    open: number
    // The level a currently-open gate must drop below to close (0..1).
    // Equal to `open` for the original single-threshold behavior; lower than
    // `open` adds hysteresis (a gap) so a level hovering right at the
    // boundary doesn't rapidly flip the gate open/closed.
    close: number
}

export interface SensitivitySettings {
    // 0-100, the raw send_threshold preference value.
    threshold: number
    // 0/10/20/30, the raw close_threshold_gap preference value.
    closeGap: number
    // AGC continuously boosts quiet input toward a target loudness, which
    // defeats a level-based threshold entirely (see docs/voice.md) — while
    // it's on, the effective thresholds collapse to "always on" without
    // touching the underlying threshold/closeGap values themselves, so
    // turning AGC back off resumes with whatever was set before.
    autoGainControl: boolean
}

/** Converts the raw 0-100/0-30 preference values into a 0..1 ThresholdPair. */
export function computeThresholds({ threshold, closeGap, autoGainControl }: SensitivitySettings): ThresholdPair {
    if (autoGainControl) return { open: 0, close: 0 }

    const open = threshold / 100
    const close = Math.max(0, open - closeGap / 100)
    return { open, close }
}

/**
 * Pure gate-state transition, no I/O — exported separately from
 * startVoiceActivation so a caller that already owns an analyser loop for
 * another purpose (AudioSettings.tsx's mic-test meter) can reuse the exact
 * same decision without a second AudioContext/analyser tapping the same
 * stream.
 *
 * `open <= 0` (the default — nobody has touched the sensitivity slider)
 * means "always on" regardless of `close` or the live level.
 */
export function nextGateState(currentlyOpen: boolean, level: number, thresholds: ThresholdPair): boolean {
    if (thresholds.open <= 0) return true
    return currentlyOpen ? level >= thresholds.close : level >= thresholds.open
}

export interface HangTimeGate {
    /**
     * `timeoutMs` of `null` means "off" — behaves exactly like nextGateState
     * alone (level-based hysteresis only). A finite `timeoutMs` adds a
     * second, independent closing condition: if the level hasn't reached
     * `thresholds.open` again within the last `timeoutMs`, the gate force-
     * closes even while still above `thresholds.close` — handles continuous
     * background noise that would otherwise sit in the hysteresis band and
     * keep a level-only gate open forever. Reaching the open threshold at
     * any point (whether already open or just opening) resets the clock.
     * `timestamp` is a requestAnimationFrame-style monotonic ms value;
     * `undefined` (the very first tick, before any real timestamp exists)
     * never starts or evaluates the timeout, matching how peak-hold decay
     * itself waits for two real timestamps before doing anything.
     */
    update(level: number, thresholds: ThresholdPair, timeoutMs: number | null, timestamp?: number): boolean
}

export function createHangTimeGate(): HangTimeGate {
    let open = false
    let lastOpenHitAt: number | null = null

    return {
        update(level, thresholds, timeoutMs, timestamp) {
            if (level >= thresholds.open && timestamp !== undefined) {
                lastOpenHitAt = timestamp
            }

            const hysteresisOpen = nextGateState(open, level, thresholds)
            const timedOut = open
                && timeoutMs !== null
                && lastOpenHitAt !== null
                && timestamp !== undefined
                && timestamp - lastOpenHitAt > timeoutMs

            open = hysteresisOpen && !timedOut
            return open
        },
    }
}

/**
 * Gates whether a local mic stream should currently be transmitted, based on
 * a live level check against a threshold pair (0..1, the same scale
 * services/audioLevel.ts's meter uses) — "voice activation" mode, as opposed
 * to always-on. `onGateChange` fires once immediately with the current state
 * and again every time it flips.
 *
 * `getThresholds` is a getter, not a fixed value, re-read on every tick — a
 * caller can back it with a live store (see stores/index.ts's
 * useMicSensitivity) so a threshold change while this monitor is already
 * running takes effect immediately, without needing to restart it.
 * `getTimeoutMs`, if given, is read the same way for the hang-time timeout
 * (see HangTimeGate) — defaults to "off" for callers (e.g. remote-participant
 * speaking detection) that don't need it.
 */
export function startVoiceActivation(
    stream: MediaStream,
    getThresholds: () => ThresholdPair,
    onGateChange: (open: boolean) => void,
    getTimeoutMs: () => number | null = () => null
): VoiceActivationHandle {
    const context = new AudioContext()
    const analyser = context.createAnalyser()
    analyser.fftSize = 512
    context.createMediaStreamSource(stream).connect(analyser)
    const data = new Uint8Array(analyser.fftSize)
    const peakHold = createPeakHold()
    const gate = createHangTimeGate()

    let reportedOpen: boolean | null = null
    let raf: number
    let lastTimestamp: number | null = null

    // `timestamp` comes from requestAnimationFrame on every call except the
    // very first (called synchronously below, with no timestamp available
    // yet) — deltaSeconds is 0 until there are two real timestamps to diff,
    // which only delays when peak-hold decay starts mattering by one frame.
    const tick = (timestamp?: number) => {
        const deltaSeconds = lastTimestamp === null || timestamp === undefined
            ? 0
            : (timestamp - lastTimestamp) / 1000
        if (timestamp !== undefined) lastTimestamp = timestamp

        analyser.getByteTimeDomainData(data)
        const level = peakHold.update(computeLevel(data), deltaSeconds)
        const shouldBeOpen = gate.update(level, getThresholds(), getTimeoutMs(), timestamp)
        if (shouldBeOpen !== reportedOpen) {
            reportedOpen = shouldBeOpen
            onGateChange(reportedOpen)
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
