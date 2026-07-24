import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AudioSettings } from '@/components/settings/AudioSettings'
import { useMicSensitivity } from '@/stores'
import * as api from '@/services/api'

// A square wave whose RMS equals `amplitude` (0..1) — matches
// voiceActivation.test.ts's fixture approach, so a chosen amplitude maps to a
// predictable computeLevel() reading.
function writeSquareWave(data: Uint8Array, amplitude: number): void {
    const swing = Math.round(amplitude * 128)
    for (let i = 0; i < data.length; i++) {
        data[i] = i % 2 === 0 ? 128 + swing : 128 - swing
    }
}

vi.mock('@/services/clientId', () => ({
    getClientId: vi.fn(() => 'client-1'),
}))

vi.mock('@/services/api', () => ({
    fetchVoiceDevicePreference: vi.fn(),
    updateVoiceDevicePreference: vi.fn(),
}))

const unlabeledDevices = [
    { kind: 'audioinput', deviceId: 'mic-1', label: '' },
    { kind: 'audiooutput', deviceId: 'speaker-1', label: '' },
]

const labeledDevices = [
    { kind: 'audioinput', deviceId: 'mic-1', label: 'Built-in Mic' },
    { kind: 'audiooutput', deviceId: 'speaker-1', label: 'Built-in Speaker' },
]

function mockMediaDevices(
    devices: typeof unlabeledDevices,
    opts: { withAnalyser?: boolean; amplitude?: number; amplitudes?: number[] } = {}
) {
    const track = { stop: vi.fn() }
    const stream = { getTracks: () => [track] }
    const getUserMedia = vi.fn().mockResolvedValue(stream)
    const enumerateDevices = vi.fn().mockResolvedValue(devices)
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia, enumerateDevices } })

    let nextFrame = (_timestamp?: number) => {}

    if (opts.withAnalyser) {
        let call = 0
        const amplitudes = opts.amplitudes ?? [opts.amplitude ?? 0.9]
        const analyser = {
            fftSize: 0,
            getByteTimeDomainData: vi.fn((data: Uint8Array) => {
                writeSquareWave(data, amplitudes[Math.min(call, amplitudes.length - 1)])
                call += 1
            }),
        }
        const audioContext = {
            createAnalyser: vi.fn(() => analyser),
            createMediaStreamSource: vi.fn(() => ({ connect: vi.fn() })),
            close: vi.fn(),
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
        vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)

        nextFrame = (timestamp) => rafCallbacks.shift()?.(timestamp)
    }

    return { getUserMedia, track, nextFrame }
}

