import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { router } from '@inertiajs/react'
import { NewConversationModal } from '@/components/messages/NewConversationModal'
import * as api from '@/services/api'
import type { User } from '@/types'

vi.mock('@/services/api', () => ({
    resolveConversation: vi.fn(),
    startConversation: vi.fn(),
    uploadFile: vi.fn(),
    sendChannelMessage: vi.fn(),
    sendConversationMessage: vi.fn(),
}))

vi.mock('@inertiajs/react', () => ({
    router: { visit: vi.fn() },
    usePage: () => ({ props: { maxUploadSizeBytes: 100 * 1024 * 1024 } }),
}))

const bob: User = {
    id: 'user-2', username: 'bob', display_name: 'Bob Builder', avatar_url: null, status: 'online',
}
const carol: User = {
    id: 'user-3', username: 'carol', display_name: 'Carol Danvers', avatar_url: null, status: 'online',
}

vi.mock('@/components/messages/UserPicker', () => ({
    UserPicker: ({ selected, onChange }: { selected: User[]; onChange: (u: User[]) => void }) => (
        <div>
            <button onClick={() => onChange([...selected, bob])}>Select Bob</button>
            <button onClick={() => onChange([...selected, carol])}>Select Carol</button>
        </div>
    ),
}))

describe('NewConversationModal', () => {
    afterEach(() => {
        vi.clearAllMocks()
    })

    it('navigates directly to an existing DM without asking', async () => {
        vi.mocked(api.resolveConversation).mockResolvedValue({
            type: 'dm',
            existing: { id: 'conv-1', type: 'dm', name: null, icon_url: null, unread_count: 0, voice_mode: 'auto' },
        })
        const onClose = vi.fn()
        const user = userEvent.setup()

        render(<NewConversationModal onClose={onClose} />)

        await user.click(screen.getByText('Select Bob'))
        await user.click(screen.getByRole('button', { name: 'Continue' }))

        await waitFor(() => expect(router.visit).toHaveBeenCalledWith('/conversations/conv-1'))
        expect(onClose).toHaveBeenCalled()
    })

    it('asks for confirmation when the picked members match an existing group', async () => {
        vi.mocked(api.resolveConversation).mockResolvedValue({
            type: 'group',
            existing: { id: 'conv-old', type: 'group', name: 'Trio', icon_url: null, unread_count: 0, voice_mode: 'auto' },
        })
        const user = userEvent.setup()

        render(<NewConversationModal onClose={vi.fn()} />)

        await user.click(screen.getByText('Select Bob'))
        await user.click(screen.getByText('Select Carol'))
        await user.click(screen.getByRole('button', { name: 'Continue' }))

        expect(await screen.findByText(/group already exists/i)).toBeInTheDocument()
        expect(screen.getByText(/"Trio"/)).toBeInTheDocument()
    })

    it('going to the existing group navigates without creating a new one', async () => {
        vi.mocked(api.resolveConversation).mockResolvedValue({
            type: 'group',
            existing: { id: 'conv-old', type: 'group', name: 'Trio', icon_url: null, unread_count: 0, voice_mode: 'auto' },
        })
        const onClose = vi.fn()
        const user = userEvent.setup()

        render(<NewConversationModal onClose={onClose} />)

        await user.click(screen.getByText('Select Bob'))
        await user.click(screen.getByText('Select Carol'))
        await user.click(screen.getByRole('button', { name: 'Continue' }))
        await user.click(await screen.findByRole('button', { name: 'Go to existing' }))

        expect(router.visit).toHaveBeenCalledWith('/conversations/conv-old')
        expect(api.startConversation).not.toHaveBeenCalled()
        expect(onClose).toHaveBeenCalled()
    })

    it('creating anyway composes a first message and sends with confirm_duplicate', async () => {
        vi.mocked(api.resolveConversation).mockResolvedValue({
            type: 'group',
            existing: { id: 'conv-old', type: 'group', name: 'Trio', icon_url: null, unread_count: 0, voice_mode: 'auto' },
        })
        vi.mocked(api.startConversation).mockResolvedValue({
            conversation: { id: 'conv-new', type: 'group', name: null, icon_url: null, unread_count: 0, voice_mode: 'auto' },
            message: { id: 'msg-1' } as any,
        })
        const user = userEvent.setup()

        render(<NewConversationModal onClose={vi.fn()} />)

        await user.click(screen.getByText('Select Bob'))
        await user.click(screen.getByText('Select Carol'))
        await user.click(screen.getByRole('button', { name: 'Continue' }))
        await user.click(await screen.findByRole('button', { name: 'Create new anyway' }))

        const textarea = await screen.findByPlaceholderText(/message/i)
        await user.type(textarea, 'Hello{enter}')

        await waitFor(() => expect(api.startConversation).toHaveBeenCalledWith(
            expect.objectContaining({
                user_ids: ['user-2', 'user-3'],
                confirm_duplicate: true,
                content: 'Hello',
            })
        ))
        expect(router.visit).toHaveBeenCalledWith('/conversations/conv-new')
    })

    it('sends a first message directly to a fresh DM with no confirmation step', async () => {
        vi.mocked(api.resolveConversation).mockResolvedValue({ type: 'dm', existing: null })
        vi.mocked(api.startConversation).mockResolvedValue({
            conversation: { id: 'conv-new', type: 'dm', name: null, icon_url: null, unread_count: 0, voice_mode: 'auto' },
            message: { id: 'msg-1' } as any,
        })
        const user = userEvent.setup()

        render(<NewConversationModal onClose={vi.fn()} />)

        await user.click(screen.getByText('Select Bob'))
        await user.click(screen.getByRole('button', { name: 'Continue' }))

        const textarea = await screen.findByPlaceholderText(/message/i)
        await user.type(textarea, 'Hi Bob{enter}')

        await waitFor(() => expect(api.startConversation).toHaveBeenCalledWith(
            expect.objectContaining({ user_ids: ['user-2'], content: 'Hi Bob', name: undefined })
        ))
        expect(router.visit).toHaveBeenCalledWith('/conversations/conv-new')
    })
})
