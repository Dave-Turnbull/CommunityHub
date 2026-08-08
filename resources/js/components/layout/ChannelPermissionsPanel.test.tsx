import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChannelPermissionsPanel } from '@/components/layout/ChannelPermissionsPanel'
import * as api from '@/services/api'
import type { Channel, Role } from '@/types'

vi.mock('@/services/api', () => ({
    updateChannelPermissions: vi.fn(),
}))

const roles: Role[] = [
    { id: 'role-owner', room_id: 'room-1', name: 'Owner', position: 100, is_default: false, is_system: true },
    { id: 'role-member', room_id: 'room-1', name: 'Member', position: 0, is_default: true, is_system: true },
]

function channel(overrides: Partial<Channel>): Channel {
    return {
        id: 'chan-1', room_id: 'room-1', name: 'general', type: 'text', topic: null,
        position: 0, voice_mode: 'auto', settings: null, visibility_roles: [], permission_overrides: [],
        ...overrides,
    }
}

describe('ChannelPermissionsPanel visibility', () => {
    afterEach(() => {
        vi.clearAllMocks()
    })

    it('renders a toggle per room role', () => {
        render(<ChannelPermissionsPanel channel={channel({})} roomRoles={roles} onUpdated={vi.fn()} onClose={vi.fn()} />)

        expect(screen.getByLabelText('Owner')).toBeInTheDocument()
        expect(screen.getByLabelText('Member')).toBeInTheDocument()
    })

    it('reflects previously restricted roles as checked', () => {
        render(
            <ChannelPermissionsPanel
                channel={channel({ visibility_roles: [roles[0]] })}
                roomRoles={roles}
                onUpdated={vi.fn()}
                onClose={vi.fn()}
            />
        )

        expect(screen.getByLabelText('Owner').getAttribute('aria-checked')).toBe('true')
        expect(screen.getByLabelText('Member').getAttribute('aria-checked')).toBe('false')
    })

    it('saves the toggled visibility set alongside an empty override list', async () => {
        vi.mocked(api.updateChannelPermissions).mockResolvedValue(channel({}))
        const onUpdated = vi.fn()
        const u = userEvent.setup()

        render(<ChannelPermissionsPanel channel={channel({})} roomRoles={roles} onUpdated={onUpdated} onClose={vi.fn()} />)

        await u.click(screen.getByLabelText('Owner'))
        await u.click(screen.getByRole('button', { name: 'Save' }))

        expect(api.updateChannelPermissions).toHaveBeenCalledWith('chan-1', {
            visibility_role_ids: ['role-owner'],
            permission_overrides: [],
        })
        expect(onUpdated).toHaveBeenCalled()
    })
})

describe('ChannelPermissionsPanel permission overrides — capability-aware filtering', () => {
    afterEach(() => {
        vi.clearAllMocks()
    })

    it('offers Send Messages but not Vote on a plain text channel', () => {
        render(<ChannelPermissionsPanel channel={channel({ type: 'text' })} roomRoles={roles} onUpdated={vi.fn()} onClose={vi.fn()} />)

        // Once per room role.
        expect(screen.getAllByText('Send Messages')).toHaveLength(roles.length)
        expect(screen.queryByText('Vote')).not.toBeInTheDocument()
    })

    it('offers only Manage Channel Visibility (no content permissions) on a voice channel', () => {
        render(<ChannelPermissionsPanel channel={channel({ type: 'voice' })} roomRoles={roles} onUpdated={vi.fn()} onClose={vi.fn()} />)

        // No messages exist in a voice channel, so none of the content
        // permissions show — but visibility management still meaningfully
        // applies to any channel, voice included.
        expect(screen.getAllByText('Manage Channel Visibility')).toHaveLength(roles.length)
        expect(screen.queryByText('Send Messages')).not.toBeInTheDocument()
        expect(screen.queryByText('React')).not.toBeInTheDocument()
        expect(screen.getByText('Visible to')).toBeInTheDocument()
    })

    it('offers Post Announcements but not Send Messages on an announcement channel', () => {
        render(<ChannelPermissionsPanel channel={channel({ type: 'announcement' })} roomRoles={roles} onUpdated={vi.fn()} onClose={vi.fn()} />)

        expect(screen.getAllByText('Post Announcements')).toHaveLength(roles.length)
        expect(screen.queryByText('Send Messages')).not.toBeInTheDocument()
    })

    it('starts a role/permission cell at Inherit when no override row exists', () => {
        render(<ChannelPermissionsPanel channel={channel({ type: 'text' })} roomRoles={roles} onUpdated={vi.fn()} onClose={vi.fn()} />)

        const group = screen.getByRole('radiogroup', { name: 'Owner — Send Messages' })
        expect(group.querySelector('[aria-checked="true"]')?.textContent).toBe('Inherit')
    })

    it('reflects an existing allow override', () => {
        render(
            <ChannelPermissionsPanel
                channel={channel({
                    type: 'text',
                    permission_overrides: [{ id: 'o1', role_id: 'role-owner', permission: 'send_messages', allowed: true }],
                })}
                roomRoles={roles}
                onUpdated={vi.fn()}
                onClose={vi.fn()}
            />
        )

        const group = screen.getByRole('radiogroup', { name: 'Owner — Send Messages' })
        expect(group.querySelector('[aria-checked="true"]')?.textContent).toBe('Allow')
    })

    it('clicking Deny then saving includes an allowed: false row for that role/permission', async () => {
        vi.mocked(api.updateChannelPermissions).mockResolvedValue(channel({}))
        const u = userEvent.setup()

        render(<ChannelPermissionsPanel channel={channel({ type: 'text' })} roomRoles={roles} onUpdated={vi.fn()} onClose={vi.fn()} />)

        const group = screen.getByRole('radiogroup', { name: 'Member — Send Messages' })
        await u.click(within(group).getByRole('radio', { name: 'Deny' }))
        await u.click(screen.getByRole('button', { name: 'Save' }))

        expect(api.updateChannelPermissions).toHaveBeenCalledWith('chan-1', {
            visibility_role_ids: [],
            permission_overrides: [{ role_id: 'role-member', permission: 'send_messages', allowed: false }],
        })
    })
})
