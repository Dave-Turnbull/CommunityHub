import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { router } from '@inertiajs/react'
import { AddParticipantsModal } from '@/components/messages/AddParticipantsModal'
import * as api from '@/services/api'
import type { Conversation, User } from '@/types'

vi.mock('@/services/api', () => ({
    addConversationParticipants: vi.fn(),
}))

vi.mock('@inertiajs/react', () => ({
    router: { reload: vi.fn() },
}))

const dave: User = {
    id: 'user-4', username: 'dave', display_name: 'Dave Grohl', avatar_url: null, status: 'online',
}

vi.mock('@/components/messages/UserPicker', () => ({
    UserPicker: ({ selected, onChange }: { selected: User[]; onChange: (u: User[]) => void }) => (
        <button onClick={() => onChange([...selected, dave])}>Select Dave</button>
    ),
}))

const group: Conversation = {
    id: 'conv-1', type: 'group', name: 'Squad', icon_url: null, unread_count: 0, voice_mode: 'auto',
}

describe('AddParticipantsModal', () => {
    afterEach(() => {
        vi.clearAllMocks()
    })

    it('adds the selected people and reloads the conversation prop', async () => {
        vi.mocked(api.addConversationParticipants).mockResolvedValue({ ...group })
        const onClose = vi.fn()
        const user = userEvent.setup()

        render(<AddParticipantsModal conversation={group} onClose={onClose} />)

        await user.click(screen.getByText('Select Dave'))
        await user.click(screen.getByRole('button', { name: 'Add' }))

        await waitFor(() => expect(api.addConversationParticipants).toHaveBeenCalledWith('conv-1', ['user-4']))
        expect(router.reload).toHaveBeenCalledWith({ only: ['conversation'] })
        expect(onClose).toHaveBeenCalled()
    })

    it('shows an error message when adding fails', async () => {
        vi.mocked(api.addConversationParticipants).mockRejectedValue({
            response: { data: { message: 'You can only message people you share a room with.' } },
        })
        const user = userEvent.setup()

        render(<AddParticipantsModal conversation={group} onClose={vi.fn()} />)

        await user.click(screen.getByText('Select Dave'))
        await user.click(screen.getByRole('button', { name: 'Add' }))

        expect(await screen.findByText('You can only message people you share a room with.')).toBeInTheDocument()
    })
})
