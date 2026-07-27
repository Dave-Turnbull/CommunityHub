import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HybridConversationContent } from '@/components/chat/HybridConversationContent'
import { useVoice } from '@/stores'
import type { Conversation, PaginatedMessages, User } from '@/types'

vi.mock('@/services/echo', () => ({
    subscribe: vi.fn(() => vi.fn()),
}))

vi.mock('@/services/api', () => ({
    fetchChannelMessages: vi.fn(),
    fetchConversationMessages: vi.fn(),
}))

vi.mock('@inertiajs/react', () => ({
    usePage: () => ({ props: { maxUploadSizeBytes: 100 * 1024 * 1024 } }),
}))

vi.mock('@/services/clientId', () => ({
    getClientId: vi.fn(() => 'client-1'),
}))

vi.mock('@/services/webrtc', () => ({
    joinVoice: vi.fn(),
    leaveVoice: vi.fn(),
    setMuted: vi.fn(),
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
    participants: [
        { id: 'p-1', user_id: 'user-1', user: currentUser },
        { id: 'p-2', user_id: 'user-2', user: { ...currentUser, id: 'user-2', display_name: 'Bob' } },
    ],
}

const initial: PaginatedMessages = { data: [], has_older: false, older_cursor: null, has_newer: false, newer_cursor: null }

describe('HybridConversationContent', () => {
    beforeEach(() => {
        useVoice.getState().reset()
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    it('renders the voice bar above the text thread — both Features present, as HybridConversationType grants both', () => {
        render(
            <HybridConversationContent
                conversation={conversation}
                currentUser={currentUser}
                initialMessages={initial}
            />
        )

        expect(screen.getByRole('button', { name: /Join Voice/ })).toBeInTheDocument()
        expect(screen.getByPlaceholderText('Message Bob')).toBeInTheDocument()
    })

    it('shows the beginning-of-conversation empty state naming the other participant', () => {
        render(
            <HybridConversationContent
                conversation={conversation}
                currentUser={currentUser}
                initialMessages={initial}
            />
        )

        expect(screen.getByText(/beginning of your conversation with Bob/)).toBeInTheDocument()
    })
})
