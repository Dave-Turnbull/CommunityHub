import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VoiceChannelPanel } from '@/components/voice/VoiceChannelPanel'
import { useVoice, useVoiceRoster, useSpeaking } from '@/stores'
import type { Channel, User } from '@/types'

vi.mock('@/services/clientId', () => ({
    getClientId: vi.fn(() => 'client-1'),
}))

vi.mock('@/services/api', () => ({
    fetchVoiceDevicePreference: vi.fn().mockResolvedValue({
        client_id: 'client-1', input_device_id: null, output_device_id: null, send_threshold: 0,
    }),
}))

vi.mock('@/services/webrtc', () => ({
    joinVoice: vi.fn(),
    leaveVoice: vi.fn(),
    setMuted: vi.fn(),
    getRemoteStream: vi.fn(),
}))

vi.mock('@/services/voicePresence', () => ({
    rosterKey: (scopeType: string, scopeId: string) => `${scopeType}.${scopeId}`,
    subscribeVoiceRoster: vi.fn(() => ({ channel: {}, leave: vi.fn() })),
}))

const currentUser: User = {
    id: 'user-1', username: 'alice', display_name: 'Alice', avatar_url: null, status: 'online',
}

const channel: Channel = {
    id: 'chan-1', room_id: 'room-1', name: 'Voice Chat', type: 'voice', topic: null, position: 0,
    voice_mode: 'auto', settings: null,
}

describe('VoiceChannelPanel', () => {
    beforeEach(() => {
        useVoice.getState().reset()
        useVoiceRoster.setState({ rosters: {} })
        useSpeaking.setState({ speaking: {} })
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    it('shows a Join Voice button when not connected', () => {
        render(<VoiceChannelPanel channel={channel} currentUser={currentUser} />)

        expect(screen.getByText('Join Voice')).toBeInTheDocument()
    })

    it('renders every other participant while active', () => {
        useVoice.setState({ scopeId: 'chan-1' })
        useVoiceRoster.getState().setRoster('channel.chan-1', [
            { userId: 'user-2', displayName: 'Bob', avatarUrl: null, muted: false },
        ])

        render(<VoiceChannelPanel channel={channel} currentUser={currentUser} />)

        expect(screen.getByText('Bob')).toBeInTheDocument()
    })

    it('rings a participant\'s avatar while useSpeaking reports them as speaking', () => {
        useVoice.setState({ scopeId: 'chan-1' })
        useVoiceRoster.getState().setRoster('channel.chan-1', [
            { userId: 'user-2', displayName: 'Bob', avatarUrl: 'https://example.test/bob.png', muted: false },
        ])
        useSpeaking.getState().setSpeaking('user-2', true)

        render(<VoiceChannelPanel channel={channel} currentUser={currentUser} />)

        expect(screen.getByAltText('Bob').parentElement?.className).toMatch(/ring-2/)
    })

    it('does not ring a participant\'s avatar while they are not speaking', () => {
        useVoice.setState({ scopeId: 'chan-1' })
        useVoiceRoster.getState().setRoster('channel.chan-1', [
            { userId: 'user-2', displayName: 'Bob', avatarUrl: 'https://example.test/bob.png', muted: false },
        ])

        render(<VoiceChannelPanel channel={channel} currentUser={currentUser} />)

        expect(screen.getByAltText('Bob').parentElement?.className).not.toMatch(/ring-2/)
    })

    it('clicking Deafen toggles the deafened store state and label', async () => {
        useVoice.setState({ scopeId: 'chan-1', deafened: false })
        const user = userEvent.setup()
        render(<VoiceChannelPanel channel={channel} currentUser={currentUser} />)

        await user.click(screen.getByText('Deafen'))

        expect(useVoice.getState().deafened).toBe(true)
        expect(screen.getByText('Undeafen')).toBeInTheDocument()
    })
})
