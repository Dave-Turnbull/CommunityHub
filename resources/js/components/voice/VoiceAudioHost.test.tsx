import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { VoiceAudioHost } from '@/components/voice/VoiceAudioHost'
import { useVoice, useVoiceRoster, useVoiceVolume } from '@/stores'
import type { VoiceParticipant } from '@/types'

vi.mock('@/services/webrtc', () => ({
    getRemoteStream: vi.fn(),
}))

const participant = (userId: string): VoiceParticipant => ({
    userId, displayName: userId, avatarUrl: null, muted: false,
})

function joinCall(roster: VoiceParticipant[], scopeType: 'channel' | 'conversation' = 'channel', scopeId = 'chan-1') {
    useVoiceRoster.setState({ rosters: { [`${scopeType}.${scopeId}`]: roster } })
    useVoice.getState().setScope(scopeType, scopeId, participant('me'))
}

describe('VoiceAudioHost', () => {
    beforeEach(() => {
        useVoice.getState().reset()
        useVoiceRoster.setState({ rosters: {} })
        useVoiceVolume.setState({ volumes: {} })
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    it('renders nothing when not in a call', () => {
        useVoiceRoster.setState({ rosters: { 'channel.chan-1': [participant('peer-1')] } })

        const { container } = render(<VoiceAudioHost />)

        expect(container.querySelectorAll('audio')).toHaveLength(0)
    })

    it('renders one audio element per remote participant of the active call', () => {
        joinCall([participant('me'), participant('peer-1'), participant('peer-2')])

        const { container } = render(<VoiceAudioHost />)

        expect(container.querySelectorAll('audio')).toHaveLength(2)
    })

    it('renders no audio element for the current user', () => {
        joinCall([participant('me')])

        const { container } = render(<VoiceAudioHost />)

        expect(container.querySelectorAll('audio')).toHaveLength(0)
    })

    it('ignores the rosters of scopes other than the active call', () => {
        joinCall([participant('me'), participant('peer-1')])
        useVoiceRoster.setState({
            rosters: {
                'channel.chan-1': [participant('me'), participant('peer-1')],
                'channel.other': [participant('stranger-1'), participant('stranger-2')],
            },
        })

        const { container } = render(<VoiceAudioHost />)

        expect(container.querySelectorAll('audio')).toHaveLength(1)
    })

    it('resolves a conversation call through its own roster key', () => {
        joinCall([participant('me'), participant('peer-1')], 'conversation', 'conv-1')

        const { container } = render(<VoiceAudioHost />)

        expect(container.querySelectorAll('audio')).toHaveLength(1)
    })

    it('applies each participant\'s stored volume, defaulting to 1', () => {
        joinCall([participant('me'), participant('peer-1'), participant('peer-2')])
        useVoiceVolume.getState().setVolume('peer-1', 0.4)

        const { container } = render(<VoiceAudioHost />)

        const [first, second] = Array.from(container.querySelectorAll('audio'))
        expect(first.volume).toBeCloseTo(0.4)
        expect(second.volume).toBe(1)
    })

    it('follows roster changes and unmounts playback once the call ends', () => {
        joinCall([participant('me'), participant('peer-1')])
        const { container } = render(<VoiceAudioHost />)
        expect(container.querySelectorAll('audio')).toHaveLength(1)

        act(() => useVoiceRoster.getState().upsertParticipant('channel.chan-1', participant('peer-2')))
        expect(container.querySelectorAll('audio')).toHaveLength(2)

        act(() => useVoice.getState().reset())
        expect(container.querySelectorAll('audio')).toHaveLength(0)
    })
})
