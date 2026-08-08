import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RoomRolesPanel } from '@/components/roles/RoomRolesPanel'
import * as api from '@/services/api'
import type { Role, Room, RoomMember, User } from '@/types'

vi.mock('@/services/api', () => ({
    addRoleMember: vi.fn(),
    createRole: vi.fn(),
    deleteRole: vi.fn(),
    fetchRoomRoles: vi.fn(),
    removeRoleMember: vi.fn(),
    reorderRoles: vi.fn(),
    updateRole: vi.fn(),
}))

const room: Room = {
    id: 'room-1', name: 'Cool Room', icon_url: null, owner_id: 'user-1', invite_code: 'abc123',
}

const user: User = {
    id: 'user-1', username: 'alice', display_name: 'Alice', avatar_url: null, status: 'online',
}

const members: RoomMember[] = [{ id: 'rm-1', room_id: 'room-1', user_id: 'user-1', nickname: null, user }]

function role(overrides: Partial<Role>): Role {
    return {
        id: 'role-x', room_id: 'room-1', name: 'Role', position: 0,
        is_default: false, is_system: false, role_permissions: [], users: [],
        can_manage: true, ...overrides,
    }
}

const owner = role({ id: 'owner', name: 'Owner', is_system: true, position: 100, can_manage: false })
const member = role({ id: 'member', name: 'Member', is_system: true, is_default: true, position: 0 })
const customHigh = role({ id: 'custom-high', name: 'Moderator', position: 20 })
const customLow = role({ id: 'custom-low', name: 'Trainee', position: 10, can_manage: false })

