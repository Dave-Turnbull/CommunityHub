import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RegistrationSettings } from '@/components/settings/RegistrationSettings'
import * as api from '@/services/api'

vi.mock('@/services/api', () => ({
    createServerInvite: vi.fn(),
    fetchDefaultRoomOptions: vi.fn(),
    fetchInstanceSettings: vi.fn(),
    fetchServerInvites: vi.fn(),
    revokeServerInvite: vi.fn(),
    updateDefaultRoom: vi.fn(),
    updateInstanceSettings: vi.fn(),
}))

const settings = {
    signup_manual_enabled: true,
    signup_email_invite_enabled: true,
    signup_oauth_enabled: true,
    default_room_id: null,
}

const invite = (id: string, email: string | null) => ({
    id,
    email,
    invited_by: { id: 'u1', username: 'dave', display_name: 'Dave', avatar_url: null },
    expires_at: '2030-01-01T00:00:00Z',
    created_at: '2029-12-25T00:00:00Z',
})

function mount(defaultRoomId: string | null = null, invites: ReturnType<typeof invite>[] = []) {
    vi.mocked(api.fetchServerInvites).mockResolvedValue(invites)
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

describe('RegistrationSettings outstanding invites', () => {
    afterEach(() => {
        vi.clearAllMocks()
    })

    it('lists outstanding invites after fetching', async () => {
        mount(null, [invite('i1', 'a@example.com'), invite('i2', null)])

        expect(await screen.findByText('a@example.com')).toBeInTheDocument()
        expect(screen.getByText('Anyone with the link')).toBeInTheDocument()
        expect(screen.getAllByRole('button', { name: 'Revoke' })).toHaveLength(2)
    })

    it('shows an empty state when there are none', async () => {
        mount()

        expect(await screen.findByText('No outstanding invites.')).toBeInTheDocument()
    })

    it('revokes an invite and removes its row', async () => {
        vi.mocked(api.revokeServerInvite).mockResolvedValue()
        mount(null, [invite('i1', 'a@example.com'), invite('i2', 'b@example.com')])

        await screen.findByText('a@example.com')
        await userEvent.click(screen.getAllByRole('button', { name: 'Revoke' })[0])

        expect(api.revokeServerInvite).toHaveBeenCalledWith('i1')
        await waitFor(() => expect(screen.queryByText('a@example.com')).not.toBeInTheDocument())
        expect(screen.getByText('b@example.com')).toBeInTheDocument()
    })

    it('keeps the row and shows an error when revoking fails', async () => {
        vi.mocked(api.revokeServerInvite).mockRejectedValue(new Error('nope'))
        mount(null, [invite('i1', 'a@example.com')])

        await userEvent.click(await screen.findByRole('button', { name: 'Revoke' }))

        expect(await screen.findByRole('alert')).toHaveTextContent('Could not revoke that invite.')
        expect(screen.getByText('a@example.com')).toBeInTheDocument()
    })

    it('adds a newly generated invite to the list', async () => {
        vi.mocked(api.createServerInvite).mockResolvedValue({ url: 'http://x/register?invite=t' })
        mount()
        await screen.findByText('No outstanding invites.')
        vi.mocked(api.fetchServerInvites).mockResolvedValue([invite('i9', 'new@example.com')])

        await userEvent.type(screen.getByPlaceholderText(/someone@example.com/), 'new@example.com')
        await userEvent.click(screen.getByRole('button', { name: 'Generate link' }))

        expect(await screen.findByText('new@example.com')).toBeInTheDocument()
        expect(screen.queryByText('No outstanding invites.')).not.toBeInTheDocument()
    })
})
