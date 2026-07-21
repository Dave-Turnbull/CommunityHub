import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AudioSettings } from '@/components/settings/AudioSettings'
import * as api from '@/services/api'

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

function mockMediaDevices(devices: typeof unlabeledDevices, opts: { withAnalyser?: boolean } = {}) {
    const track = { stop: vi.fn() }
    const stream = { getTracks: () => [track] }
    const getUserMedia = vi.fn().mockResolvedValue(stream)
    const enumerateDevices = vi.fn().mockResolvedValue(devices)
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia, enumerateDevices } })

    if (opts.withAnalyser) {
        const analyser = {
            fftSize: 0,
            getByteTimeDomainData: vi.fn(),
        }
        const audioContext = {
            createAnalyser: vi.fn(() => analyser),
            createMediaStreamSource: vi.fn(() => ({ connect: vi.fn() })),
            close: vi.fn(),
        }
        vi.stubGlobal('AudioContext', vi.fn().mockImplementation(function (this: unknown) {
            return audioContext
        }))
        vi.stubGlobal('requestAnimationFrame', vi.fn())
        vi.stubGlobal('cancelAnimationFrame', vi.fn())
        vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    }

    return { getUserMedia, track }
}

describe('AudioSettings', () => {
    beforeEach(() => {
        vi.mocked(api.fetchVoiceDevicePreference).mockResolvedValue({
            client_id: 'client-1', input_device_id: null, output_device_id: null,
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
            client_id: 'client-1', input_device_id: 'mic-1', output_device_id: null,
        })
        const user = userEvent.setup()
        render(<AudioSettings />)
        await screen.findByText('Built-in Mic')

        await user.selectOptions(screen.getByLabelText('Microphone'), 'mic-1')

        expect(api.updateVoiceDevicePreference).toHaveBeenCalledWith({
            client_id: 'client-1', input_device_id: 'mic-1', output_device_id: null,
        })
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

    it('stopping the test removes the level meter and stops the stream', async () => {
        const { track } = mockMediaDevices(labeledDevices, { withAnalyser: true })
        const user = userEvent.setup()
        render(<AudioSettings />)
        await screen.findByText('Built-in Mic')

        await user.click(screen.getByText('Start Test'))
        await screen.findByRole('progressbar', { name: 'Microphone level' })
        await user.click(screen.getByText('Stop Test'))

        expect(screen.queryByRole('progressbar', { name: 'Microphone level' })).not.toBeInTheDocument()
        expect(track.stop).toHaveBeenCalled()
    })
})
