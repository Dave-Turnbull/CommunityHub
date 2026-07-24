import { useEffect, useRef, useState } from 'react'
import { fetchVoiceDevicePreference, updateVoiceDevicePreference } from '@/services/api'
import { getClientId } from '@/services/clientId'
import { computeLevel, createPeakHold } from '@/services/audioLevel'
import { computeThresholds, createHangTimeGate } from '@/services/voiceActivation'
import { Toggle } from '@/components/ui/Toggle'
import { useMicSensitivity } from '@/stores'
import type { VoiceDevicePreference } from '@/types'

// 0 ("Off") means no gap — the original single-threshold behavior. Values
// only, deliberately not shown as percentages in the UI (see the Hysteresis
// band select below) — the marker band on the meter shows the effect.
const CLOSE_THRESHOLD_GAP_OPTIONS = [
    { value: 30, label: 'Large' },
    { value: 20, label: 'Medium' },
    { value: 10, label: 'Small' },
    { value: 0, label: 'Off' },
] as const

// 500-5000 in 500ms steps, plus one more step representing "Off" (null —
// no hang-time enforcement). A slider (unlike the gap select above) since
// this is a much finer-grained, continuously-adjustable duration rather
// than a small set of named presets.
const CLOSE_THRESHOLD_TIMEOUT_STEP_MS = 500
const CLOSE_THRESHOLD_TIMEOUT_MAX_MS = 5000
const CLOSE_THRESHOLD_TIMEOUT_OFF_VALUE = CLOSE_THRESHOLD_TIMEOUT_MAX_MS + CLOSE_THRESHOLD_TIMEOUT_STEP_MS

interface DeviceOption {
    deviceId: string
    label: string
}

// Non-standard but widely supported (Chrome/Edge) — routes an <audio>
// element's output to a specific device. No type in lib.dom.d.ts.
type SinkableAudioElement = HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }

