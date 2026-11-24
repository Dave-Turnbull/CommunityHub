import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { CommentThread } from '@/components/chat/CommentThread'
import { useMessages } from '@/stores'
import * as api from '@/services/api'
import type { Message, PaginatedMessages } from '@/types'

vi.mock('@/services/echo', () => ({
    subscribe: vi.fn(() => vi.fn()),
}))

vi.mock('@/services/api', () => ({
    fetchComments: vi.fn(),
    sendComment: vi.fn(),
}))

vi.mock('@inertiajs/react', () => ({
    usePage: () => ({ props: { maxUploadSizeBytes: 5 * 1024 * 1024 } }),
}))

vi.mock('@/components/emoji/EmojiPicker', () => ({
    EmojiPicker: () => null,
}))

const comment = (id: string, depth: number, overrides: Partial<Message> = {}): Message => ({
    id,
    channel_id: null,
    conversation_id: null,
    parent_message_id: 'post-1',
    root_message_id: 'post-1',
    depth,
    author_id: 'user-2',
    content: `comment-${id}`,
    type: 'text',
    is_edited: false,
    is_pinned: false,
    reply_to_id: null,
    created_at: '2026-01-01T00:00:00Z',
    author: { id: 'user-2', username: 'bob', display_name: 'Bob', avatar_url: null } as any,
    ...overrides,
})

const page = (messages: Message[]): PaginatedMessages => ({
    data: messages,
    has_older: false,
    older_cursor: null,
    has_newer: false,
    newer_cursor: null,
})

describe('CommentThread', () => {
    beforeEach(() => {
        useMessages.setState({ messages: {}, windows: {}, typing: {} } as any)
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    it('renders top-level comments', () => {
        render(
            <CommentThread
                parentId="post-1"
                parentDepth={0}
                initial={page([comment('c1', 1)])}
                broadcastScope={{ id: 'chan-1', type: 'channel' }}
                currentUserId="user-1"
                canComment
            />
        )

        expect(screen.getByText('comment-c1')).toBeInTheDocument()
    })

    it('renders links and formatting in a comment but leaves a tombstone as plain placeholder', () => {
        render(
            <CommentThread
                parentId="post-1"
                parentDepth={0}
                initial={page([
                    comment('c1', 1, { content: '**bold** https://example.com/y' }),
                    comment('c2', 1, { content: 'https://gone.example', is_tombstoned: true } as any),
                ])}
                broadcastScope={{ id: 'chan-1', type: 'channel' }}
                currentUserId="user-1"
                canComment
            />
        )

        const links = screen.getAllByRole('link')
        expect(links).toHaveLength(1)
        expect(links[0]).toHaveAttribute('href', 'https://example.com/y')
        expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer')
        expect(screen.getByText('bold').tagName).toBe('STRONG')
        expect(screen.getByText('[deleted]')).toBeInTheDocument()
    })

    it('shows a reply composer at the top level when maxDepth allows one more level', () => {
        render(
            <CommentThread
                parentId="post-1"
                parentDepth={0}
                initial={page([])}
                broadcastScope={{ id: 'chan-1', type: 'channel' }}
                currentUserId="user-1"
                canComment
                maxDepth={1}
            />
        )

        expect(screen.getByPlaceholderText('Write a comment…')).toBeInTheDocument()
    })

    it('hides the reply/expand affordance on a comment already at maxDepth', () => {
        render(
            <CommentThread
                parentId="post-1"
                parentDepth={0}
                initial={page([comment('c1', 1)])}
                broadcastScope={{ id: 'chan-1', type: 'channel' }}
                currentUserId="user-1"
                canComment
                maxDepth={1}
            />
        )

        expect(screen.getByText('comment-c1')).toBeInTheDocument()
        expect(screen.queryByText('Reply')).not.toBeInTheDocument()
    })

    it('shows the reply/expand affordance on a comment below maxDepth', () => {
        render(
            <CommentThread
                parentId="post-1"
                parentDepth={0}
                initial={page([comment('c1', 1)])}
                broadcastScope={{ id: 'chan-1', type: 'channel' }}
                currentUserId="user-1"
                canComment
                maxDepth={5}
            />
        )

        expect(screen.getByText('Reply')).toBeInTheDocument()
    })

    it('does not fetch replies for a comment until it is expanded', () => {
        render(
            <CommentThread
                parentId="post-1"
                parentDepth={0}
                initial={page([comment('c1', 1)])}
                broadcastScope={{ id: 'chan-1', type: 'channel' }}
                currentUserId="user-1"
                canComment
            />
        )

        expect(api.fetchComments).not.toHaveBeenCalled()
    })

    describe('tombstoned comments', () => {
        const tombstone = (id: string, overrides: Partial<Message> = {}) =>
            comment(id, 1, { content: null, is_tombstoned: true, comment_count: 2, ...overrides })

        const renderThread = (messages: Message[], props: Record<string, unknown> = {}) =>
            render(
                <CommentThread
                    parentId="post-1"
                    parentDepth={0}
                    initial={page(messages)}
                    broadcastScope={{ id: 'chan-1', type: 'channel' }}
                    currentUserId="user-1"
                    canComment
                    {...props}
                />
            )

        it('shows the placeholder without a vote control, and keeps the replies toggle', () => {
            renderThread([tombstone('c1')])

            expect(screen.getByText('[deleted]')).toBeInTheDocument()
            expect(screen.queryByLabelText('Upvote')).not.toBeInTheDocument()
            expect(screen.getByText('2 replies')).toBeInTheDocument()
        })

        it('turns a live comment into the placeholder when its tombstone arrives, keeping the reply toggle', () => {
            const live = comment('c1', 1, { comment_count: 2 })
            renderThread([live])
            expect(screen.getByText('comment-c1')).toBeInTheDocument()

            act(() => {
                useMessages.getState().update('post-1', { ...live, content: null, is_tombstoned: true })
            })

            expect(screen.queryByText('comment-c1')).not.toBeInTheDocument()
            expect(screen.getByText('[deleted]')).toBeInTheDocument()
            expect(screen.queryByLabelText('Upvote')).not.toBeInTheDocument()
            expect(screen.getByText('2 replies')).toBeInTheDocument()
        })

        it('keeps the vote control on a live sibling', () => {
            renderThread([tombstone('c1'), comment('c2', 1)])

            expect(screen.getAllByLabelText('Upvote')).toHaveLength(1)
        })

        it('offers no reply toggle on a tombstone with nothing left beneath it', () => {
            renderThread([tombstone('c1', { comment_count: 0 })])

            expect(screen.getByText('[deleted]')).toBeInTheDocument()
            expect(screen.queryByText('Reply')).not.toBeInTheDocument()
        })

        it('shows no composer under a tombstoned parent but still lets its live comments be replied to', () => {
            renderThread([comment('c1', 1)], { parentTombstoned: true })

            expect(screen.queryByPlaceholderText('Write a comment…')).not.toBeInTheDocument()
            expect(screen.getByText('Reply')).toBeInTheDocument()
        })
    })
})
