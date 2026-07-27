import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InvitePanel } from '@/components/layout/InvitePanel'
import * as api from '@/services/api'
import type { Room, RoomInvite } from '@/types'

vi.mock('@/services/api', () => ({
    fetchRoomInvites: vi.fn(),
    sendRoomInvite: vi.fn(),
    revokeRoomInvite: vi.fn(),
}))

const room: Room = {
    id: 'room-1',
    name: 'Cool Room',
    icon_url: null,
    owner_id: 'user-1',
    invite_code: 'abc12345',
}

const invite: RoomInvite = {
    id: 'invite-1',
    room_id: room.id,
    email: 'pending@example.com',
    invited_by: {
        id: 'user-1', username: 'owner', display_name: 'Owner', avatar_url: null, status: 'online',
    },
    expires_at: '2026-01-08T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
}

describe('InvitePanel', () => {
    afterEach(() => {
        vi.clearAllMocks()
    })

    it('shows a copyable invite link built from the room invite_code', async () => {
        vi.mocked(api.fetchRoomInvites).mockResolvedValue([])

        render(<InvitePanel room={room} onClose={vi.fn()} />)

        expect(await screen.findByDisplayValue('http://localhost:3000/join/abc12345')).toBeInTheDocument()
    })

    it('copies the invite link to the clipboard', async () => {
        vi.mocked(api.fetchRoomInvites).mockResolvedValue([])
        const user = userEvent.setup()
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText: vi.fn().mockResolvedValue(undefined) },
            configurable: true,
        })

        render(<InvitePanel room={room} onClose={vi.fn()} />)

        await user.click(screen.getByRole('button', { name: 'Copy' }))

        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://localhost:3000/join/abc12345')
        expect(await screen.findByRole('button', { name: 'Copied!' })).toBeInTheDocument()
    })

    it('lists existing pending invites on open', async () => {
        vi.mocked(api.fetchRoomInvites).mockResolvedValue([invite])

        render(<InvitePanel room={room} onClose={vi.fn()} />)

        expect(await screen.findByText('pending@example.com')).toBeInTheDocument()
    })

    it('sends an invite and adds it to the pending list', async () => {
        vi.mocked(api.fetchRoomInvites).mockResolvedValue([])
        vi.mocked(api.sendRoomInvite).mockResolvedValue(invite)
        const user = userEvent.setup()

        render(<InvitePanel room={room} onClose={vi.fn()} />)

        await user.type(screen.getByPlaceholderText('name@example.com'), 'pending@example.com')
        await user.click(screen.getByRole('button', { name: 'Invite' }))

        await waitFor(() => expect(api.sendRoomInvite).toHaveBeenCalledWith('room-1', 'pending@example.com'))
        expect(await screen.findByText('pending@example.com')).toBeInTheDocument()
    })

    it('shows an error message when sending fails', async () => {
        vi.mocked(api.fetchRoomInvites).mockResolvedValue([])
        vi.mocked(api.sendRoomInvite).mockRejectedValue({
            response: { data: { message: 'This person is already a member of the room.' } },
        })
        const user = userEvent.setup()

        render(<InvitePanel room={room} onClose={vi.fn()} />)

        await user.type(screen.getByPlaceholderText('name@example.com'), 'existing@example.com')
        await user.click(screen.getByRole('button', { name: 'Invite' }))

        expect(await screen.findByText('This person is already a member of the room.')).toBeInTheDocument()
    })

    it('revokes a pending invite', async () => {
        vi.mocked(api.fetchRoomInvites).mockResolvedValue([invite])
        vi.mocked(api.revokeRoomInvite).mockResolvedValue(undefined)
        const user = userEvent.setup()

        render(<InvitePanel room={room} onClose={vi.fn()} />)

        await screen.findByText('pending@example.com')
        await user.click(screen.getByRole('button', { name: 'Revoke' }))

        await waitFor(() => expect(api.revokeRoomInvite).toHaveBeenCalledWith('invite-1'))
        expect(screen.queryByText('pending@example.com')).not.toBeInTheDocument()
    })
})
