import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
})