describe('RoomRolesPanel', () => {
    afterEach(() => {
        vi.clearAllMocks()
    })

    it('fetches and renders room roles on mount', async () => {
        vi.mocked(api.fetchRoomRoles).mockResolvedValue({ roles: [owner, member], members })

        render(<RoomRolesPanel room={room} />)

        expect(await screen.findByRole('heading', { name: 'Owner' })).toBeInTheDocument()
        expect(screen.getByText('Member')).toBeInTheDocument()
        expect(api.fetchRoomRoles).toHaveBeenCalledWith('room-1')
    })

    it('renders the Owner role as fully read-only with no permission checkboxes', async () => {
        vi.mocked(api.fetchRoomRoles).mockResolvedValue({ roles: [owner, member], members })

        render(<RoomRolesPanel room={room} />)

        const ownerHeading = await screen.findByText('Owner')
        const card = ownerHeading.closest('div.bg-second') as HTMLElement

        expect(screen.getByText(/Full access/)).toBeInTheDocument()
        expect(within(card).queryAllByRole('checkbox')).toHaveLength(0)
    })

    it('renders the Member (default) role as editable, with Administrator disabled', async () => {
        vi.mocked(api.fetchRoomRoles).mockResolvedValue({ roles: [owner, member], members })

        render(<RoomRolesPanel room={room} />)
        await screen.findByText('Owner')

        const adminToggle = screen.getByLabelText('Administrator') as HTMLButtonElement
        expect(adminToggle.disabled).toBe(true)
        expect(adminToggle.getAttribute('aria-checked')).toBe('false')

        expect(screen.getByRole('button', { name: 'Save permissions' })).toBeInTheDocument()
    })

    it('hides manage actions on a role the viewer is outranked by', async () => {
        vi.mocked(api.fetchRoomRoles).mockResolvedValue({ roles: [owner, customHigh, customLow, member], members })

        render(<RoomRolesPanel room={room} />)

        const traineeHeading = await screen.findByText('Trainee')
        const card = traineeHeading.closest('div.bg-second') as HTMLElement

        expect(screen.getByText('🔒 Locked')).toBeInTheDocument()
        expect(within(card).queryByRole('button', { name: 'Save permissions' })).not.toBeInTheDocument()
        expect(within(card).queryByRole('button', { name: 'Delete role' })).not.toBeInTheDocument()
    })

    it('shows add-member/save-permissions controls right away for a newly created role, without a reload', async () => {
        // Regression: Api\RoleController::store used to omit can_manage from
        // its response, so RoleCard's `role.can_manage ?? false` rendered a
        // just-created role as unmanageable until a full refetch.
        vi.mocked(api.fetchRoomRoles).mockResolvedValue({ roles: [owner, member], members })
        const created = role({ id: 'new-role', name: 'Moderator', position: 1, can_manage: true })
        vi.mocked(api.createRole).mockResolvedValue(created)
        const u = userEvent.setup()

        render(<RoomRolesPanel room={room} />)
        await screen.findByText('Owner')

        await u.type(screen.getByPlaceholderText('New role name'), 'Moderator')
        await u.click(screen.getByRole('button', { name: 'New role' }))

        const heading = await screen.findByText('Moderator')
        const card = heading.closest('div.bg-second') as HTMLElement
        expect(within(card).getByRole('button', { name: 'Save permissions' })).toBeInTheDocument()
    })

    it('refetches after successfully removing a member, to pick up any server-side fallback reassignment', async () => {
        const memberWithUsers = role({
            id: 'member', name: 'Member', is_system: true, is_default: true, position: 0,
            users: [{ id: 'user-2', username: 'bob', display_name: 'Bob', avatar_url: null, status: 'online' }],
        })
        vi.mocked(api.fetchRoomRoles).mockResolvedValue({ roles: [owner, memberWithUsers], members })
        vi.mocked(api.removeRoleMember).mockResolvedValue(undefined)
        const u = userEvent.setup()

        render(<RoomRolesPanel room={room} />)
        const memberHeading = await screen.findByText('Member')
        const card = memberHeading.closest('div.bg-second') as HTMLElement
        await u.click(within(card).getByRole('button', { name: 'Remove' }))

        expect(api.fetchRoomRoles).toHaveBeenCalledTimes(2)
    })

    it('refetches after successfully deleting a role, to pick up any orphaned-member fallback', async () => {
        vi.mocked(api.fetchRoomRoles).mockResolvedValue({ roles: [owner, customHigh, member], members })
        vi.mocked(api.deleteRole).mockResolvedValue(undefined)
        const u = userEvent.setup()

        render(<RoomRolesPanel room={room} />)
        const heading = await screen.findByText('Moderator')
        const card = heading.closest('div.bg-second') as HTMLElement
        await u.click(within(card).getByRole('button', { name: 'Delete role' }))

        expect(api.deleteRole).toHaveBeenCalledWith('custom-high')
        expect(api.fetchRoomRoles).toHaveBeenCalledTimes(2)
    })

    it('shows an error message when removing a member fails (e.g. their only role)', async () => {
        const memberWithUsers = role({
            id: 'member', name: 'Member', is_system: true, is_default: true, position: 0,
            users: [{ id: 'user-2', username: 'bob', display_name: 'Bob', avatar_url: null, status: 'online' }],
        })
        vi.mocked(api.fetchRoomRoles).mockResolvedValue({ roles: [owner, memberWithUsers], members })
        vi.mocked(api.removeRoleMember).mockRejectedValue({
            response: { data: { message: 'A user must hold at least one role — assign another before removing this one.' } },
        })
        const u = userEvent.setup()

        render(<RoomRolesPanel room={room} />)
        const memberHeading = await screen.findByText('Member')
        const card = memberHeading.closest('div.bg-second') as HTMLElement
        await u.click(within(card).getByRole('button', { name: 'Remove' }))

        expect(await within(card).findByText(/must hold at least one role/)).toBeInTheDocument()
    })

    it('reorders custom roles and calls the API with the new order', async () => {
        const manageableLow = role({ id: 'custom-low', name: 'Trainee', position: 10, can_manage: true })
        vi.mocked(api.fetchRoomRoles).mockResolvedValue({ roles: [owner, customHigh, manageableLow, member], members })
        vi.mocked(api.reorderRoles).mockResolvedValue(undefined)
        const u = userEvent.setup()

        render(<RoomRolesPanel room={room} />)

        // customLow ("Trainee") is ranked below customHigh ("Moderator") —
        // moving it up should swap their order (Trainee, Moderator).
        const traineeHeading = await screen.findByText('Trainee')
        const card = traineeHeading.closest('div.bg-second') as HTMLElement
        const upButton = within(card).getByTitle('Move up')

        await u.click(upButton)

        expect(api.reorderRoles).toHaveBeenCalledWith('room-1', ['custom-low', 'custom-high'])
        // Reordering can change which roles the viewer outranks (and so
        // can_manage), which the local position-only optimistic update
        // doesn't know how to recompute — see Api\RoleController::reorder.
        expect(api.fetchRoomRoles).toHaveBeenCalledTimes(2)
    })
})
