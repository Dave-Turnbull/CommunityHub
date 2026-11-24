import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { router } from '@inertiajs/react'
import { RoomSettingsPanel } from '@/components/layout/RoomSettingsPanel'
import * as api from '@/services/api'
import type { Room } from '@/types'

vi.mock('@inertiajs/react', () => ({
    router: { visit: vi.fn(), reload: vi.fn() },
}))

vi.mock('@/services/api', () => ({
    updateRoom: vi.fn(),
    deleteRoom: vi.fn(),
    leaveRoom: vi.fn(),
}))

const room: Room = {
    id: 'room-1',
    name: 'Cool Room',
    icon_url: 'https://example.com/old.png',
    owner_id: 'owner-1',
    invite_code: 'abc12345',
}

const member = { currentUserId: 'user-2', canManageRoom: false, canDeleteRoom: false }
const owner = { currentUserId: 'owner-1', canManageRoom: true, canDeleteRoom: true }

const axiosError = (status: number, data: object) =>
    Object.assign(new Error('request failed'), { isAxiosError: true, response: { status, data } })

describe('RoomSettingsPanel', () => {
    afterEach(() => {
        vi.clearAllMocks()
    })

    describe('section visibility', () => {
        it('shows a plain member only the leave section', () => {
            render(<RoomSettingsPanel room={room} {...member} />)

            expect(screen.getByRole('button', { name: 'Leave room' })).toBeInTheDocument()
            expect(screen.queryByLabelText('Room name')).not.toBeInTheDocument()
            expect(screen.queryByLabelText('Type the room name to confirm')).not.toBeInTheDocument()
        })

        it('shows the edit form to a ManageRoom holder who cannot delete', () => {
            render(<RoomSettingsPanel room={room} {...member} canManageRoom />)

            expect(screen.getByLabelText('Room name')).toHaveValue('Cool Room')
            expect(screen.getByLabelText('Icon URL')).toHaveValue('https://example.com/old.png')
            expect(screen.getByRole('button', { name: 'Leave room' })).toBeInTheDocument()
            expect(screen.queryByLabelText('Type the room name to confirm')).not.toBeInTheDocument()
        })

        it('shows the owner the edit form and delete section, and explains why they cannot leave', () => {
            render(<RoomSettingsPanel room={room} {...owner} />)

            expect(screen.getByLabelText('Room name')).toBeInTheDocument()
            expect(screen.getByLabelText('Type the room name to confirm')).toBeInTheDocument()
            expect(screen.queryByRole('button', { name: 'Leave room' })).not.toBeInTheDocument()
            expect(screen.getByText(/can't leave it\. Delete the room instead/)).toBeInTheDocument()
        })
    })

    describe('editing', () => {
        it('saves the name and icon, then reloads the page props', async () => {
            const u = userEvent.setup()
            vi.mocked(api.updateRoom).mockResolvedValue({ ...room, name: 'New Name', icon_url: 'https://example.com/new.png' })
            render(<RoomSettingsPanel room={room} {...owner} />)

            await u.clear(screen.getByLabelText('Room name'))
            await u.type(screen.getByLabelText('Room name'), '  New Name ')
            await u.clear(screen.getByLabelText('Icon URL'))
            await u.type(screen.getByLabelText('Icon URL'), 'https://example.com/new.png')
            await u.click(screen.getByRole('button', { name: 'Save' }))

            await waitFor(() => expect(router.reload).toHaveBeenCalled())
            expect(api.updateRoom).toHaveBeenCalledWith('room-1', { name: 'New Name', icon_url: 'https://example.com/new.png' })
            expect(screen.getByText('Saved.')).toBeInTheDocument()
        })

        it('sends a null icon when the icon field is cleared', async () => {
            const u = userEvent.setup()
            vi.mocked(api.updateRoom).mockResolvedValue(room)
            render(<RoomSettingsPanel room={room} {...owner} />)

            await u.clear(screen.getByLabelText('Icon URL'))
            await u.click(screen.getByRole('button', { name: 'Save' }))

            await waitFor(() => expect(api.updateRoom).toHaveBeenCalledWith('room-1', { name: 'Cool Room', icon_url: null }))
        })

        it('disables Save while the name is blank', async () => {
            const u = userEvent.setup()
            render(<RoomSettingsPanel room={room} {...owner} />)

            await u.clear(screen.getByLabelText('Room name'))

            expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
        })

        it('shows the server validation message inline and does not reload', async () => {
            const u = userEvent.setup()
            vi.mocked(api.updateRoom).mockRejectedValue(
                axiosError(422, { message: 'The icon url field must be a valid URL.', errors: { icon_url: ['The icon url field must be a valid URL.'] } }),
            )
            render(<RoomSettingsPanel room={room} {...owner} />)

            await u.click(screen.getByRole('button', { name: 'Save' }))

            expect(await screen.findByText('The icon url field must be a valid URL.')).toBeInTheDocument()
            expect(router.reload).not.toHaveBeenCalled()
        })
    })

    describe('leaving', () => {
        it('asks for confirmation before leaving, then leaves and goes home', async () => {
            const u = userEvent.setup()
            vi.mocked(api.leaveRoom).mockResolvedValue()
            render(<RoomSettingsPanel room={room} {...member} />)

            await u.click(screen.getByRole('button', { name: 'Leave room' }))
            expect(api.leaveRoom).not.toHaveBeenCalled()
            expect(screen.getByText('Leave Cool Room?')).toBeInTheDocument()

            await u.click(screen.getByRole('button', { name: 'Yes, leave' }))

            await waitFor(() => expect(router.visit).toHaveBeenCalledWith('/'))
            expect(api.leaveRoom).toHaveBeenCalledWith('room-1')
        })

        it('cancelling the confirmation leaves nothing called', async () => {
            const u = userEvent.setup()
            render(<RoomSettingsPanel room={room} {...member} />)

            await u.click(screen.getByRole('button', { name: 'Leave room' }))
            await u.click(screen.getByRole('button', { name: 'Cancel' }))

            expect(screen.getByRole('button', { name: 'Leave room' })).toBeInTheDocument()
            expect(api.leaveRoom).not.toHaveBeenCalled()
        })

        it('shows the error inline and stays put when leaving fails', async () => {
            const u = userEvent.setup()
            vi.mocked(api.leaveRoom).mockRejectedValue(axiosError(422, { message: 'Transfer ownership or delete the room first.' }))
            render(<RoomSettingsPanel room={room} {...member} />)

            await u.click(screen.getByRole('button', { name: 'Leave room' }))
            await u.click(screen.getByRole('button', { name: 'Yes, leave' }))

            expect(await screen.findByText('Transfer ownership or delete the room first.')).toBeInTheDocument()
            expect(router.visit).not.toHaveBeenCalled()
        })
    })

    describe('deleting', () => {
        it('keeps the delete button disabled until the exact room name is typed', async () => {
            const u = userEvent.setup()
            render(<RoomSettingsPanel room={room} {...owner} />)
            const button = screen.getByRole('button', { name: 'Delete room' })
            const input = screen.getByLabelText('Type the room name to confirm')

            expect(button).toBeDisabled()

            await u.type(input, 'cool room')
            expect(button).toBeDisabled()

            await u.clear(input)
            await u.type(input, 'Cool Room')
            expect(button).toBeEnabled()
        })

        it('deletes the room and goes home', async () => {
            const u = userEvent.setup()
            vi.mocked(api.deleteRoom).mockResolvedValue()
            render(<RoomSettingsPanel room={room} {...owner} />)

            await u.type(screen.getByLabelText('Type the room name to confirm'), 'Cool Room')
            await u.click(screen.getByRole('button', { name: 'Delete room' }))

            await waitFor(() => expect(router.visit).toHaveBeenCalledWith('/'))
            expect(api.deleteRoom).toHaveBeenCalledWith('room-1')
        })

        it('shows the error inline and stays put when deleting fails', async () => {
            const u = userEvent.setup()
            vi.mocked(api.deleteRoom).mockRejectedValue(axiosError(403, {}))
            render(<RoomSettingsPanel room={room} {...owner} />)

            await u.type(screen.getByLabelText('Type the room name to confirm'), 'Cool Room')
            await u.click(screen.getByRole('button', { name: 'Delete room' }))

            expect(await screen.findByText("You don't have permission to do that.")).toBeInTheDocument()
            expect(router.visit).not.toHaveBeenCalled()
        })
    })
})
