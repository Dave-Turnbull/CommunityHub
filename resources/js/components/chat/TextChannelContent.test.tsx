import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TextChannelContent } from '@/components/chat/TextChannelContent'
import * as api from '@/services/api'
import * as echo from '@/services/echo'
import { useMessages } from '@/stores'
import { createMemoryDriver, setMessageCacheDriver } from '@/services/messageCache'
import type { Message, PaginatedMessages, User } from '@/types'

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

const initial: PaginatedMessages = { data: [], has_older: false, older_cursor: null, has_newer: false, newer_cursor: null }

const message = (id: string): Message => ({
    id,
    channel_id: 'chan-1',
    conversation_id: null,
    author_id: user.id,
    content: `content-${id}`,
    type: 'text',
    is_edited: false,
    is_pinned: false,
    reply_to_id: null,
    created_at: `2026-01-01T00:00:0${id}Z`,
    author: user,
})

const detached: PaginatedMessages = {
    data: [message('1')],
    has_older: false,
    older_cursor: null,
    has_newer: true,
    newer_cursor: '1',
}

const renderContent = (initialMessages: PaginatedMessages) =>
    render(
        <TextChannelContent
            scopeId="chan-1"
            scopeType="channel"
            currentUser={user}
            initialMessages={initialMessages}
            placeholder="Message #general"
            emptyState={<div>Empty</div>}
        />
    )

describe('TextChannelContent', () => {
    beforeEach(() => {
        useMessages.setState({ messages: {}, windows: {}, typing: {} })
        setMessageCacheDriver(createMemoryDriver())
        // jsdom ships no scrollIntoView — see MessageList's optional call.
        Element.prototype.scrollIntoView = vi.fn()
    })

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

    it('offers no jump-to-present while the window reaches the live tail', () => {
        renderContent({
            data: [message('1')],
            has_older: false,
            older_cursor: null,
            has_newer: false,
            newer_cursor: null,
        })

        expect(screen.queryByText(/Jump to present/)).not.toBeInTheDocument()
    })

    it('offers a jump-to-present only once the window has messages below it', () => {
        renderContent(detached)

        expect(screen.getByText(/Jump to present/)).toBeInTheDocument()
    })

    it('jumping refetches the tail and replaces the window', async () => {
        vi.mocked(api.fetchChannelMessages).mockResolvedValue({
            data: [message('8'), message('9')],
            has_older: true,
            older_cursor: '8',
            has_newer: false,
            newer_cursor: null,
        })

        renderContent(detached)
        await userEvent.click(screen.getByText(/Jump to present/))

        expect(api.fetchChannelMessages).toHaveBeenCalledWith('chan-1', {})
        await waitFor(() => {
            expect(useMessages.getState().messages['chan-1'].map((m) => m.id)).toEqual(['8', '9'])
        })
        expect(screen.queryByText(/Jump to present/)).not.toBeInTheDocument()
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

    describe('go to message', () => {
        it('flashes the direct-link target on mount', () => {
            const { container } = render(
                <TextChannelContent
                    scopeId="chan-1"
                    scopeType="channel"
                    currentUser={user}
                    initialMessages={{ ...initial, data: [message('1'), message('2')] }}
                    initialHighlightMessageId="2"
                    placeholder="Message #general"
                    emptyState={<div>Empty</div>}
                />
            )

            expect(container.querySelector('[data-message-id="2"] .bg-accent-primary\\/10')).toBeInTheDocument()
        })

        it('jumping to a reply already in the window highlights it without fetching', async () => {
            const target = message('1')
            const reply = { ...message('2'), reply_to_id: '1', reply_to: target }
            const { container } = renderContent({ ...initial, data: [target, reply] })

            await userEvent.click(screen.getByRole('button', { name: /content-1/ }))

            expect(api.fetchChannelMessages).not.toHaveBeenCalled()
            expect(container.querySelector('[data-message-id="1"] .bg-accent-primary\\/10')).toBeInTheDocument()
        })

        it('jumping to a reply outside the window fetches a page centered on it', async () => {
            const target = message('1')
            const reply = { ...message('2'), reply_to_id: '1', reply_to: target }
            vi.mocked(api.fetchChannelMessages).mockResolvedValue({
                data: [target, reply],
                has_older: false,
                older_cursor: null,
                has_newer: false,
                newer_cursor: null,
            })

            // The window only holds the reply — the reply preview it renders
            // still names the target, even though the target itself isn't loaded.
            renderContent({ ...initial, data: [reply] })

            await userEvent.click(screen.getByText('content-1'))

            expect(api.fetchChannelMessages).toHaveBeenCalledWith('chan-1', { around: '1' })
            await waitFor(() => {
                expect(useMessages.getState().messages['chan-1'].map((m) => m.id)).toEqual(['1', '2'])
            })
        })
    })
})
