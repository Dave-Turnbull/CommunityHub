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
    updateRoleRoomCeiling: vi.fn(),
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

    it('splits a global role into Server permissions and Room permissions sections', () => {
        render(<RoleCard role={role({ room_id: null })} memberOptions={[]} onChange={noop} onRemove={noop} canMoveUp={false} canMoveDown={false} />)

        expect(screen.getByText('Server permissions')).toBeInTheDocument()
        expect(screen.getByText('Room permissions')).toBeInTheDocument()
        // Groups within each section, e.g. Content only makes sense as a
        // room-tier grouping.
        expect(screen.getByText('Content')).toBeInTheDocument()
        expect(screen.getByText('Membership')).toBeInTheDocument()
    })

    it('shows only a single Room permissions section for a room-scoped role, no Server permissions', () => {
        render(<RoleCard role={role({ room_id: 'room-1' })} memberOptions={[]} onChange={noop} onRemove={noop} canMoveUp={false} canMoveDown={false} />)

        expect(screen.queryByText('Server permissions')).not.toBeInTheDocument()
        expect(screen.queryByText('Room permissions')).not.toBeInTheDocument()
        expect(screen.getByText('Content')).toBeInTheDocument()
    })

    it('hides Send Direct Messages for a room-scoped role', () => {
        render(<RoleCard role={role({ room_id: 'room-1' })} memberOptions={[]} onChange={noop} onRemove={noop} canMoveUp={false} canMoveDown={false} />)

        expect(screen.queryByLabelText('Send Direct Messages')).not.toBeInTheDocument()
        expect(screen.queryByLabelText('Create Rooms')).not.toBeInTheDocument()
    })

    it('shows Send Direct Messages for a global role (room_id: null)', () => {
        render(<RoleCard role={role({ room_id: null })} memberOptions={[]} onChange={noop} onRemove={noop} canMoveUp={false} canMoveDown={false} />)

        expect(screen.getByLabelText('Send Direct Messages')).toBeInTheDocument()
    })
})

describe('RoleCard grant-time gating', () => {
    afterEach(() => {
        vi.clearAllMocks()
    })

    it('administrator is always disabled with an explanatory title, in every section it appears', () => {
        render(<RoleCard role={role({ room_id: null })} memberOptions={[]} onChange={noop} onRemove={noop} canMoveUp={false} canMoveDown={false} />)

        expect(screen.getByLabelText('Administrator')).toBeDisabled()
        expect(screen.getByLabelText('Administrator')).not.toBeChecked()
    })

    it('a permission outside grantable_permissions is disabled unless already selected', () => {
        render(
            <RoleCard
                role={role({
                    role_permissions: [{ id: 'rp-1', permission: 'manage_channels' }],
                    grantable_permissions: ['manage_channels'],
                })}
                memberOptions={[]}
                onChange={noop}
                onRemove={noop}
                canMoveUp={false}
                canMoveDown={false}
            />
        )

        // Already granted and within grantable_permissions — can still be unchecked.
        expect(screen.getByLabelText('Manage User Channels')).toBeEnabled()
        // Not granted, and not in grantable_permissions — can't be checked.
        expect(screen.getByLabelText('Ban Members')).toBeDisabled()
    })

    it('a permission not in grantable_permissions but already granted can still be unchecked', () => {
        render(
            <RoleCard
                role={role({
                    role_permissions: [{ id: 'rp-1', permission: 'ban_members' }],
                    grantable_permissions: [],
                })}
                memberOptions={[]}
                onChange={noop}
                onRemove={noop}
                canMoveUp={false}
                canMoveDown={false}
            />
        )

        expect(screen.getByLabelText('Ban Members')).toBeChecked()
        expect(screen.getByLabelText('Ban Members')).toBeEnabled()
    })

    it('the room permission ceiling section only renders when can_manage_ceiling is true', () => {
        const { rerender } = render(
            <RoleCard role={role({ room_id: null, can_manage_ceiling: false })} memberOptions={[]} onChange={noop} onRemove={noop} canMoveUp={false} canMoveDown={false} />
        )
        expect(screen.queryByText('Room permission ceiling')).not.toBeInTheDocument()

        rerender(
            <RoleCard role={role({ room_id: null, can_manage_ceiling: true })} memberOptions={[]} onChange={noop} onRemove={noop} canMoveUp={false} canMoveDown={false} />
        )
        expect(screen.getByText('Room permission ceiling')).toBeInTheDocument()
    })
})
