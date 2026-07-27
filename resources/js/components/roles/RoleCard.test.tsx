import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RoleCard } from '@/components/roles/RoleCard'
import * as api from '@/services/api'
import type { Role } from '@/types'

vi.mock('@/services/api', () => ({
    addRoleMember: vi.fn(),
    removeRoleMember: vi.fn(),
    updateRole: vi.fn(),
}))

function role(overrides: Partial<Role>): Role {
    return {
        id: 'role-1', room_id: 'room-1', name: 'Moderators', position: 10,
        is_default: false, is_system: false, role_permissions: [], channel_categories: [], users: [],
        can_manage: true, ...overrides,
    }
}

const noop = () => {}

describe('RoleCard channel categories', () => {
    afterEach(() => {
        vi.clearAllMocks()
    })

    it('renders a checkbox per known category', () => {
        render(<RoleCard role={role({})} memberOptions={[]} onChange={noop} onRemove={noop} canMoveUp={false} canMoveDown={false} />)

        expect(screen.getByLabelText('Standard')).toBeInTheDocument()
        expect(screen.getByLabelText('Moderation')).toBeInTheDocument()
    })

    it('checking Manage User Channels auto-ticks the Standard category, not Moderation', async () => {
        const u = userEvent.setup()
        render(<RoleCard role={role({})} memberOptions={[]} onChange={noop} onRemove={noop} canMoveUp={false} canMoveDown={false} />)

        await u.click(screen.getByLabelText('Manage User Channels'))

        expect(screen.getByLabelText('Standard')).toBeChecked()
        expect(screen.getByLabelText('Moderation')).not.toBeChecked()
    })

    it('checking Manage Mod Channels auto-ticks the Moderation category, not Standard', async () => {
        const u = userEvent.setup()
        render(<RoleCard role={role({})} memberOptions={[]} onChange={noop} onRemove={noop} canMoveUp={false} canMoveDown={false} />)

        await u.click(screen.getByLabelText('Manage Mod Channels'))

        expect(screen.getByLabelText('Moderation')).toBeChecked()
        expect(screen.getByLabelText('Standard')).not.toBeChecked()
    })

    it('unchecking Manage User Channels after auto-tick unticks the Standard category', async () => {
        const u = userEvent.setup()
        render(<RoleCard role={role({})} memberOptions={[]} onChange={noop} onRemove={noop} canMoveUp={false} canMoveDown={false} />)

        const manageUserChannels = screen.getByLabelText('Manage User Channels')
        await u.click(manageUserChannels)
        expect(screen.getByLabelText('Standard')).toBeChecked()

        await u.click(manageUserChannels)
        expect(screen.getByLabelText('Standard')).not.toBeChecked()
    })

    it('a category checkbox can be toggled independently of the two base permissions', async () => {
        const u = userEvent.setup()
        render(<RoleCard role={role({})} memberOptions={[]} onChange={noop} onRemove={noop} canMoveUp={false} canMoveDown={false} />)

        await u.click(screen.getByLabelText('Moderation'))

        expect(screen.getByLabelText('Moderation')).toBeChecked()
        expect(screen.getByLabelText('Manage Mod Channels')).not.toBeChecked()
    })

    it('reflects a previously granted category from role.channel_categories', () => {
        const granted = role({ channel_categories: [{ id: 'rcc-1', category: 'mod' }] })
        render(<RoleCard role={granted} memberOptions={[]} onChange={noop} onRemove={noop} canMoveUp={false} canMoveDown={false} />)

        expect(screen.getByLabelText('Moderation')).toBeChecked()
        expect(screen.getByLabelText('Standard')).not.toBeChecked()
    })

    it('saves both permissions and channel_categories together', async () => {
        vi.mocked(api.updateRole).mockResolvedValue(
            role({ role_permissions: [{ id: 'rp-1', permission: 'manage_mod_channels' }], channel_categories: [{ id: 'rcc-1', category: 'mod' }] })
        )
        const onChange = vi.fn()
        const u = userEvent.setup()

        render(<RoleCard role={role({})} memberOptions={[]} onChange={onChange} onRemove={noop} canMoveUp={false} canMoveDown={false} />)

        await u.click(screen.getByLabelText('Manage Mod Channels'))
        await u.click(screen.getByRole('button', { name: 'Save permissions' }))

        expect(api.updateRole).toHaveBeenCalledWith('role-1', {
            permissions: ['manage_mod_channels'],
            channel_categories: ['mod'],
        })
        expect(onChange).toHaveBeenCalled()
    })
})

describe('RoleCard permission categories', () => {
    afterEach(() => {
        vi.clearAllMocks()
    })

    it('groups the permission checklist into Admin/Moderator/User headed sections', () => {
        render(<RoleCard role={role({ room_id: null })} memberOptions={[]} onChange={noop} onRemove={noop} canMoveUp={false} canMoveDown={false} />)

        expect(screen.getByText('Admin permissions')).toBeInTheDocument()
        expect(screen.getByText('Moderator permissions')).toBeInTheDocument()
        expect(screen.getByText('User permissions')).toBeInTheDocument()
    })

    it('hides Send Direct Messages for a room-scoped role', () => {
        render(<RoleCard role={role({ room_id: 'room-1' })} memberOptions={[]} onChange={noop} onRemove={noop} canMoveUp={false} canMoveDown={false} />)

        expect(screen.queryByLabelText('Send Direct Messages')).not.toBeInTheDocument()
        // Its whole section has nothing left to show, since it's the only
        // permission in the 'user' category today.
        expect(screen.queryByText('User permissions')).not.toBeInTheDocument()
    })

    it('shows Send Direct Messages for a global role (room_id: null)', () => {
        render(<RoleCard role={role({ room_id: null })} memberOptions={[]} onChange={noop} onRemove={noop} canMoveUp={false} canMoveDown={false} />)

        expect(screen.getByLabelText('Send Direct Messages')).toBeInTheDocument()
    })
})
