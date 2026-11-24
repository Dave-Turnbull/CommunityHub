import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TextChannelContent } from '@/components/chat/TextChannelContent'
import * as api from '@/services/api'
import * as echo from '@/services/echo'
import { useMessages, useTyping } from '@/stores'
import { createMemoryDriver, setMessageCacheDriver } from '@/services/messageCache'
import type { Message, PaginatedMessages, User } from '@/types'

vi.mock('@/services/echo', () => ({
    subscribe: vi.fn(() => vi.fn()),
    sendTyping: vi.fn(),
}))

vi.mock('@/services/api', () => ({
    fetchChannelMessages: vi.fn(),
    fetchConversationMessages: vi.fn(),
}))

const pageProps: Record<string, unknown> = {}

vi.mock('@inertiajs/react', () => ({
    usePage: () => ({ props: { maxUploadSizeBytes: 100 * 1024 * 1024, ...pageProps } }),
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
        useTyping.setState({ expiries: {} })
        for (const key of Object.keys(pageProps)) delete pageProps[key]
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

    const jumpButton = () => screen.queryByRole('button', { name: /jump to present/i })

    it('offers no jump-to-present while the window reaches the live tail', () => {
        renderContent({
            data: [message('1')],
            has_older: false,
            older_cursor: null,
            has_newer: false,
            newer_cursor: null,
        })

        expect(jumpButton()).not.toBeInTheDocument()
    })

    it('offers a jump-to-present only once the window has messages below it', () => {
        renderContent(detached)

        expect(jumpButton()).toBeInTheDocument()
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
        await userEvent.click(jumpButton()!)

        expect(api.fetchChannelMessages).toHaveBeenCalledWith('chan-1', {})
        await waitFor(() => {
            expect(useMessages.getState().messages['chan-1'].map((m) => m.id)).toEqual(['8', '9'])
        })
        expect(jumpButton()).not.toBeInTheDocument()
    })

    it('renders no composer at all when canPost is false', () => {
        render(
            <TextChannelContent
                scopeId="chan-1"
                scopeType="channel"
                currentUser={user}
                initialMessages={initial}
                placeholder="Message #announcements"
                emptyState={<div>Empty</div>}
                canPost={false}
            />
        )

        expect(screen.queryByPlaceholderText('Message #announcements')).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /send/i })).not.toBeInTheDocument()
    })

    it('still offers jump-to-present when canPost is false and the window is detached', () => {
        render(
            <TextChannelContent
                scopeId="chan-1"
                scopeType="channel"
                currentUser={user}
                initialMessages={detached}
                placeholder="Message #announcements"
                emptyState={<div>Empty</div>}
                canPost={false}
            />
        )

        expect(screen.queryByPlaceholderText('Message #announcements')).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: /jump to present/i })).toBeInTheDocument()
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

    describe('typing indicator', () => {
        const bob: User = { ...user, id: 'user-2', username: 'bob', display_name: 'Bob' }

        const renderScope = (props: Partial<React.ComponentProps<typeof TextChannelContent>> = {}) =>
            render(
                <TextChannelContent
                    scopeId="chan-1"
                    scopeType="channel"
                    currentUser={user}
                    initialMessages={initial}
                    placeholder="Message #general"
                    emptyState={<div>Empty</div>}
                    {...props}
                />
            )

        beforeEach(() => {
            vi.useFakeTimers({ shouldAdvanceTime: true })
        })

        afterEach(() => {
            vi.useRealTimers()
        })

        const type = (text: string) =>
            userEvent.type(screen.getByPlaceholderText('Message #general'), text, { delay: null })

        it('whispers once per 3 seconds however many keystrokes there are', async () => {
            renderScope()

            await type('hello world')
            expect(echo.sendTyping).toHaveBeenCalledTimes(1)
            expect(echo.sendTyping).toHaveBeenCalledWith('channel', 'chan-1', 'user-1')

            act(() => { vi.advanceTimersByTime(3000) })
            await type('!')

            expect(echo.sendTyping).toHaveBeenCalledTimes(2)
        })

        it('sends nothing for blank text', async () => {
            renderScope()

            await type('   ')

            expect(echo.sendTyping).not.toHaveBeenCalled()
        })

        it('sends nothing when there is no composer to type in', () => {
            renderScope({ canPost: false })

            expect(screen.queryByPlaceholderText('Message #general')).not.toBeInTheDocument()
            expect(echo.sendTyping).not.toHaveBeenCalled()
        })

        it('uses the conversation scope for a DM', async () => {
            renderScope({ scopeId: 'conv-1', scopeType: 'conversation' })

            await type('hi')

            expect(echo.sendTyping).toHaveBeenCalledWith('conversation', 'conv-1', 'user-1')
        })

        it('keeps its reserved line when nobody is typing', () => {
            const { container } = renderScope()

            expect(container.querySelector('[aria-live="polite"]')).toHaveClass('h-5')
        })

        it('resolves a channel typist\'s name from the room members, not the whisper', () => {
            pageProps.members = [{ id: 'm1', room_id: 'r', user_id: 'user-2', nickname: null, user: bob }]
            const { container } = renderScope()

            act(() => {
                useTyping.getState().touch('chan-1', 'user-2')
                useTyping.getState().touch('chan-1', 'unknown')
            })

            expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent('Bob is typing…')
        })

        it('prefers the room nickname', () => {
            pageProps.members = [{ id: 'm1', room_id: 'r', user_id: 'user-2', nickname: 'Bobby', user: bob }]
            const { container } = renderScope()

            act(() => useTyping.getState().touch('chan-1', 'user-2'))

            expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent('Bobby is typing…')
        })

        it('resolves a conversation typist from its participants', () => {
            pageProps.conversation = { id: 'conv-1', participants: [{ id: 'p1', user_id: 'user-2', user: bob }] }
            const { container } = renderScope({ scopeId: 'conv-1', scopeType: 'conversation' })

            act(() => useTyping.getState().touch('conv-1', 'user-2'))

            expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent('Bob is typing…')
        })

        it('never shows the current user as typing', () => {
            pageProps.members = [{ id: 'm0', room_id: 'r', user_id: 'user-1', nickname: null, user }]
            const { container } = renderScope()

            act(() => useTyping.getState().touch('chan-1', 'user-1'))

            expect(container.querySelector('[aria-live="polite"]')).toBeEmptyDOMElement()
        })

        it('releases its echo subscription on unmount', () => {
            const cleanup = vi.fn()
            vi.mocked(echo.subscribe).mockReturnValueOnce(cleanup)
            const { unmount } = renderScope()

            unmount()

            expect(cleanup).toHaveBeenCalled()
        })

        it('resubscribes, tearing down the old listener, when the scope changes', () => {
            const cleanup = vi.fn()
            vi.mocked(echo.subscribe).mockReturnValueOnce(cleanup)
            const { rerender } = renderScope()

            rerender(
                <TextChannelContent
                    scopeId="chan-2"
                    scopeType="channel"
                    currentUser={user}
                    initialMessages={initial}
                    placeholder="Message #general"
                    emptyState={<div>Empty</div>}
                />
            )

            expect(cleanup).toHaveBeenCalled()
            expect(echo.subscribe).toHaveBeenLastCalledWith('chan-2', 'channel')
        })
    })
})
