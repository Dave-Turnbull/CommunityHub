import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { RemoteParticipantAudio } from '@/components/voice/RemoteParticipantAudio'
import { useRemoteStreamVersion, useVoice } from '@/stores'
import * as webrtc from '@/services/webrtc'

vi.mock('@/services/webrtc', () => ({
    getRemoteStream: vi.fn(),
}))

describe('RemoteParticipantAudio', () => {
    beforeEach(() => {
        useRemoteStreamVersion.setState({ version: 0 })
        useVoice.getState().reset()
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    it('attaches the current remote stream to the audio element\'s srcObject', () => {
        const stream = {} as MediaStream
        vi.mocked(webrtc.getRemoteStream).mockReturnValue(stream)

        const { container } = render(<RemoteParticipantAudio userId="peer-1" volume={1} />)

        expect(container.querySelector('audio')?.srcObject).toBe(stream)
    })

    it('sets the audio element\'s volume from the volume prop', () => {
        vi.mocked(webrtc.getRemoteStream).mockReturnValue({} as MediaStream)

        const { container } = render(<RemoteParticipantAudio userId="peer-1" volume={0.4} />)

        expect(container.querySelector('audio')?.volume).toBeCloseTo(0.4)
    })

    it('re-attaches the stream when useRemoteStreamVersion bumps (the stream became available after mount)', () => {
        vi.mocked(webrtc.getRemoteStream).mockReturnValue(undefined)
        const { container, rerender } = render(<RemoteParticipantAudio userId="peer-1" volume={1} />)
        expect(container.querySelector('audio')?.srcObject).toBeNull()

        const stream = {} as MediaStream
        vi.mocked(webrtc.getRemoteStream).mockReturnValue(stream)
        act(() => useRemoteStreamVersion.getState().bump())
        rerender(<RemoteParticipantAudio userId="peer-1" volume={1} />)

        expect(container.querySelector('audio')?.srcObject).toBe(stream)
    })

    it('updates the volume when the prop changes without needing a new stream', () => {
        vi.mocked(webrtc.getRemoteStream).mockReturnValue({} as MediaStream)
        const { container, rerender } = render(<RemoteParticipantAudio userId="peer-1" volume={1} />)

        rerender(<RemoteParticipantAudio userId="peer-1" volume={0.1} />)

        expect(container.querySelector('audio')?.volume).toBeCloseTo(0.1)
    })

    it('silences playback (volume 0) while deafened, without touching the underlying volume prop', () => {
        vi.mocked(webrtc.getRemoteStream).mockReturnValue({} as MediaStream)
        useVoice.getState().setDeafened(true)

        const { container } = render(<RemoteParticipantAudio userId="peer-1" volume={0.8} />)

        expect(container.querySelector('audio')?.volume).toBe(0)
    })

    it('restores the participant\'s own volume once un-deafened', () => {
        vi.mocked(webrtc.getRemoteStream).mockReturnValue({} as MediaStream)
        useVoice.getState().setDeafened(true)
        const { container } = render(<RemoteParticipantAudio userId="peer-1" volume={0.8} />)

        act(() => useVoice.getState().setDeafened(false))

        expect(container.querySelector('audio')?.volume).toBeCloseTo(0.8)
    })

    it('renders a hidden audio element with autoplay', () => {
        vi.mocked(webrtc.getRemoteStream).mockReturnValue({} as MediaStream)

        const { container } = render(<RemoteParticipantAudio userId="peer-1" volume={1} />)

        const audio = container.querySelector('audio')
        expect(audio).toHaveClass('hidden')
        expect(audio).toHaveAttribute('autoplay')
    })

    describe('play()', () => {
        let play: ReturnType<typeof vi.fn<() => Promise<void>>>

        beforeEach(() => {
            play = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
            vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play)
        })

        afterEach(() => {
            vi.restoreAllMocks()
        })

        it('calls play() once a stream is attached', () => {
            vi.mocked(webrtc.getRemoteStream).mockReturnValue({} as MediaStream)

            render(<RemoteParticipantAudio userId="peer-1" volume={1} />)

            expect(play).toHaveBeenCalledTimes(1)
        })

        it('does not call play() while there is no stream yet', () => {
            vi.mocked(webrtc.getRemoteStream).mockReturnValue(undefined)

            render(<RemoteParticipantAudio userId="peer-1" volume={1} />)

            expect(play).not.toHaveBeenCalled()
        })

        it('attaches a catch handler to play() so an autoplay-policy rejection is swallowed', () => {
            const rejection = Promise.reject(new DOMException('blocked', 'NotAllowedError'))
            const catchSpy = vi.spyOn(rejection, 'catch')
            play.mockReturnValue(rejection)
            vi.mocked(webrtc.getRemoteStream).mockReturnValue({} as MediaStream)

            render(<RemoteParticipantAudio userId="peer-1" volume={1} />)

            expect(catchSpy).toHaveBeenCalledTimes(1)
        })
    })
})
