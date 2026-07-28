import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError } from 'axios'
import { MessageInput } from '@/components/chat/MessageInput'
import * as api from '@/services/api'
import { useMessages } from '@/stores'
import type { Message, User } from '@/types'

const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB, for a deterministic "too large" fixture

vi.mock('@inertiajs/react', () => ({
    usePage: () => ({ props: { maxUploadSizeBytes: MAX_UPLOAD_SIZE_BYTES } }),
}))

vi.mock('@/services/api', () => ({
    uploadFile: vi.fn(),
    sendChannelMessage: vi.fn(),
    sendConversationMessage: vi.fn(),
    sendComment: vi.fn(),
}))

vi.mock('@/components/emoji/EmojiPicker', () => ({
    EmojiPicker: ({ onError }: { onError?: () => void }) => (
        <button onClick={() => onError?.()}>trigger-emoji-error</button>
    ),
}))

function fileInput(container: HTMLElement): HTMLInputElement {
    return container.querySelector('input[type="file"][multiple]') as HTMLInputElement
}

function bigFile(name: string, sizeBytes: number, type = 'video/mp4'): File {
    return new File([new Uint8Array(sizeBytes)], name, { type })
}

describe('MessageInput', () => {
    beforeEach(() => {
        useMessages.setState({ messages: {}, windows: {}, typing: {} })
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    it('sends a text message and clears the draft', async () => {
        vi.mocked(api.sendChannelMessage).mockResolvedValue({ id: 'msg-1', content: 'hi' } as any)

        render(
            <MessageInput
                scopeId="chan-1"
                scopeType="channel"
                placeholder="Message #general"
                replyTo={null}
                onClearReply={vi.fn()}
            />
        )

        await userEvent.type(screen.getByPlaceholderText('Message #general'), 'hi')
        await userEvent.click(screen.getByText('Send'))

        expect(api.sendChannelMessage).toHaveBeenCalledWith('chan-1', {
            content: 'hi', attachment_ids: [], reply_to_id: undefined,
        })
        expect(screen.getByPlaceholderText('Message #general')).toHaveValue('')
    })

    it('sends a comment via sendComment when scopeType is message', async () => {
        vi.mocked(api.sendComment).mockResolvedValue({ id: 'comment-1', content: 'nice!' } as any)

        render(
            <MessageInput
                scopeId="post-1"
                scopeType="message"
                placeholder="Write a comment…"
                replyTo={null}
                onClearReply={vi.fn()}
            />
        )

        await userEvent.type(screen.getByPlaceholderText('Write a comment…'), 'nice!')
        await userEvent.click(screen.getByText('Send'))

        expect(api.sendComment).toHaveBeenCalledWith('post-1', {
            content: 'nice!', attachment_ids: [], reply_to_id: undefined,
        })
        expect(api.sendChannelMessage).not.toHaveBeenCalled()
    })

    it('includes a title in the payload when showTitleField is set', async () => {
        vi.mocked(api.sendChannelMessage).mockResolvedValue({ id: 'post-1', content: 'body' } as any)

        render(
            <MessageInput
                scopeId="chan-1"
                scopeType="channel"
                placeholder="Start a new post…"
                replyTo={null}
                onClearReply={vi.fn()}
                showTitleField
            />
        )

        await userEvent.type(screen.getByPlaceholderText('Title (optional)'), 'My Post')
        await userEvent.type(screen.getByPlaceholderText('Start a new post…'), 'body')
        await userEvent.click(screen.getByText('Send'))

        expect(api.sendChannelMessage).toHaveBeenCalledWith('chan-1', {
            content: 'body', title: 'My Post', attachment_ids: [], reply_to_id: undefined,
        })
    })

    it('rejects an oversized file at selection time with a dismissible error, without adding it', async () => {
        const { container } = render(
            <MessageInput scopeId="chan-1" scopeType="channel" placeholder="Message" replyTo={null} onClearReply={vi.fn()} />
        )

        const big = bigFile('video.mp4', MAX_UPLOAD_SIZE_BYTES + 1024)
        await userEvent.upload(fileInput(container), big)

        expect(await screen.findByText('video.mp4 is too large to upload (max 5 MB).')).toBeInTheDocument()
        expect(screen.queryByText('video.mp4')).not.toBeInTheDocument()
        expect(api.uploadFile).not.toHaveBeenCalled()
    })

    it('dismisses an individual error when its close button is clicked', async () => {
        const { container } = render(
            <MessageInput scopeId="chan-1" scopeType="channel" placeholder="Message" replyTo={null} onClearReply={vi.fn()} />
        )

        await userEvent.upload(fileInput(container), bigFile('a.mp4', MAX_UPLOAD_SIZE_BYTES + 1))
        const message = await screen.findByText('a.mp4 is too large to upload (max 5 MB).')

        await userEvent.click(within(message.parentElement!).getByLabelText('Dismiss'))

        expect(screen.queryByText('a.mp4 is too large to upload (max 5 MB).')).not.toBeInTheDocument()
    })

    it('stacks errors from more than one oversized file', async () => {
        const { container } = render(
            <MessageInput scopeId="chan-1" scopeType="channel" placeholder="Message" replyTo={null} onClearReply={vi.fn()} />
        )

        await userEvent.upload(fileInput(container), [
            bigFile('a.mp4', MAX_UPLOAD_SIZE_BYTES + 1),
            bigFile('b.mp4', MAX_UPLOAD_SIZE_BYTES + 1),
        ])

        const first = await screen.findByText('a.mp4 is too large to upload (max 5 MB).')
        expect(screen.getByText('b.mp4 is too large to upload (max 5 MB).')).toBeInTheDocument()

        // Each stacked error is independently closable — dismissing one must not
        // also remove the other (would happen if both were assigned the same id).
        await userEvent.click(within(first.parentElement!).getByLabelText('Dismiss'))

        expect(screen.queryByText('a.mp4 is too large to upload (max 5 MB).')).not.toBeInTheDocument()
        expect(screen.getByText('b.mp4 is too large to upload (max 5 MB).')).toBeInTheDocument()
    })

    it('shows an error and preserves the draft when the send request fails', async () => {
        const error = new AxiosError('Forbidden')
        error.response = { status: 403, data: {}, statusText: '', headers: {}, config: {} as any }
        vi.mocked(api.sendChannelMessage).mockRejectedValue(error)

        render(
            <MessageInput scopeId="chan-1" scopeType="channel" placeholder="Message #general" replyTo={null} onClearReply={vi.fn()} />
        )

        await userEvent.type(screen.getByPlaceholderText('Message #general'), 'hello')
        await userEvent.click(screen.getByText('Send'))

        expect(await screen.findByText("You don't have permission to do that.")).toBeInTheDocument()
        expect(screen.getByPlaceholderText('Message #general')).toHaveValue('hello')
    })

    it('reports a per-file upload failure using the failing filename', async () => {
        vi.mocked(api.uploadFile).mockRejectedValue(new Error('network down'))

        const { container } = render(
            <MessageInput scopeId="chan-1" scopeType="channel" placeholder="Message #general" replyTo={null} onClearReply={vi.fn()} />
        )

        await userEvent.upload(fileInput(container), bigFile('clip.mp4', 1024))
        await userEvent.click(screen.getByText('Send'))

        expect(await screen.findByText('clip.mp4 failed. Try again.')).toBeInTheDocument()
    })

    it('clears previous errors when a new send attempt starts', async () => {
        const error = new AxiosError('Forbidden')
        error.response = { status: 403, data: {}, statusText: '', headers: {}, config: {} as any }
        vi.mocked(api.sendChannelMessage).mockRejectedValueOnce(error)
        vi.mocked(api.sendChannelMessage).mockResolvedValueOnce({ id: 'msg-1', content: 'hi' } as any)

        render(
            <MessageInput scopeId="chan-1" scopeType="channel" placeholder="Message #general" replyTo={null} onClearReply={vi.fn()} />
        )

        await userEvent.type(screen.getByPlaceholderText('Message #general'), 'hello')
        await userEvent.click(screen.getByText('Send'))
        expect(await screen.findByText("You don't have permission to do that.")).toBeInTheDocument()

        await userEvent.type(screen.getByPlaceholderText('Message #general'), 'hello again')
        await userEvent.click(screen.getByText('Send'))

        expect(screen.queryByText("You don't have permission to do that.")).not.toBeInTheDocument()
    })

    it('surfaces an emoji picker load failure into the same error stack', async () => {
        render(
            <MessageInput scopeId="chan-1" scopeType="channel" placeholder="Message" replyTo={null} onClearReply={vi.fn()} />
        )

        await userEvent.click(screen.getByText('trigger-emoji-error'))

        expect(await screen.findByText("Couldn't load the emoji picker. Try again.")).toBeInTheDocument()
    })

    it('shows an image thumbnail in the "Replying to" bar when the reply target has an image attachment', () => {
        const author: User = {
            id: 'author-1', username: 'author', display_name: 'Author Name', avatar_url: null, status: 'online',
        }
        const replyTo: Message = {
            id: 'msg-0', channel_id: 'chan-1', conversation_id: null, author_id: author.id,
            content: null, type: 'text', is_edited: false, is_pinned: false, reply_to_id: null,
            created_at: '2026-01-01T12:00:00Z', author,
            attachments: [{
                id: 'att-1', url: '/storage/vacation.png', filename: 'vacation.png',
                mime_type: 'image/png', size_bytes: 1024, width: 400, height: 300,
            }],
        }

        render(
            <MessageInput scopeId="chan-1" scopeType="channel" placeholder="Message" replyTo={replyTo} onClearReply={vi.fn()} />
        )

        expect(screen.getByText('Author Name')).toBeInTheDocument()
        expect(screen.getByAltText('vacation.png')).toBeInTheDocument()
    })
})
