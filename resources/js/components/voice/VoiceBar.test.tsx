import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VoiceBar } from '@/components/voice/VoiceBar'
import { useVoice, useVoiceRoster, useSpeaking } from '@/stores'
import type { Conversation, User } from '@/types'

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

const conversation: Conversation = {
    id: 'conv-1', type: 'dm', name: null, icon_url: null, unread_count: 0, voice_mode: 'auto',
}

describe('VoiceBar', () => {
    beforeEach(() => {
        useVoice.getState().reset()
        useVoiceRoster.setState({ rosters: {} })
        useSpeaking.setState({ speaking: {} })
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    it('shows a Join Voice button when not connected', () => {
        render(<VoiceBar conversation={conversation} currentUser={currentUser} />)

        expect(screen.getByText('🎙️ Join Voice')).toBeInTheDocument()
    })

    it('rings a participant\'s avatar while useSpeaking reports them as speaking', () => {
        useVoice.setState({ scopeId: 'conv-1' })
        useVoiceRoster.getState().setRoster('conversation.conv-1', [
            { userId: 'user-2', displayName: 'Bob', avatarUrl: 'https://example.test/bob.png', muted: false },
        ])
        useSpeaking.getState().setSpeaking('user-2', true)

        render(<VoiceBar conversation={conversation} currentUser={currentUser} />)

        expect(screen.getByAltText('Bob').parentElement?.className).toMatch(/ring-2/)
    })

    it('does not ring a participant\'s avatar while they are not speaking', () => {
        useVoice.setState({ scopeId: 'conv-1' })
        useVoiceRoster.getState().setRoster('conversation.conv-1', [
            { userId: 'user-2', displayName: 'Bob', avatarUrl: 'https://example.test/bob.png', muted: false },
        ])

        render(<VoiceBar conversation={conversation} currentUser={currentUser} />)

        expect(screen.getByAltText('Bob').parentElement?.className).not.toMatch(/ring-2/)
    })

    it('clicking Deafen toggles the deafened store state and label', async () => {
        useVoice.setState({ scopeId: 'conv-1', deafened: false })
        const user = userEvent.setup()
        render(<VoiceBar conversation={conversation} currentUser={currentUser} />)

        await user.click(screen.getByText('Deafen'))

        expect(useVoice.getState().deafened).toBe(true)
        expect(screen.getByText('Undeafen')).toBeInTheDocument()
    })
})
