import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChannelVisibilityPanel } from '@/components/layout/ChannelVisibilityPanel'
import * as api from '@/services/api'
import type { Channel, Role } from '@/types'

vi.mock('@/services/api', () => ({
    updateChannelVisibility: vi.fn(),
}))

const channel: Channel = {
    id: 'chan-1', room_id: 'room-1', name: 'general', type: 'text', topic: null,
    position: 0, voice_mode: 'auto', settings: null,
}

const ownerRole: Role = {
    id: 'owner', room_id: 'room-1', name: 'Owner', position: 100, is_default: false, is_system: true,
}
const modRole: Role = {
    id: 'mod', room_id: 'room-1', name: 'Moderator', position: 10, is_default: false, is_system: false,
}

describe('ChannelVisibilityPanel', () => {
    afterEach(() => {
        vi.clearAllMocks()
    })

    it('pre-checks roles already granted visibility', () => {
        render(
            <ChannelVisibilityPanel
                channel={{ ...channel, visibility_roles: [modRole] }}
                roomRoles={[ownerRole, modRole]}
                onUpdated={vi.fn()}
                onClose={vi.fn()}
            />
        )

        expect((screen.getByLabelText('Moderator') as HTMLInputElement).checked).toBe(true)
        expect((screen.getByLabelText('Owner') as HTMLInputElement).checked).toBe(false)
    })

    it('saves the selected role ids, calls onUpdated, and closes', async () => {
        const updated = { ...channel, visibility_roles: [modRole] }
        vi.mocked(api.updateChannelVisibility).mockResolvedValue(updated)
        const onUpdated = vi.fn()
        const onClose = vi.fn()
        const user = userEvent.setup()

        render(
            <ChannelVisibilityPanel channel={channel} roomRoles={[ownerRole, modRole]} onUpdated={onUpdated} onClose={onClose} />
        )

        await user.click(screen.getByLabelText('Moderator'))
        await user.click(screen.getByRole('button', { name: 'Save' }))

        await waitFor(() => expect(api.updateChannelVisibility).toHaveBeenCalledWith('chan-1', ['mod']))
        expect(onUpdated).toHaveBeenCalledWith(updated)
        expect(onClose).toHaveBeenCalled()
    })

    it('shows the backend hierarchy error rather than a generic message', async () => {
        vi.mocked(api.updateChannelVisibility).mockRejectedValue({
            response: { data: { message: 'Cannot restrict a role that outranks your own.' } },
        })
        const user = userEvent.setup()

        render(
            <ChannelVisibilityPanel channel={channel} roomRoles={[ownerRole, modRole]} onUpdated={vi.fn()} onClose={vi.fn()} />
        )

        await user.click(screen.getByLabelText('Moderator'))
        await user.click(screen.getByRole('button', { name: 'Save' }))

        expect(await screen.findByText('Cannot restrict a role that outranks your own.')).toBeInTheDocument()
    })

    it('calls onClose when Cancel is clicked', async () => {
        const onClose = vi.fn()
        const user = userEvent.setup()

        render(
            <ChannelVisibilityPanel channel={channel} roomRoles={[ownerRole, modRole]} onUpdated={vi.fn()} onClose={onClose} />
        )

        await user.click(screen.getByRole('button', { name: 'Cancel' }))
        expect(onClose).toHaveBeenCalled()
    })
})
