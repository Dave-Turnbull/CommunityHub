import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CreateChannelPanel } from '@/components/layout/CreateChannelPanel'
import * as api from '@/services/api'
import type { Channel, Room } from '@/types'

vi.mock('@/services/api', () => ({
    createChannel: vi.fn(),
}))

const room: Room = {
    id: 'room-1', name: 'Cool Room', icon_url: null, owner_id: 'user-1', invite_code: 'abc123',
}

const created: Channel = {
    id: 'chan-2', room_id: 'room-1', name: 'new-channel', type: 'text', topic: null,
    position: 1, voice_mode: 'auto', settings: null,
}

const ALL_TYPES = ['announcement', 'text', 'voice']

describe('CreateChannelPanel', () => {
    afterEach(() => {
        vi.clearAllMocks()
    })

    it('defaults to the first available channel type', () => {
        render(<CreateChannelPanel room={room} creatableTypes={ALL_TYPES} onClose={vi.fn()} onCreated={vi.fn()} />)

        expect(screen.getByRole('button', { name: /announcement/i })).toHaveClass('border-accent-primary')
    })

    it('groups types into Standard and Moderation sections', () => {
        render(<CreateChannelPanel room={room} creatableTypes={ALL_TYPES} onClose={vi.fn()} onCreated={vi.fn()} />)

        expect(screen.getByText('Moderation')).toBeInTheDocument()
        expect(screen.getByText('Standard')).toBeInTheDocument()
    })

    it('only offers types present in creatableTypes', () => {
        render(<CreateChannelPanel room={room} creatableTypes={['text', 'voice']} onClose={vi.fn()} onCreated={vi.fn()} />)

        expect(screen.queryByRole('button', { name: /announcement/i })).not.toBeInTheDocument()
        expect(screen.queryByText('Moderation')).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: /text/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /voice/i })).toBeInTheDocument()
    })

    it('shows a no-permission message and disables Create when nothing is creatable', () => {
        render(<CreateChannelPanel room={room} creatableTypes={[]} onClose={vi.fn()} onCreated={vi.fn()} />)

        expect(screen.getByText(/don't have permission/i)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
    })

    it('creates a channel with the selected type and calls onCreated', async () => {
        vi.mocked(api.createChannel).mockResolvedValue(created)
        const onCreated = vi.fn()
        const onClose = vi.fn()
        const user = userEvent.setup()

        render(<CreateChannelPanel room={room} creatableTypes={ALL_TYPES} onClose={onClose} onCreated={onCreated} />)

        await user.click(screen.getByRole('button', { name: /text/i }))
        await user.type(screen.getByPlaceholderText('new-channel'), 'new-channel')
        await user.click(screen.getByRole('button', { name: 'Create' }))

        await waitFor(() =>
            expect(api.createChannel).toHaveBeenCalledWith('room-1', { name: 'new-channel', type: 'text', topic: undefined })
        )
        expect(onCreated).toHaveBeenCalledWith(created)
        expect(onClose).toHaveBeenCalled()
    })

    it('shows an error message when creation fails', async () => {
        vi.mocked(api.createChannel).mockRejectedValue({
            response: { data: { message: 'That name is already taken.' } },
        })
        const user = userEvent.setup()

        render(<CreateChannelPanel room={room} creatableTypes={ALL_TYPES} onClose={vi.fn()} onCreated={vi.fn()} />)

        await user.type(screen.getByPlaceholderText('new-channel'), 'general')
        await user.click(screen.getByRole('button', { name: 'Create' }))

        expect(await screen.findByText('That name is already taken.')).toBeInTheDocument()
    })

    it('disables Create until a name is entered', () => {
        render(<CreateChannelPanel room={room} creatableTypes={ALL_TYPES} onClose={vi.fn()} onCreated={vi.fn()} />)

        expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
    })
})
