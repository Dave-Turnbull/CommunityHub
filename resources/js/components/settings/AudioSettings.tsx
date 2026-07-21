import { useEffect, useRef, useState } from 'react'
import { fetchVoiceDevicePreference, updateVoiceDevicePreference } from '@/services/api'
import { getClientId } from '@/services/clientId'
import type { VoiceDevicePreference } from '@/types'

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
        fetchVoiceDevicePreference(getClientId()).then(setPreference)
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

    async function startTest() {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: preference?.input_device_id ? { deviceId: { exact: preference.input_device_id } } : true,
        })
        streamRef.current = stream

        const context = new AudioContext()
        audioContextRef.current = context
        const analyser = context.createAnalyser()
        analyser.fftSize = 512
        context.createMediaStreamSource(stream).connect(analyser)

        const data = new Uint8Array(analyser.fftSize)
        const tick = () => {
            analyser.getByteTimeDomainData(data)
            const rms = Math.sqrt(
                Array.from(data).reduce((sum, v) => sum + ((v - 128) / 128) ** 2, 0) / data.length
            )
            setLevel(Math.min(1, rms * 4))
            rafRef.current = requestAnimationFrame(tick)
        }
        tick()

        const audioEl = audioElRef.current
        if (audioEl) {
            audioEl.srcObject = stream
            audioEl.muted = false
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

                {isTesting && (
                    <div
                        role="progressbar"
                        aria-label="Microphone level"
                        aria-valuenow={Math.round(level * 100)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        className="h-2 w-full rounded-full bg-surface-500 overflow-hidden"
                    >
                        <div
                            className="h-full bg-success transition-[width] duration-75"
                            style={{ width: `${Math.round(level * 100)}%` }}
                        />
                    </div>
                )}

                {/* Hidden — this is the mic-loopback element, not a UI control. */}
                <audio ref={audioElRef} className="hidden" />
            </div>
        </div>
    )
}
