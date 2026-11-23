import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RegistrationSettings } from '@/components/settings/RegistrationSettings'
import * as api from '@/services/api'

vi.mock('@/services/api', () => ({
    createServerInvite: vi.fn(),
    fetchDefaultRoomOptions: vi.fn(),
    fetchInstanceSettings: vi.fn(),
    updateDefaultRoom: vi.fn(),
    updateInstanceSettings: vi.fn(),
}))

const settings = {
    signup_manual_enabled: true,
    signup_email_invite_enabled: true,
    signup_oauth_enabled: true,
    default_room_id: null,
}

function mount(defaultRoomId: string | null = null) {
    vi.mocked(api.fetchInstanceSettings).mockResolvedValue({ ...settings, default_room_id: defaultRoomId })
    vi.mocked(api.fetchDefaultRoomOptions).mockResolvedValue([
        { id: 'room-1', name: 'Lobby' },
        { id: 'room-2', name: 'Annex' },
    ])
    vi.mocked(api.updateDefaultRoom).mockImplementation(async (roomId) => ({ ...settings, default_room_id: roomId }))

    render(<RegistrationSettings />)
}

describe('RegistrationSettings default room', () => {
    afterEach(() => {
        vi.clearAllMocks()
    })

    it('saves the chosen room without adding existing users by default', async () => {
        mount()

        const select = await screen.findByLabelText('Default room')
        await screen.findByRole('option', { name: 'Lobby' })
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
        expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument()

        await userEvent.selectOptions(select, 'room-1')
        await userEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(api.updateDefaultRoom).toHaveBeenCalledWith('room-1', false)
        expect(await screen.findByText('Default room saved.')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument()
    })

    it('asks for existing users to be added when the box is ticked, even for the already-saved room', async () => {
        mount('room-1')

        await screen.findByRole('option', { name: 'Lobby' })
        expect(await screen.findByLabelText('Default room')).toHaveValue('room-1')

        await userEvent.click(screen.getByLabelText('Also add all existing users now'))
        await userEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(api.updateDefaultRoom).toHaveBeenCalledWith('room-1', true)
        expect(await screen.findByText('Default room saved. Existing users are being added.')).toBeInTheDocument()
        expect(screen.getByLabelText('Also add all existing users now')).not.toBeChecked()
    })

    it('clears the default room with the Clear button', async () => {
        mount('room-1')

        await userEvent.click(await screen.findByRole('button', { name: 'Clear' }))

        expect(api.updateDefaultRoom).toHaveBeenCalledWith(null, false)
        expect(await screen.findByText('Default room cleared.')).toBeInTheDocument()
        expect(screen.getByLabelText('Default room')).toHaveValue('')
        expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument()
    })

    it('clears the default room by choosing None and saving', async () => {
        mount('room-1')

        const select = await screen.findByLabelText('Default room')
        await screen.findByRole('option', { name: 'Lobby' })
        await userEvent.selectOptions(select, '')

        expect(screen.queryByLabelText('Also add all existing users now')).not.toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(api.updateDefaultRoom).toHaveBeenCalledWith(null, false)
    })
})
