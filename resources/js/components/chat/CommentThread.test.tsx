import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
})
