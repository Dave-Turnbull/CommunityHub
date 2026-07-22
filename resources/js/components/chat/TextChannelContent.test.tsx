import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TextChannelContent } from '@/components/chat/TextChannelContent'
import * as echo from '@/services/echo'
import type { PaginatedMessages, User } from '@/types'

vi.mock('@/services/echo', () => ({
    subscribe: vi.fn(() => vi.fn()),
}))

vi.mock('@/services/api', () => ({
    fetchChannelMessages: vi.fn(),
    fetchConversationMessages: vi.fn(),
}))

const user: User = {
    id: 'user-1', username: 'alice', display_name: 'Alice', avatar_url: null, status: 'online',
}

const initial: PaginatedMessages = { data: [], has_more: false, next_cursor: null }

describe('TextChannelContent', () => {
    afterEach(() => {
        vi.clearAllMocks()
    })

    it('subscribes to the given scope and renders the input with the given placeholder', () => {
        render(
            <TextChannelContent
                scopeId="chan-1"
                scopeType="channel"
                currentUser={user}
                initialMessages={initial}
                placeholder="Message #general"
                emptyState={<div>Empty</div>}
            />
        )

        expect(echo.subscribe).toHaveBeenCalledWith('chan-1', 'channel')
        expect(screen.getByPlaceholderText('Message #general')).toBeInTheDocument()
    })

    it('works the same way for a conversation scope', () => {
        render(
            <TextChannelContent
                scopeId="conv-1"
                scopeType="conversation"
                currentUser={user}
                initialMessages={initial}
                placeholder="Message Bob"
                emptyState={<div>Empty</div>}
            />
        )

        expect(echo.subscribe).toHaveBeenCalledWith('conv-1', 'conversation')
        expect(screen.getByPlaceholderText('Message Bob')).toBeInTheDocument()
    })

    it('shows the empty state when there are no messages', () => {
        render(
            <TextChannelContent
                scopeId="chan-1"
                scopeType="channel"
                currentUser={user}
                initialMessages={initial}
                placeholder="Message #general"
                emptyState={<div>Nothing here yet</div>}
            />
        )

        expect(screen.getByText('Nothing here yet')).toBeInTheDocument()
    })
})