describe('AudioSettings', () => {
    beforeEach(() => {
        useMicSensitivity.setState({ threshold: 0, closeGap: 0, timeoutMs: 2000, autoGainControl: false })
        vi.mocked(api.fetchVoiceDevicePreference).mockResolvedValue({
            client_id: 'client-1', input_device_id: null, output_device_id: null, send_threshold: 0, close_threshold_gap: 0, close_threshold_timeout_ms: 2000, echo_cancellation: true, noise_suppression: true, auto_gain_control: false,
        })
    })

    afterEach(() => {
        vi.clearAllMocks()
        vi.unstubAllGlobals()
    })

    it('shows a grant-access prompt but still renders the device pickers when labels are blank', async () => {
        mockMediaDevices(unlabeledDevices)

        render(<AudioSettings />)

        expect(await screen.findByText('Grant microphone access to see your device names.')).toBeInTheDocument()
        expect(screen.getByLabelText('Microphone')).toBeInTheDocument()
        expect(screen.getByLabelText('Speaker')).toBeInTheDocument()
    })

    it('does not gate the device pickers behind a test/permission button when labels are already available', async () => {
        mockMediaDevices(labeledDevices)

        render(<AudioSettings />)

        expect(await screen.findByText('Built-in Mic')).toBeInTheDocument()
        expect(screen.getByText('Built-in Speaker')).toBeInTheDocument()
        expect(screen.queryByText('Grant microphone access to see your device names.')).not.toBeInTheDocument()
    })

    it('granting access unlocks real device labels', async () => {
        const { getUserMedia } = mockMediaDevices(unlabeledDevices)
        const user = userEvent.setup()
        render(<AudioSettings />)
        await screen.findByText('Grant Access')

        getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] })
        vi.mocked(api.fetchVoiceDevicePreference)
        const enumerateDevices = navigator.mediaDevices.enumerateDevices as ReturnType<typeof vi.fn>
        enumerateDevices.mockResolvedValue(labeledDevices)

        await user.click(screen.getByText('Grant Access'))

        expect(await screen.findByText('Built-in Mic')).toBeInTheDocument()
    })

    it('picking a microphone persists it via the API for this client', async () => {
        mockMediaDevices(labeledDevices)
        vi.mocked(api.updateVoiceDevicePreference).mockResolvedValue({
            client_id: 'client-1', input_device_id: 'mic-1', output_device_id: null, send_threshold: 0, close_threshold_gap: 0, close_threshold_timeout_ms: 2000, echo_cancellation: true, noise_suppression: true, auto_gain_control: false,
        })
        const user = userEvent.setup()
        render(<AudioSettings />)
        await screen.findByText('Built-in Mic')

        await user.selectOptions(screen.getByLabelText('Microphone'), 'mic-1')

        expect(api.updateVoiceDevicePreference).toHaveBeenCalledWith({
            client_id: 'client-1', input_device_id: 'mic-1', output_device_id: null, send_threshold: 0, close_threshold_gap: 0, close_threshold_timeout_ms: 2000, echo_cancellation: true, noise_suppression: true, auto_gain_control: false,
        })
    })

    it('renders the mic sensitivity slider at the stored threshold', async () => {
        vi.mocked(api.fetchVoiceDevicePreference).mockResolvedValue({
            client_id: 'client-1', input_device_id: null, output_device_id: null, send_threshold: 25, close_threshold_gap: 0, close_threshold_timeout_ms: 2000, echo_cancellation: true, noise_suppression: true, auto_gain_control: false,
        })
        mockMediaDevices(labeledDevices)

        render(<AudioSettings />)

        expect(await screen.findByLabelText('Mic Sensitivity')).toHaveValue('25')
        expect(screen.getByText('25%')).toBeInTheDocument()
    })

    it('moving the sensitivity slider persists the new threshold', async () => {
        mockMediaDevices(labeledDevices)
        vi.mocked(api.updateVoiceDevicePreference).mockResolvedValue({
            client_id: 'client-1', input_device_id: null, output_device_id: null, send_threshold: 60, close_threshold_gap: 0, close_threshold_timeout_ms: 2000, echo_cancellation: true, noise_suppression: true, auto_gain_control: false,
        })
        render(<AudioSettings />)
        await screen.findByLabelText('Mic Sensitivity')

        fireEvent.change(screen.getByLabelText('Mic Sensitivity'), { target: { value: '60' } })

        expect(api.updateVoiceDevicePreference).toHaveBeenCalledWith(
            expect.objectContaining({ send_threshold: 60 })
        )
    })

    it('seeds the live useMicSensitivity store from the fetched preference on load', async () => {
        vi.mocked(api.fetchVoiceDevicePreference).mockResolvedValue({
            client_id: 'client-1', input_device_id: null, output_device_id: null, send_threshold: 33, close_threshold_gap: 0, close_threshold_timeout_ms: 2000, echo_cancellation: true, noise_suppression: true, auto_gain_control: false,
        })
        mockMediaDevices(labeledDevices)

        render(<AudioSettings />)

        await screen.findByLabelText('Mic Sensitivity')
        expect(useMicSensitivity.getState().threshold).toBe(33)
    })

    it('moving the sensitivity slider updates the live useMicSensitivity store immediately', async () => {
        mockMediaDevices(labeledDevices)
        render(<AudioSettings />)
        await screen.findByLabelText('Mic Sensitivity')

        fireEvent.change(screen.getByLabelText('Mic Sensitivity'), { target: { value: '60' } })

        expect(useMicSensitivity.getState().threshold).toBe(60)
    })

    it('a threshold of 0 is labeled "Always on" instead of "0%"', async () => {
        mockMediaDevices(labeledDevices)

        render(<AudioSettings />)

        expect(await screen.findByText('Always on')).toBeInTheDocument()
    })

    it('starting the microphone test shows a live level meter', async () => {
        mockMediaDevices(labeledDevices, { withAnalyser: true })
        const user = userEvent.setup()
        render(<AudioSettings />)
        await screen.findByText('Built-in Mic')

        await user.click(screen.getByText('Start Test'))

        expect(await screen.findByRole('progressbar', { name: 'Microphone level' })).toBeInTheDocument()
        expect(screen.getByText('Stop Test')).toBeInTheDocument()
    })

    it('requests explicit echoCancellation/noiseSuppression constraints for the mic test, with autoGainControl deliberately off', async () => {
        const { getUserMedia } = mockMediaDevices(labeledDevices, { withAnalyser: true })
        const user = userEvent.setup()
        render(<AudioSettings />)
        await screen.findByText('Built-in Mic')

        await user.click(screen.getByText('Start Test'))

        expect(getUserMedia).toHaveBeenCalledWith({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
        })
    })

    it('stopping the test resets the level meter to 0 (it stays visible as a dummy meter) and stops the stream', async () => {
        const { track } = mockMediaDevices(labeledDevices, { withAnalyser: true })
        const user = userEvent.setup()
        render(<AudioSettings />)
        await screen.findByText('Built-in Mic')

        await user.click(screen.getByText('Start Test'))
        await screen.findByRole('progressbar', { name: 'Microphone level' })
        await user.click(screen.getByText('Stop Test'))

        expect(screen.getByRole('progressbar', { name: 'Microphone level' })).toHaveAttribute('aria-valuenow', '0')
        expect(track.stop).toHaveBeenCalled()
    })

    it('renders the level meter even before starting a test (a dummy meter, so threshold markers stay visible)', async () => {
        mockMediaDevices(labeledDevices)

        render(<AudioSettings />)
        await screen.findByText('Built-in Mic')

        expect(screen.getByRole('progressbar', { name: 'Microphone level' })).toHaveAttribute('aria-valuenow', '0')
        expect(screen.getByText('Start Test')).toBeInTheDocument()
    })

    // The loopback test actually gating on the threshold is what makes the
    // sensitivity slider demonstrable at all — previously the marker line was
    // purely cosmetic and moving the slider had zero effect on what played
    // back through the speaker.
    it('mutes the loopback when the live level is below the sensitivity threshold', async () => {
        vi.mocked(api.fetchVoiceDevicePreference).mockResolvedValue({
            client_id: 'client-1', input_device_id: null, output_device_id: null, send_threshold: 50, close_threshold_gap: 0, close_threshold_timeout_ms: 2000, echo_cancellation: true, noise_suppression: true, auto_gain_control: false,
        })
        mockMediaDevices(labeledDevices, { withAnalyser: true, amplitude: 0.001 })
        const user = userEvent.setup()
        const { container } = render(<AudioSettings />)
        await screen.findByText('Built-in Mic')

        await user.click(screen.getByText('Start Test'))

        expect(container.querySelector('audio')?.muted).toBe(true)
    })

    it('does not mute the loopback when the live level is above the sensitivity threshold', async () => {
        vi.mocked(api.fetchVoiceDevicePreference).mockResolvedValue({
            client_id: 'client-1', input_device_id: null, output_device_id: null, send_threshold: 20, close_threshold_gap: 0, close_threshold_timeout_ms: 2000, echo_cancellation: true, noise_suppression: true, auto_gain_control: false,
        })
        mockMediaDevices(labeledDevices, { withAnalyser: true, amplitude: 0.9 })
        const user = userEvent.setup()
        const { container } = render(<AudioSettings />)
        await screen.findByText('Built-in Mic')

        await user.click(screen.getByText('Start Test'))

        expect(container.querySelector('audio')?.muted).toBe(false)
    })

    it('never mutes the loopback when sensitivity is 0 (always-on), regardless of level', async () => {
        mockMediaDevices(labeledDevices, { withAnalyser: true, amplitude: 0.0001 })
        const user = userEvent.setup()
        const { container } = render(<AudioSettings />)
        await screen.findByText('Built-in Mic')

        await user.click(screen.getByText('Start Test'))

        expect(container.querySelector('audio')?.muted).toBe(false)
    })

    it('un-mutes the loopback immediately when the sensitivity slider is lowered mid-test, without restarting', async () => {
        vi.mocked(api.fetchVoiceDevicePreference).mockResolvedValue({
            client_id: 'client-1', input_device_id: null, output_device_id: null, send_threshold: 50, close_threshold_gap: 0, close_threshold_timeout_ms: 2000, echo_cancellation: true, noise_suppression: true, auto_gain_control: false,
        })
        const { nextFrame } = mockMediaDevices(labeledDevices, { withAnalyser: true, amplitude: 0.001 })
        const user = userEvent.setup()
        const { container } = render(<AudioSettings />)
        await screen.findByText('Built-in Mic')
        await user.click(screen.getByText('Start Test'))
        expect(container.querySelector('audio')?.muted).toBe(true)

        fireEvent.change(screen.getByLabelText('Mic Sensitivity'), { target: { value: '0' } })
        act(() => nextFrame())

        expect(container.querySelector('audio')?.muted).toBe(false)
    })

    it('renders the three audio-processing toggles at their stored values', async () => {
        vi.mocked(api.fetchVoiceDevicePreference).mockResolvedValue({
            client_id: 'client-1', input_device_id: null, output_device_id: null, send_threshold: 0, close_threshold_gap: 0, close_threshold_timeout_ms: 2000,
            echo_cancellation: false, noise_suppression: true, auto_gain_control: false,
        })
        mockMediaDevices(labeledDevices)

        render(<AudioSettings />)
        await screen.findByText('Built-in Mic')

        expect(screen.getByLabelText('Echo Cancellation')).toHaveAttribute('aria-checked', 'false')
        expect(screen.getByLabelText('Noise Suppression')).toHaveAttribute('aria-checked', 'true')
        expect(screen.getByLabelText('Auto Gain Control')).toHaveAttribute('aria-checked', 'false')
    })

    it('toggling echo cancellation persists the new value', async () => {
        mockMediaDevices(labeledDevices)
        vi.mocked(api.updateVoiceDevicePreference).mockResolvedValue({
            client_id: 'client-1', input_device_id: null, output_device_id: null, send_threshold: 0, close_threshold_gap: 0, close_threshold_timeout_ms: 2000,
            echo_cancellation: false, noise_suppression: true, auto_gain_control: false,
        })
        const user = userEvent.setup()
        render(<AudioSettings />)
        await screen.findByText('Built-in Mic')

        await user.click(screen.getByLabelText('Echo Cancellation'))

        expect(api.updateVoiceDevicePreference).toHaveBeenCalledWith(
            expect.objectContaining({ echo_cancellation: false })
        )
    })

    it('requests the stored processing toggles (not hardcoded values) for the mic test', async () => {
        vi.mocked(api.fetchVoiceDevicePreference).mockResolvedValue({
            client_id: 'client-1', input_device_id: null, output_device_id: null, send_threshold: 0, close_threshold_gap: 0, close_threshold_timeout_ms: 2000,
            echo_cancellation: false, noise_suppression: false, auto_gain_control: true,
        })
        const { getUserMedia } = mockMediaDevices(labeledDevices, { withAnalyser: true })
        const user = userEvent.setup()
        render(<AudioSettings />)
        await screen.findByText('Built-in Mic')

        await user.click(screen.getByText('Start Test'))

        expect(getUserMedia).toHaveBeenCalledWith({
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
        })
    })

    it('turning on Auto Gain Control disables the sensitivity slider without changing its stored value', async () => {
        vi.mocked(api.fetchVoiceDevicePreference).mockResolvedValue({
            client_id: 'client-1', input_device_id: null, output_device_id: null, send_threshold: 40, close_threshold_gap: 0, close_threshold_timeout_ms: 2000,
            echo_cancellation: true, noise_suppression: true, auto_gain_control: false,
        })
        mockMediaDevices(labeledDevices)
        vi.mocked(api.updateVoiceDevicePreference).mockResolvedValue({
            client_id: 'client-1', input_device_id: null, output_device_id: null, send_threshold: 40, close_threshold_gap: 0, close_threshold_timeout_ms: 2000,
            echo_cancellation: true, noise_suppression: true, auto_gain_control: true,
        })
        const user = userEvent.setup()
        render(<AudioSettings />)
        await screen.findByText('Built-in Mic')
        expect(screen.getByLabelText('Mic Sensitivity')).toHaveValue('40')

        await user.click(screen.getByLabelText('Auto Gain Control'))

        expect(screen.getByLabelText('Mic Sensitivity')).toBeDisabled()
        // The underlying value is left exactly as it was — see the next test
        // for confirming it's what's actually used again once AGC turns off.
        expect(screen.getByLabelText('Mic Sensitivity')).toHaveValue('40')
        expect(useMicSensitivity.getState().threshold).toBe(40)
        expect(api.updateVoiceDevicePreference).toHaveBeenCalledWith(
            expect.objectContaining({ auto_gain_control: true, send_threshold: 40 })
        )
    })

    it('turning on Auto Gain Control collapses the live effective threshold to always-on', async () => {
        vi.mocked(api.fetchVoiceDevicePreference).mockResolvedValue({
            client_id: 'client-1', input_device_id: null, output_device_id: null, send_threshold: 40, close_threshold_gap: 0, close_threshold_timeout_ms: 2000,
            echo_cancellation: true, noise_suppression: true, auto_gain_control: false,
        })
        mockMediaDevices(labeledDevices)
        const user = userEvent.setup()
        render(<AudioSettings />)
        await screen.findByText('Built-in Mic')

        await user.click(screen.getByLabelText('Auto Gain Control'))

        expect(useMicSensitivity.getState().autoGainControl).toBe(true)
        expect(useMicSensitivity.getState().threshold).toBe(40)
    })

    it('the sensitivity slider re-enables with its original value once Auto Gain Control is turned back off', async () => {
        vi.mocked(api.fetchVoiceDevicePreference).mockResolvedValue({
            client_id: 'client-1', input_device_id: null, output_device_id: null, send_threshold: 40, close_threshold_gap: 0, close_threshold_timeout_ms: 2000,
            echo_cancellation: true, noise_suppression: true, auto_gain_control: true,
        })
        mockMediaDevices(labeledDevices)
        vi.mocked(api.updateVoiceDevicePreference).mockResolvedValue({
            client_id: 'client-1', input_device_id: null, output_device_id: null, send_threshold: 40, close_threshold_gap: 0, close_threshold_timeout_ms: 2000,
            echo_cancellation: true, noise_suppression: true, auto_gain_control: false,
        })
        const user = userEvent.setup()
        render(<AudioSettings />)
        await screen.findByText('Built-in Mic')
        expect(screen.getByLabelText('Mic Sensitivity')).toBeDisabled()
        expect(screen.getByLabelText('Mic Sensitivity')).toHaveValue('40')

        await user.click(screen.getByLabelText('Auto Gain Control'))

        expect(screen.getByLabelText('Mic Sensitivity')).not.toBeDisabled()
        expect(screen.getByLabelText('Mic Sensitivity')).toHaveValue('40')
        expect(useMicSensitivity.getState().autoGainControl).toBe(false)
    })

    it('renders the Hysteresis band select with named options, not percentages', async () => {
        mockMediaDevices(labeledDevices)

        render(<AudioSettings />)
        await screen.findByText('Built-in Mic')

        const select = screen.getByLabelText('Hysteresis band')
        const optionLabels = Array.from(select.querySelectorAll('option')).map((o) => o.textContent)
        expect(optionLabels).toEqual(['Large', 'Medium', 'Small', 'Off'])
        expect(screen.queryByText('30%')).not.toBeInTheDocument()
    })

    it('defaults the Hysteresis band select to Off', async () => {
        mockMediaDevices(labeledDevices)

        render(<AudioSettings />)
        await screen.findByText('Built-in Mic')

        expect(screen.getByLabelText('Hysteresis band')).toHaveValue('0')
    })

    it('selecting a Hysteresis band option persists the corresponding gap value', async () => {
        mockMediaDevices(labeledDevices)
        vi.mocked(api.updateVoiceDevicePreference).mockResolvedValue({
            client_id: 'client-1', input_device_id: null, output_device_id: null, send_threshold: 0, close_threshold_gap: 30, close_threshold_timeout_ms: 2000,
            echo_cancellation: true, noise_suppression: true, auto_gain_control: false,
        })
        render(<AudioSettings />)
        await screen.findByText('Built-in Mic')

        fireEvent.change(screen.getByLabelText('Hysteresis band'), { target: { value: '30' } })

        expect(api.updateVoiceDevicePreference).toHaveBeenCalledWith(
            expect.objectContaining({ close_threshold_gap: 30 })
        )
        expect(useMicSensitivity.getState().closeGap).toBe(30)
    })

    it('disables the Hysteresis band select while Auto Gain Control is on', async () => {
        vi.mocked(api.fetchVoiceDevicePreference).mockResolvedValue({
            client_id: 'client-1', input_device_id: null, output_device_id: null, send_threshold: 0, close_threshold_gap: 0, close_threshold_timeout_ms: 2000,
            echo_cancellation: true, noise_suppression: true, auto_gain_control: true,
        })
        mockMediaDevices(labeledDevices)

        render(<AudioSettings />)
        await screen.findByText('Built-in Mic')

        expect(screen.getByLabelText('Hysteresis band')).toBeDisabled()
    })

    it('renders the hysteresis band on the meter spanning from the close threshold to the sensitivity threshold', async () => {
        vi.mocked(api.fetchVoiceDevicePreference).mockResolvedValue({
            client_id: 'client-1', input_device_id: null, output_device_id: null, send_threshold: 50, close_threshold_gap: 20, close_threshold_timeout_ms: 2000,
            echo_cancellation: true, noise_suppression: true, auto_gain_control: false,
        })
        mockMediaDevices(labeledDevices, { withAnalyser: true })
        const user = userEvent.setup()
        const { container } = render(<AudioSettings />)
        await screen.findByText('Built-in Mic')

        await user.click(screen.getByText('Start Test'))

        const band = container.querySelector('[aria-hidden]') as HTMLElement
        expect(band.style.left).toBe('30%')
        expect(band.style.width).toBe('20%')
    })

    it('hides the threshold marker on the meter while Auto Gain Control is on', async () => {
        vi.mocked(api.fetchVoiceDevicePreference).mockResolvedValue({
            client_id: 'client-1', input_device_id: null, output_device_id: null, send_threshold: 50, close_threshold_gap: 20, close_threshold_timeout_ms: 2000,
            echo_cancellation: true, noise_suppression: true, auto_gain_control: true,
        })
        mockMediaDevices(labeledDevices)
        const { container } = render(<AudioSettings />)
        await screen.findByText('Built-in Mic')

        expect(container.querySelector('[aria-hidden]')).not.toBeInTheDocument()
    })

    it('renders the close threshold timeout slider, defaulting to 2.0s', async () => {
        mockMediaDevices(labeledDevices)

        render(<AudioSettings />)
        await screen.findByText('Built-in Mic')

        expect(screen.getByLabelText('Close threshold timeout')).toHaveValue('2000')
        expect(screen.getByText('2.0s')).toBeInTheDocument()
    })

    it('moving the close threshold timeout slider to its maximum persists "Off" (null)', async () => {
        mockMediaDevices(labeledDevices)
        vi.mocked(api.updateVoiceDevicePreference).mockResolvedValue({
            client_id: 'client-1', input_device_id: null, output_device_id: null, send_threshold: 0, close_threshold_gap: 0, close_threshold_timeout_ms: null,
            echo_cancellation: true, noise_suppression: true, auto_gain_control: false,
        })
        render(<AudioSettings />)
        await screen.findByLabelText('Close threshold timeout')

        fireEvent.change(screen.getByLabelText('Close threshold timeout'), { target: { value: '5500' } })

        expect(api.updateVoiceDevicePreference).toHaveBeenCalledWith(
            expect.objectContaining({ close_threshold_timeout_ms: null })
        )
        expect(useMicSensitivity.getState().timeoutMs).toBeNull()
        expect(screen.getByLabelText('Close threshold timeout').parentElement?.querySelector('span')).toHaveTextContent('Off')
    })

    it('moving the close threshold timeout slider to a real value persists it in milliseconds', async () => {
        mockMediaDevices(labeledDevices)
        vi.mocked(api.updateVoiceDevicePreference).mockResolvedValue({
            client_id: 'client-1', input_device_id: null, output_device_id: null, send_threshold: 0, close_threshold_gap: 0, close_threshold_timeout_ms: 1500,
            echo_cancellation: true, noise_suppression: true, auto_gain_control: false,
        })
        render(<AudioSettings />)
        await screen.findByLabelText('Close threshold timeout')

        fireEvent.change(screen.getByLabelText('Close threshold timeout'), { target: { value: '1500' } })

        expect(api.updateVoiceDevicePreference).toHaveBeenCalledWith(
            expect.objectContaining({ close_threshold_timeout_ms: 1500 })
        )
        expect(useMicSensitivity.getState().timeoutMs).toBe(1500)
    })

    it('disables the close threshold timeout slider while Auto Gain Control is on', async () => {
        vi.mocked(api.fetchVoiceDevicePreference).mockResolvedValue({
            client_id: 'client-1', input_device_id: null, output_device_id: null, send_threshold: 0, close_threshold_gap: 0, close_threshold_timeout_ms: 2000,
            echo_cancellation: true, noise_suppression: true, auto_gain_control: true,
        })
        mockMediaDevices(labeledDevices)

        render(<AudioSettings />)
        await screen.findByText('Built-in Mic')

        expect(screen.getByLabelText('Close threshold timeout')).toBeDisabled()
    })

    it('the meter holds a brief spike for a moment instead of instantly collapsing to the next quiet reading (peak hold)', async () => {
        const { nextFrame } = mockMediaDevices(labeledDevices, { withAnalyser: true, amplitudes: [0.9, 0.0001] })
        const user = userEvent.setup()
        render(<AudioSettings />)
        await screen.findByText('Built-in Mic')

        await user.click(screen.getByText('Start Test'))
        const meter = screen.getByRole('progressbar', { name: 'Microphone level' })
        expect(Number(meter.getAttribute('aria-valuenow'))).toBeGreaterThan(70)

        act(() => nextFrame(0)) // baseline
        act(() => nextFrame(10)) // 10ms later, now reading near-silence

        // Still visibly elevated — a linear/instant-only meter would have
        // dropped to ~0 on this very next frame.
        expect(Number(meter.getAttribute('aria-valuenow'))).toBeGreaterThan(50)
    })
})
