import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ForumChannelContent } from '@/components/chat/ForumChannelContent'
import { useMessages } from '@/stores'
import type { Channel, Message, User } from '@/types'

vi.mock('@/services/echo', () => ({
    subscribe: vi.fn(() => vi.fn()),
}))

vi.mock('@/services/api', () => ({
    fetchChannelMessages: vi.fn(),
    fetchTopPosts: vi.fn(),
    fetchComments: vi.fn(),
    sendComment: vi.fn(),
}))

vi.mock('@inertiajs/react', () => ({
    usePage: () => ({ props: { maxUploadSizeBytes: 5 * 1024 * 1024 } }),
}))

vi.mock('@/components/emoji/EmojiPicker', () => ({
    EmojiPicker: () => null,
}))

vi.mock('@/components/messages/VoteControl', () => ({
    VoteControl: () => null,
}))

import * as api from '@/services/api'

const viewer = { id: 'user-1', username: 'alice', display_name: 'Alice', avatar_url: null } as unknown as User
const channel = { id: 'chan-1', type: 'forum' } as unknown as Channel

const post: Message = {
    id: 'post-1',
    channel_id: 'chan-1',
    conversation_id: null,
    parent_message_id: null,
    root_message_id: null,
    depth: 0,
    author_id: 'user-2',
    title: null,
    content: '**Read this** https://example.com/doc',
    type: 'text',
    is_edited: false,
    is_pinned: false,
    reply_to_id: null,
    created_at: '2026-01-01T00:00:00Z',
    author: { id: 'user-2', username: 'bob', display_name: 'Bob', avatar_url: null },
} as unknown as Message

describe('ForumChannelContent', () => {
    beforeEach(() => {
        useMessages.setState({ messages: {}, windows: {}, typing: {} } as any)
        vi.mocked(api.fetchChannelMessages).mockResolvedValue({
            data: [post], has_older: false, older_cursor: null, has_newer: false, newer_cursor: null,
        } as any)
        vi.mocked(api.fetchComments).mockResolvedValue({
            data: [], has_older: false, older_cursor: null, has_newer: false, newer_cursor: null,
        } as any)
    })

    it('keeps the list preview as plain text and renders links and formatting in the post detail', async () => {
        render(<ForumChannelContent channel={channel} currentUser={viewer} />)

        const preview = await screen.findByText('**Read this** https://example.com/doc')
        expect(screen.queryByRole('link')).toBeNull()

        await userEvent.click(preview)

        const link = await screen.findByRole('link')
        expect(link).toHaveAttribute('href', 'https://example.com/doc')
        expect(link).toHaveAttribute('target', '_blank')
        expect(link).toHaveAttribute('rel', 'noopener noreferrer')
        expect(screen.getByText('Read this').tagName).toBe('STRONG')
        expect(within(link.closest('div')!).queryByText('**Read this**')).toBeNull()
    })
})
