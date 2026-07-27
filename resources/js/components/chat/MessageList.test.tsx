import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MessageList } from '@/components/chat/MessageList'
import type { Message, User } from '@/types'

vi.mock('@/services/messageActions', () => ({
    toggleReaction: vi.fn(),
    saveEdit: vi.fn(),
    removeMessage: vi.fn(),
}))

const user: User = {
    id: 'user-1', username: 'alice', display_name: 'Alice', avatar_url: null, status: 'online',
}

const message = (id: string, createdAt: string): Message => ({
    id,
    channel_id: 'chan-1',
    conversation_id: null,
    author_id: user.id,
    content: `content-${id}`,
    type: 'text',
    is_edited: false,
    is_pinned: false,
    reply_to_id: null,
    created_at: createdAt,
    author: user,
})

const props = {
    scopeId: 'chan-1',
    currentUser: user,
    hasOlder: false,
    hasNewer: false,
    onLoadOlder: vi.fn(),
    onLoadNewer: vi.fn(),
    onReply: vi.fn(),
    onJumpToMessage: vi.fn(),
}

describe('MessageList', () => {
    it('tags every row with its message id for scroll anchoring', () => {
        const { container } = render(
            <MessageList
                {...props}
                messages={[
                    message('1', '2026-01-01T10:00:00Z'),
                    message('2', '2026-01-01T10:01:00Z'),
                ]}
            />
        )

        expect([...container.querySelectorAll('[data-message-id]')].map((el) => el.getAttribute('data-message-id')))
            .toEqual(['1', '2'])
    })

    it('renders a day divider per calendar day, not per message', () => {
        render(
            <MessageList
                {...props}
                messages={[
                    message('1', '2026-01-01T10:00:00Z'),
                    message('2', '2026-01-01T23:00:00Z'),
                    message('3', '2026-01-02T09:00:00Z'),
                ]}
            />
        )

        expect(screen.getAllByText(/January 1, 2026|January 2, 2026/)).toHaveLength(2)
    })

    it('renders the empty state instead of a scroller when there is nothing to show', () => {
        render(<MessageList {...props} messages={[]} emptyState={<div>Nothing here</div>} />)

        expect(screen.getByText('Nothing here')).toBeInTheDocument()
    })

    it('observes a sentinel per direction that has more to load, and none otherwise', () => {
        const observe = vi.fn()

        // The setup-file stub observes nothing; this one counts.
        vi.stubGlobal('IntersectionObserver', class {
            observe = observe
            unobserve = vi.fn()
            disconnect = vi.fn()
            takeRecords = vi.fn(() => [])
        })

        const messages = [message('1', '2026-01-01T10:00:00Z')]

        render(<MessageList {...props} messages={messages} />)
        expect(observe).not.toHaveBeenCalled()

        render(<MessageList {...props} messages={messages} hasOlder />)
        expect(observe).toHaveBeenCalledTimes(1)

        render(<MessageList {...props} messages={messages} hasOlder hasNewer />)
        expect(observe).toHaveBeenCalledTimes(3)

        vi.unstubAllGlobals()
    })

    describe('scrollTo — "go to message" landing', () => {
        beforeEach(() => {
            vi.useFakeTimers()
            // jsdom ships no scrollIntoView — see MessageList's optional call.
            Element.prototype.scrollIntoView = vi.fn()
        })

        afterEach(() => {
            vi.useRealTimers()
        })

        const messages = [
            message('1', '2026-01-01T10:00:00Z'),
            message('2', '2026-01-01T10:01:00Z'),
        ]

        it('scrolls the target row into view', () => {
            render(<MessageList {...props} messages={messages} scrollTo={{ id: '2', token: 1 }} />)

            expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'center' })
        })

        it('flashes the target row and clears the flash after a timeout', () => {
            const { container } = render(
                <MessageList {...props} messages={messages} scrollTo={{ id: '2', token: 1 }} />
            )

            const row = container.querySelector('[data-message-id="2"]')!
            expect(row.querySelector('.bg-accent-primary\\/10')).toBeInTheDocument()

            act(() => { vi.advanceTimersByTime(2000) })

            expect(row.querySelector('.bg-accent-primary\\/10')).not.toBeInTheDocument()
        })

        it('re-flashes when the token is bumped even for the same id', () => {
            const { container, rerender } = render(
                <MessageList {...props} messages={messages} scrollTo={{ id: '2', token: 1 }} />
            )
            act(() => { vi.advanceTimersByTime(2000) })

            const row = container.querySelector('[data-message-id="2"]')!
            expect(row.querySelector('.bg-accent-primary\\/10')).not.toBeInTheDocument()

            rerender(<MessageList {...props} messages={messages} scrollTo={{ id: '2', token: 2 }} />)

            expect(row.querySelector('.bg-accent-primary\\/10')).toBeInTheDocument()
        })
    })
})