export function AudioSettings() {
    const [preference, setPreference] = useState<VoiceDevicePreference | null>(null)
    const [inputDevices, setInputDevices] = useState<DeviceOption[]>([])
    const [outputDevices, setOutputDevices] = useState<DeviceOption[]>([])
    const [labelsUnlocked, setLabelsUnlocked] = useState(false)
    const [isTesting, setIsTesting] = useState(false)
    const [level, setLevel] = useState(0)

    const streamRef = useRef<MediaStream | null>(null)
    const audioContextRef = useRef<AudioContext | null>(null)
    const rafRef = useRef<number | null>(null)
    const audioElRef = useRef<SinkableAudioElement | null>(null)

    async function loadDevices() {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const inputs = devices.filter((d) => d.kind === 'audioinput')
        const outputs = devices.filter((d) => d.kind === 'audiooutput')

        setInputDevices(inputs.map((d) => ({ deviceId: d.deviceId, label: d.label || 'Microphone' })))
        setOutputDevices(outputs.map((d) => ({ deviceId: d.deviceId, label: d.label || 'Speaker' })))
        setLabelsUnlocked(inputs.some((d) => d.label !== ''))
    }

    function stopTest() {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
        rafRef.current = null
        streamRef.current?.getTracks().forEach((track) => track.stop())
        streamRef.current = null
        audioContextRef.current?.close()
        audioContextRef.current = null
        if (audioElRef.current) audioElRef.current.srcObject = null
        setIsTesting(false)
        setLevel(0)
    }

    useEffect(() => {
        fetchVoiceDevicePreference(getClientId()).then((fetched) => {
            setPreference(fetched)
            // Seeds the same live store services/webrtc.ts's gate reads from
            // — in case an active call was joined before this page loaded.
            useMicSensitivity.getState().setThreshold(fetched.send_threshold)
            useMicSensitivity.getState().setCloseGap(fetched.close_threshold_gap)
            useMicSensitivity.getState().setTimeoutMs(fetched.close_threshold_timeout_ms)
            useMicSensitivity.getState().setAutoGainControl(fetched.auto_gain_control)
        })
        loadDevices()

        return stopTest
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Device labels are blank until mic permission is granted — a brief
    // getUserMedia call unlocks them, then the track is stopped immediately.
    // Kept separate from "Test Microphone" below: this is only about seeing
    // device names in the pickers, not about hearing/monitoring anything.
    async function requestMicrophoneAccess() {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach((track) => track.stop())
        await loadDevices()
    }

    const update = (field: 'input_device_id' | 'output_device_id', value: string) => {
        if (!preference) return

        const next = { ...preference, [field]: value || null }
        setPreference(next)
        updateVoiceDevicePreference(next)
    }

    const updateSendThreshold = (value: number) => {
        if (!preference) return

        const next = { ...preference, send_threshold: value }
        setPreference(next)
        // Live first — takes effect immediately in the loopback test below and
        // in any active call, ahead of (and regardless of) the API round-trip.
        useMicSensitivity.getState().setThreshold(value)
        updateVoiceDevicePreference(next)
    }

    const updateCloseThresholdGap = (value: number) => {
        if (!preference) return

        const next = { ...preference, close_threshold_gap: value }
        setPreference(next)
        useMicSensitivity.getState().setCloseGap(value)
        updateVoiceDevicePreference(next)
    }

    const updateCloseThresholdTimeout = (sliderValue: number) => {
        if (!preference) return

        const value = sliderValue >= CLOSE_THRESHOLD_TIMEOUT_OFF_VALUE ? null : sliderValue
        const next = { ...preference, close_threshold_timeout_ms: value }
        setPreference(next)
        useMicSensitivity.getState().setTimeoutMs(value)
        updateVoiceDevicePreference(next)
    }

    const updateProcessingToggle = (
        field: 'echo_cancellation' | 'noise_suppression' | 'auto_gain_control',
        value: boolean
    ) => {
        if (!preference) return

        const next = { ...preference, [field]: value }
        setPreference(next)
        // AGC continuously boosts quiet input toward a target loudness,
        // including pure noise-floor silence — a fixed level threshold can't
        // reliably tell speech from that boosted floor once it's on. Rather
        // than resetting the stored sensitivity value, the effective
        // threshold just collapses to "always on" while AGC is on (see
        // services/voiceActivation.ts's computeThresholds) — the slider's own
        // value is left untouched, so turning AGC back off resumes with
        // whatever sensitivity was set before.
        if (field === 'auto_gain_control') {
            useMicSensitivity.getState().setAutoGainControl(value)
        }
        updateVoiceDevicePreference(next)
    }

    async function startTest() {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                ...(preference?.input_device_id ? { deviceId: { exact: preference.input_device_id } } : {}),
                echoCancellation: preference?.echo_cancellation ?? true,
                noiseSuppression: preference?.noise_suppression ?? true,
                autoGainControl: preference?.auto_gain_control ?? false,
            },
        })
        streamRef.current = stream

        const context = new AudioContext()
        audioContextRef.current = context
        const analyser = context.createAnalyser()
        analyser.fftSize = 512
        context.createMediaStreamSource(stream).connect(analyser)

        const data = new Uint8Array(analyser.fftSize)
        // Fast-attack/slow-decay peak hold — a single computeLevel() reading
        // is an instantaneous RMS over one small (~10ms) analyser window
        // sampled once per animation frame, so a brief real spike can land
        // entirely between two sampled windows and never show up at all.
        // Peak hold keeps a spike visible (on the meter) and usable (for the
        // gate below) for a short window afterward instead of only ever
        // reflecting whatever the instant of the current frame happens to
        // be. Same primitive services/webrtc.ts's real gate now uses, so
        // this demo behaves identically to a real call.
        const peakHold = createPeakHold()
        const gate = createHangTimeGate()
        let lastTimestamp: number | null = null

        const tick = (timestamp?: number) => {
            const deltaSeconds = lastTimestamp === null || timestamp === undefined
                ? 0
                : (timestamp - lastTimestamp) / 1000
            if (timestamp !== undefined) lastTimestamp = timestamp

            analyser.getByteTimeDomainData(data)
            const currentLevel = peakHold.update(computeLevel(data), deltaSeconds)
            setLevel(currentLevel)

            // Gates the loopback itself so this test actually demonstrates
            // what the sensitivity slider, hysteresis band, and close
            // threshold timeout do in a real call, instead of the marker
            // being a purely cosmetic reference — reads live off
            // useMicSensitivity (not the `preference` state closed over when
            // startTest ran) so moving any control mid-test takes effect
            // immediately. Uses the same createHangTimeGate primitive
            // services/webrtc.ts's real gate does, so this demo behaves
            // identically to a real call.
            const { threshold, closeGap, timeoutMs, autoGainControl } = useMicSensitivity.getState()
            const thresholds = computeThresholds({ threshold, closeGap, autoGainControl })
            const gateOpen = gate.update(currentLevel, thresholds, timeoutMs, timestamp)
            if (audioElRef.current) {
                audioElRef.current.muted = !gateOpen
            }

            rafRef.current = requestAnimationFrame(tick)
        }
        tick()

        const audioEl = audioElRef.current
        if (audioEl) {
            audioEl.srcObject = stream
            if (preference?.output_device_id && audioEl.setSinkId) {
                await audioEl.setSinkId(preference.output_device_id)
            }
            await audioEl.play()
        }

        setIsTesting(true)
        // The stream we just acquired may be the first-ever permission grant
        // — refresh so the pickers show real labels either way.
        await loadDevices()
    }

    if (!preference) {
        return <p className="text-sm text-text-muted">Loading…</p>
    }

    return (
        <div className="space-y-5">
            <div className="bg-surface-700 rounded-lg p-6 space-y-5">
                {!labelsUnlocked && (
                    <div className="flex items-center justify-between gap-4">
                        <p className="text-sm text-text-secondary">
                            Grant microphone access to see your device names.
                        </p>
                        <button
                            onClick={requestMicrophoneAccess}
                            className="flex-shrink-0 rounded bg-brand hover:bg-brand-hover px-3 py-1.5 text-sm font-medium text-white transition-colors duration-100"
                        >
                            Grant Access
                        </button>
                    </div>
                )}

                <div>
                    <label htmlFor="voice-input-device" className="block text-xs font-semibold uppercase tracking-wide text-text-secondary mb-1.5">
                        Microphone
                    </label>
                    <select
                        id="voice-input-device"
                        value={preference.input_device_id ?? ''}
                        onChange={(e) => update('input_device_id', e.target.value)}
                        className="w-full bg-surface-800 border border-surface-400 rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-brand transition-colors duration-100"
                    >
                        <option value="">System default</option>
                        {inputDevices.map((d) => (
                            <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label htmlFor="voice-output-device" className="block text-xs font-semibold uppercase tracking-wide text-text-secondary mb-1.5">
                        Speaker
                    </label>
                    <select
                        id="voice-output-device"
                        value={preference.output_device_id ?? ''}
                        onChange={(e) => update('output_device_id', e.target.value)}
                        className="w-full bg-surface-800 border border-surface-400 rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-brand transition-colors duration-100"
                    >
                        <option value="">System default</option>
                        {outputDevices.map((d) => (
                            <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="bg-surface-700 rounded-lg p-6 space-y-4">
                <div>
                    <p className="text-sm font-medium text-text-primary">Audio Processing</p>
                    <p className="text-xs text-text-muted mt-0.5">
                        Applied the next time you start a call or the mic test below —
                        changing these has no effect on an already-open stream.
                    </p>
                </div>

                <div className="flex items-center justify-between gap-4">
                    <div>
                        <span className="text-sm text-text-primary">Echo Cancellation</span>
                        <p className="text-xs text-text-muted mt-0.5">
                            Stops other participants from hearing their own voice
                            echoed back through your microphone.
                        </p>
                    </div>
                    <Toggle
                        checked={preference.echo_cancellation}
                        onChange={(checked) => updateProcessingToggle('echo_cancellation', checked)}
                        label="Echo Cancellation"
                    />
                </div>

                <div className="flex items-center justify-between gap-4">
                    <div>
                        <span className="text-sm text-text-primary">Noise Suppression</span>
                        <p className="text-xs text-text-muted mt-0.5">
                            Reduces steady background noise, like fans or hum, in the
                            audio you send.
                        </p>
                    </div>
                    <Toggle
                        checked={preference.noise_suppression}
                        onChange={(checked) => updateProcessingToggle('noise_suppression', checked)}
                        label="Noise Suppression"
                    />
                </div>

                <div className="flex items-center justify-between gap-4">
                    <div>
                        <span className="text-sm text-text-primary">Auto Gain Control</span>
                        <p className="text-xs text-text-muted mt-0.5">
                            Boosts quiet input automatically. Turning this on disables Mic
                            Sensitivity below — a fixed threshold can't reliably tell speech
                            from boosted background noise once gain is auto-adjusting.
                        </p>
                    </div>
                    <Toggle
                        checked={preference.auto_gain_control}
                        onChange={(checked) => updateProcessingToggle('auto_gain_control', checked)}
                        label="Auto Gain Control"
                    />
                </div>
            </div>

            <div className="bg-surface-700 rounded-lg p-6 space-y-3">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <p className="text-sm font-medium text-text-primary">Test Microphone</p>
                        <p className="text-xs text-text-muted mt-0.5">
                            Plays your mic back through the selected speaker in real time —
                            use headphones to avoid feedback.
                        </p>
                    </div>
                    <button
                        onClick={isTesting ? stopTest : startTest}
                        className="flex-shrink-0 rounded bg-brand hover:bg-brand-hover px-3 py-1.5 text-sm font-medium text-white transition-colors duration-100"
                    >
                        {isTesting ? 'Stop Test' : 'Start Test'}
                    </button>
                </div>

                {/* Rendered even outside a test run (a "dummy" bar at 0) so
                    the sensitivity/hysteresis markers stay visible as a
                    reference without needing to start the mic test. */}
                <div
                    role="progressbar"
                    aria-label="Microphone level"
                    aria-valuenow={Math.round(level * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="relative h-2 w-full rounded-full bg-surface-500 overflow-hidden"
                >
                    <div
                        className="h-full bg-success transition-[width] duration-75"
                        style={{ width: `${Math.round(level * 100)}%` }}
                    />
                    {preference.send_threshold > 0 && !preference.auto_gain_control && (
                        <div
                            aria-hidden
                            className="absolute top-0 h-full bg-text-primary/30 border-r-2 border-text-primary"
                            style={{
                                left: `${Math.max(0, preference.send_threshold - preference.close_threshold_gap)}%`,
                                width: `${Math.min(preference.close_threshold_gap, preference.send_threshold)}%`,
                            }}
                        />
                    )}
                </div>

                {/* Hidden — this is the mic-loopback element, not a UI control. */}
                <audio ref={audioElRef} className="hidden" />

                <div className="pt-1">
                    <div className="flex items-center justify-between gap-4">
                        <label htmlFor="voice-send-threshold" className="text-sm font-medium text-text-primary">
                            Mic Sensitivity
                        </label>
                        <span className="text-xs text-text-muted">
                            {preference.send_threshold === 0 ? 'Always on' : `${preference.send_threshold}%`}
                        </span>
                    </div>
                    <p className="text-xs text-text-muted mt-0.5 mb-2">
                        {preference.auto_gain_control
                            ? 'Unavailable while Auto Gain Control is on above — turn it off to set a sensitivity threshold.'
                            : 'In a real call, only transmit once your mic level crosses this line — like other voice apps’ input sensitivity. Set to 0 to always transmit.'}
                    </p>
                    <input
                        id="voice-send-threshold"
                        type="range"
                        min={0}
                        max={100}
                        value={preference.send_threshold}
                        disabled={preference.auto_gain_control}
                        onChange={(e) => updateSendThreshold(Number(e.target.value))}
                        className="w-full accent-brand disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                </div>

                <div className="pt-1">
                    <label
                        htmlFor="voice-close-threshold-gap"
                        className="block text-sm font-medium text-text-primary mb-1"
                    >
                        Hysteresis band
                    </label>
                    <p className="text-xs text-text-muted mt-0.5 mb-2">
                        Adds a gap between the level needed to start sending your voice
                        and the level needed to stop — reduces rapid on/off flicker right
                        at the threshold.
                    </p>
                    <select
                        id="voice-close-threshold-gap"
                        value={preference.close_threshold_gap}
                        disabled={preference.auto_gain_control}
                        onChange={(e) => updateCloseThresholdGap(Number(e.target.value))}
                        className="w-full bg-surface-800 border border-surface-400 rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-brand transition-colors duration-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {CLOSE_THRESHOLD_GAP_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                </div>

                <div className="pt-1">
                    <div className="flex items-center justify-between gap-4">
                        <label htmlFor="voice-close-threshold-timeout" className="text-sm font-medium text-text-primary">
                            Close threshold timeout
                        </label>
                        <span className="text-xs text-text-muted">
                            {preference.close_threshold_timeout_ms === null
                                ? 'Off'
                                : `${(preference.close_threshold_timeout_ms / 1000).toFixed(1)}s`}
                        </span>
                    </div>
                    <p className="text-xs text-text-muted mt-0.5 mb-2">
                        Closes your mic if it hasn&apos;t crossed the sensitivity
                        threshold again within this long, even if it's still inside the
                        hysteresis band above — handles continual background noise.
                        Crossing the threshold resets the clock.
                    </p>
                    <input
                        id="voice-close-threshold-timeout"
                        type="range"
                        min={CLOSE_THRESHOLD_TIMEOUT_STEP_MS}
                        max={CLOSE_THRESHOLD_TIMEOUT_OFF_VALUE}
                        step={CLOSE_THRESHOLD_TIMEOUT_STEP_MS}
                        value={preference.close_threshold_timeout_ms ?? CLOSE_THRESHOLD_TIMEOUT_OFF_VALUE}
                        disabled={preference.auto_gain_control}
                        onChange={(e) => updateCloseThresholdTimeout(Number(e.target.value))}
                        className="w-full accent-brand disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                </div>
            </div>
        </div>
    )
}
