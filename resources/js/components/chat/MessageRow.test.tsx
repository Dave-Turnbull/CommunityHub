import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MessageRow } from '@/components/chat/MessageRow'
import * as api from '@/services/api'
import { useMessages } from '@/stores'
import type { Message, User } from '@/types'

vi.mock('@/services/api', () => ({
    addReaction: vi.fn(async () => []),
    removeReaction: vi.fn(async () => []),
    editMessage: vi.fn(async (id: string, content: string) => ({ id, content, is_edited: true })),
    deleteMessage: vi.fn(async () => {}),
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

// Every mutation goes through services/messageActions.ts, which writes to the
// store first and reconciles with the API afterwards — hence the store setup.
const seedStore = (message: Message) =>
    useMessages.getState().setWindow('chan-1', {
        data: [message],
        has_older: false,
        older_cursor: null,
        has_newer: false,
        newer_cursor: null,
    })

describe('MessageRow', () => {
    beforeEach(() => {
        useMessages.setState({ messages: {}, windows: {}, typing: {} })
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    it('renders the author and content for an ungrouped message', () => {
        render(<MessageRow message={baseMessage} scopeId="chan-1" grouped={false} currentUser={viewer} onReply={vi.fn()} onJumpToMessage={vi.fn()} />)

        expect(screen.getByText('Author Name')).toBeInTheDocument()
        expect(screen.getByText('Hello world')).toBeInTheDocument()
    })

    it('hides the author header when grouped with the previous message', () => {
        render(<MessageRow message={baseMessage} scopeId="chan-1" grouped currentUser={viewer} onReply={vi.fn()} onJumpToMessage={vi.fn()} />)

        expect(screen.queryByText('Author Name')).not.toBeInTheDocument()
        expect(screen.getByText('Hello world')).toBeInTheDocument()
    })

    it('shows an (edited) marker when the message was edited', () => {
        render(
            <MessageRow
                message={{ ...baseMessage, is_edited: true }}
                scopeId="chan-1"
                grouped={false}
                currentUser={viewer}
                onReply={vi.fn()} onJumpToMessage={vi.fn()}
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
                scopeId="chan-1"
                grouped={false}
                currentUser={viewer}
                onReply={vi.fn()} onJumpToMessage={vi.fn()}
            />
        )

        expect(screen.getByText('Original')).toBeInTheDocument()
    })

    it('jumps to the replied-to message when the reply context is clicked', async () => {
        const onJumpToMessage = vi.fn()
        render(
            <MessageRow
                message={{
                    ...baseMessage,
                    reply_to_id: 'msg-0',
                    reply_to: { ...baseMessage, id: 'msg-0', content: 'Original', author },
                }}
                scopeId="chan-1"
                grouped={false}
                currentUser={viewer}
                onReply={vi.fn()}
                onJumpToMessage={onJumpToMessage}
            />
        )

        await userEvent.click(screen.getByText('Original'))

        expect(onJumpToMessage).toHaveBeenCalledWith('msg-0')
    })

    it('renders a highlighted row with a flash background', () => {
        const { container } = render(
            <MessageRow message={baseMessage} scopeId="chan-1" grouped={false} currentUser={viewer} onReply={vi.fn()} onJumpToMessage={vi.fn()} highlighted />
        )

        expect(container.querySelector('.bg-accent-primary\\/10')).toBeInTheDocument()
    })

    it('calls onReply with the message when the reply button is clicked', async () => {
        const onReply = vi.fn()
        render(<MessageRow message={baseMessage} scopeId="chan-1" grouped={false} currentUser={viewer} onReply={onReply} onJumpToMessage={vi.fn()} />)

        await userEvent.click(screen.getByTitle('Reply'))

        expect(onReply).toHaveBeenCalledWith(baseMessage)
    })

    it('adds a reaction when clicking a pill the viewer has not reacted to', async () => {
        const message: Message = {
            ...baseMessage,
            reactions: [{ emoji: '👍', count: 1, reacted: false }],
        }
        render(<MessageRow message={message} scopeId="chan-1" grouped={false} currentUser={viewer} onReply={vi.fn()} onJumpToMessage={vi.fn()} />)

        await userEvent.click(screen.getByText('👍'))

        expect(api.addReaction).toHaveBeenCalledWith('msg-1', '👍')
        expect(api.removeReaction).not.toHaveBeenCalled()
    })

    it('removes a reaction when clicking a pill the viewer already reacted to', async () => {
        const message: Message = {
            ...baseMessage,
            reactions: [{ emoji: '👍', count: 2, reacted: true }],
        }
        render(<MessageRow message={message} scopeId="chan-1" grouped={false} currentUser={viewer} onReply={vi.fn()} onJumpToMessage={vi.fn()} />)

        await userEvent.click(screen.getByText('👍'))

        expect(api.removeReaction).toHaveBeenCalledWith('msg-1', '👍')
        expect(api.addReaction).not.toHaveBeenCalled()
    })

    it('counts a reaction up before the server confirms it', async () => {
        const message: Message = { ...baseMessage, reactions: [{ emoji: '👍', count: 1, reacted: false }] }
        seedStore(message)
        // Never resolves — so what the store holds is purely the optimistic guess.
        vi.mocked(api.addReaction).mockImplementation(() => new Promise(() => {}))

        render(<MessageRow message={message} scopeId="chan-1" grouped={false} currentUser={viewer} onReply={vi.fn()} onJumpToMessage={vi.fn()} />)
        await userEvent.click(screen.getByText('👍'))

        expect(useMessages.getState().messages['chan-1'][0].reactions)
            .toEqual([{ emoji: '👍', count: 2, reacted: true }])
    })

    it('puts a reaction back when the server rejects it', async () => {
        const message: Message = { ...baseMessage, reactions: [{ emoji: '👍', count: 1, reacted: false }] }
        seedStore(message)
        vi.mocked(api.addReaction).mockRejectedValue(new Error('nope'))

        render(<MessageRow message={message} scopeId="chan-1" grouped={false} currentUser={viewer} onReply={vi.fn()} onJumpToMessage={vi.fn()} />)
        await userEvent.click(screen.getByText('👍'))

        expect(useMessages.getState().messages['chan-1'][0].reactions)
            .toEqual([{ emoji: '👍', count: 1, reacted: false }])
    })

    it('does not show the edit/delete menu for someone else\'s message', () => {
        render(<MessageRow message={baseMessage} scopeId="chan-1" grouped={false} currentUser={viewer} onReply={vi.fn()} onJumpToMessage={vi.fn()} />)

        expect(screen.queryByRole('button', { name: '⋯' })).not.toBeInTheDocument()
    })

    it('shows the edit/delete menu for the viewer\'s own message', () => {
        render(
            <MessageRow
                message={{ ...baseMessage, author_id: viewer.id }}
                scopeId="chan-1"
                grouped={false}
                currentUser={viewer}
                onReply={vi.fn()} onJumpToMessage={vi.fn()}
            />
        )

        expect(screen.getByRole('button', { name: '⋯' })).toBeInTheDocument()
    })

    it('deletes the message via the dropdown menu for the author', async () => {
        const message = { ...baseMessage, author_id: viewer.id }
        render(<MessageRow message={message} scopeId="chan-1" grouped={false} currentUser={viewer} onReply={vi.fn()} onJumpToMessage={vi.fn()} />)

        await userEvent.click(screen.getByRole('button', { name: '⋯' }))
        const menu = await screen.findByRole('menu')
        await userEvent.click(within(menu).getByText('Delete'))

        expect(api.deleteMessage).toHaveBeenCalledWith('msg-1')
    })

    it('removes the message from the store before the delete request resolves', async () => {
        const message = { ...baseMessage, author_id: viewer.id }
        seedStore(message)
        vi.mocked(api.deleteMessage).mockImplementation(() => new Promise(() => {}))

        render(<MessageRow message={message} scopeId="chan-1" grouped={false} currentUser={viewer} onReply={vi.fn()} onJumpToMessage={vi.fn()} />)
        await userEvent.click(screen.getByRole('button', { name: '⋯' }))
        await userEvent.click(within(await screen.findByRole('menu')).getByText('Delete'))

        expect(useMessages.getState().messages['chan-1']).toEqual([])
    })

    it('edits the message via the dropdown menu for the author', async () => {
        const message = { ...baseMessage, author_id: viewer.id }
        seedStore(message)
        render(<MessageRow message={message} scopeId="chan-1" grouped={false} currentUser={viewer} onReply={vi.fn()} onJumpToMessage={vi.fn()} />)

        await userEvent.click(screen.getByRole('button', { name: '⋯' }))
        const menu = await screen.findByRole('menu')
        await userEvent.click(within(menu).getByText('Edit'))

        const textarea = await screen.findByRole('textbox')
        expect(textarea).toHaveValue('Hello world')

        await userEvent.clear(textarea)
        await userEvent.type(textarea, 'Updated content{enter}')

        expect(api.editMessage).toHaveBeenCalledWith('msg-1', 'Updated content')
        // Applied locally and the editor closed, without waiting for the PATCH.
        expect(useMessages.getState().messages['chan-1'][0].content).toBe('Updated content')
    })
})
