import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MessageRow } from '@/components/chat/MessageRow'
import * as api from '@/services/api'
import type { Message, User } from '@/types'

vi.mock('@/services/api', () => ({
    addReaction: vi.fn(),
    removeReaction: vi.fn(),
    editMessage: vi.fn(),
    deleteMessage: vi.fn(),
}))

const author: User = {
    id: 'author-1',
    username: 'author',
    display_name: 'Author Name',
    avatar_url: null,
    status: 'online',
}

const viewer: User = {
    id: 'viewer-1',
    username: 'viewer',
    display_name: 'Viewer Name',
    avatar_url: null,
    status: 'online',
}

const baseMessage: Message = {
    id: 'msg-1',
    channel_id: 'chan-1',
    conversation_id: null,
    author_id: author.id,
    content: 'Hello world',
    type: 'text',
    is_edited: false,
    is_pinned: false,
    reply_to_id: null,
    created_at: '2026-01-01T12:00:00Z',
    author,
}

describe('MessageRow', () => {
    afterEach(() => {
        vi.clearAllMocks()
    })

    it('renders the author and content for an ungrouped message', () => {
        render(<MessageRow message={baseMessage} grouped={false} currentUser={viewer} onReply={vi.fn()} />)

        expect(screen.getByText('Author Name')).toBeInTheDocument()
        expect(screen.getByText('Hello world')).toBeInTheDocument()
    })

    it('hides the author header when grouped with the previous message', () => {
        render(<MessageRow message={baseMessage} grouped currentUser={viewer} onReply={vi.fn()} />)

        expect(screen.queryByText('Author Name')).not.toBeInTheDocument()
        expect(screen.getByText('Hello world')).toBeInTheDocument()
    })

    it('shows an (edited) marker when the message was edited', () => {
        render(
            <MessageRow
                message={{ ...baseMessage, is_edited: true }}
                grouped={false}
                currentUser={viewer}
                onReply={vi.fn()}
            />
        )

        expect(screen.getByText('(edited)')).toBeInTheDocument()
    })

    it('renders reply context when replying to another message', () => {
        render(
            <MessageRow
                message={{
                    ...baseMessage,
                    reply_to: { ...baseMessage, id: 'msg-0', content: 'Original', author },
                }}
                grouped={false}
                currentUser={viewer}
                onReply={vi.fn()}
            />
        )

        expect(screen.getByText('Original')).toBeInTheDocument()
    })

    it('calls onReply with the message when the reply button is clicked', async () => {
        const onReply = vi.fn()
        render(<MessageRow message={baseMessage} grouped={false} currentUser={viewer} onReply={onReply} />)

        await userEvent.click(screen.getByTitle('Reply'))

        expect(onReply).toHaveBeenCalledWith(baseMessage)
    })

    it('adds a reaction when clicking a pill the viewer has not reacted to', async () => {
        const message: Message = {
            ...baseMessage,
            reactions: [{ emoji: '👍', count: 1, reacted: false }],
        }
        render(<MessageRow message={message} grouped={false} currentUser={viewer} onReply={vi.fn()} />)

        await userEvent.click(screen.getByText('👍'))

        expect(api.addReaction).toHaveBeenCalledWith('msg-1', '👍')
        expect(api.removeReaction).not.toHaveBeenCalled()
    })

    it('removes a reaction when clicking a pill the viewer already reacted to', async () => {
        const message: Message = {
            ...baseMessage,
            reactions: [{ emoji: '👍', count: 2, reacted: true }],
        }
        render(<MessageRow message={message} grouped={false} currentUser={viewer} onReply={vi.fn()} />)

        await userEvent.click(screen.getByText('👍'))

        expect(api.removeReaction).toHaveBeenCalledWith('msg-1', '👍')
        expect(api.addReaction).not.toHaveBeenCalled()
    })

    it('does not show the edit/delete menu for someone else\'s message', () => {
        render(<MessageRow message={baseMessage} grouped={false} currentUser={viewer} onReply={vi.fn()} />)

        expect(screen.queryByRole('button', { name: '⋯' })).not.toBeInTheDocument()
    })

    it('shows the edit/delete menu for the viewer\'s own message', () => {
        render(
            <MessageRow
                message={{ ...baseMessage, author_id: viewer.id }}
                grouped={false}
                currentUser={viewer}
                onReply={vi.fn()}
            />
        )

        expect(screen.getByRole('button', { name: '⋯' })).toBeInTheDocument()
    })

    it('deletes the message via the dropdown menu for the author', async () => {
        const message = { ...baseMessage, author_id: viewer.id }
        render(<MessageRow message={message} grouped={false} currentUser={viewer} onReply={vi.fn()} />)

        await userEvent.click(screen.getByRole('button', { name: '⋯' }))
        const menu = await screen.findByRole('menu')
        await userEvent.click(within(menu).getByText('Delete'))

        expect(api.deleteMessage).toHaveBeenCalledWith('msg-1')
    })

    it('edits the message via the dropdown menu for the author', async () => {
        const message = { ...baseMessage, author_id: viewer.id }
        render(<MessageRow message={message} grouped={false} currentUser={viewer} onReply={vi.fn()} />)

        await userEvent.click(screen.getByRole('button', { name: '⋯' }))
        const menu = await screen.findByRole('menu')
        await userEvent.click(within(menu).getByText('Edit'))

        const textarea = await screen.findByRole('textbox')
        expect(textarea).toHaveValue('Hello world')

        await userEvent.clear(textarea)
        await userEvent.type(textarea, 'Updated content{enter}')

        expect(api.editMessage).toHaveBeenCalledWith('msg-1', 'Updated content')
    })
})
