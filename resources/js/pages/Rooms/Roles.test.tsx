import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { forwardRef } from 'react'
import type { ReactNode } from 'react'
import { router } from '@inertiajs/react'
import RoomRoles from '@/pages/Rooms/Roles'
import * as api from '@/services/api'
import type { Role, RoomRolesPageProps, User } from '@/types'

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    Link: forwardRef<HTMLAnchorElement, { href: string; className?: string; children: ReactNode }>(
        ({ href, className, children }, ref) => <a href={href} className={className} ref={ref}>{children}</a>
    ),
    router: { reload: vi.fn() },
}))

vi.mock('@/components/layout/RoomRail', () => ({
    RoomRail: () => null,
}))

vi.mock('@/services/api', () => ({
    addRoleMember: vi.fn(),
    createRole: vi.fn(),
    deleteRole: vi.fn(),
    removeRoleMember: vi.fn(),
    reorderRoles: vi.fn(),
    updateRole: vi.fn(),
}))

const user: User = {
    id: 'user-1', username: 'alice', display_name: 'Alice', avatar_url: null, status: 'online',
}

function role(overrides: Partial<Role>): Role {
    return {
        id: 'role-x', room_id: 'room-1', name: 'Role', position: 0,
        is_default: false, is_system: false, role_permissions: [], users: [],
        can_manage: true, ...overrides,
    }
}

const owner = role({ id: 'owner', name: 'Owner', is_system: true, position: 100, can_manage: false });
const member = role({ id: 'member', name: 'Member', is_system: true, is_default: true, position: 0 })
const customHigh = role({ id: 'custom-high', name: 'Moderator', position: 20 })
const customLow = role({ id: 'custom-low', name: 'Trainee', position: 10, can_manage: false })

function buildProps(roles: Role[]): RoomRolesPageProps {
    return {
        appName: 'CommunityHub',
        auth: { user },
        rooms: [],
        conversations: [],
        recentCustomStatuses: [],
        flash: {},
        room: {
            id: 'room-1', name: 'Cool Room', icon_url: null, owner_id: 'user-1', invite_code: 'abc123',
            roles,
            members: [{ id: 'rm-1', room_id: 'room-1', user_id: 'user-1', nickname: null, user }],
        },
    }
}

describe('Rooms/Roles', () => {
    afterEach(() => {
        vi.clearAllMocks()
    })

    it('renders the Owner role as fully read-only with no permission checkboxes', () => {
        render(<RoomRoles {...buildProps([owner, member])} />)

        const ownerHeading = screen.getByText('Owner')
        const card = ownerHeading.closest('div.bg-surface-panel') as HTMLElement

        expect(screen.getByText(/Full access to this room/)).toBeInTheDocument()
        expect(within(card).queryAllByRole('checkbox')).toHaveLength(0)
    })

    it('renders the Member (default) role as editable, with Administrator disabled', () => {
        render(<RoomRoles {...buildProps([owner, member])} />)

        const adminCheckbox = screen.getByLabelText('Administrator') as HTMLInputElement
        expect(adminCheckbox.disabled).toBe(true)
        expect(adminCheckbox.checked).toBe(false)

        const manageChannelsCheckbox = screen.getByLabelText('Manage Channels') as HTMLInputElement
        expect(manageChannelsCheckbox.disabled).toBe(false)

        expect(screen.getByRole('button', { name: 'Save permissions' })).toBeInTheDocument()
    })

    it('never shows Administrator as checked or togglable on a custom role', async () => {
        render(<RoomRoles {...buildProps([owner, customHigh, member])} />)

        const cards = screen.getAllByLabelText('Administrator') as HTMLInputElement[]
        cards.forEach((checkbox) => expect(checkbox.disabled).toBe(true))
    })

    it('hides manage actions on a role the viewer is outranked by', () => {
        render(<RoomRoles {...buildProps([owner, customHigh, customLow, member])} />)

        const traineeHeading = screen.getByText('Trainee')
        const card = traineeHeading.closest('div.bg-surface-panel') as HTMLElement

        expect(screen.getByText('🔒 Locked')).toBeInTheDocument()
        expect(card).not.toBeNull()
        expect(within(card).queryByRole('button', { name: 'Save permissions' })).not.toBeInTheDocument()
        expect(within(card).queryByRole('button', { name: 'Delete role' })).not.toBeInTheDocument()
    })

    it('shows add-member/save-permissions controls right away for a newly created role, without a reload', async () => {
        // Regression: Api\RoleController::store used to omit can_manage from
        // its response, so RoleCard's `role.can_manage ?? false` rendered a
        // just-created role as unmanageable until a full page refresh.
        const created = role({ id: 'new-role', name: 'Moderator', position: 1, can_manage: true })
        vi.mocked(api.createRole).mockResolvedValue(created)
        const u = userEvent.setup()

        render(<RoomRoles {...buildProps([owner, member])} />)

        await u.type(screen.getByPlaceholderText('New role name'), 'Moderator')
        await u.click(screen.getByRole('button', { name: 'New role' }))

        const heading = await screen.findByText('Moderator')
        const card = heading.closest('div.bg-surface-panel') as HTMLElement
        expect(within(card).getByRole('button', { name: 'Save permissions' })).toBeInTheDocument()
    })

    it('shows remove/add-member controls on the Member role now that it is manageable', () => {
        const memberWithUsers = role({
            id: 'member', name: 'Member', is_system: true, is_default: true, position: 0,
            users: [{ id: 'user-2', username: 'bob', display_name: 'Bob', avatar_url: null, status: 'online' }],
        })

        render(<RoomRoles {...buildProps([owner, memberWithUsers])} />)

        const memberHeading = screen.getByText('Member')
        const card = memberHeading.closest('div.bg-surface-panel') as HTMLElement

        expect(within(card).getByRole('button', { name: 'Remove' })).toBeInTheDocument()
    })

    it('reloads the room prop after successfully removing a member, to pick up any server-side fallback reassignment', async () => {
        vi.mocked(api.removeRoleMember).mockResolvedValue(undefined)
        const memberWithUsers = role({
            id: 'member', name: 'Member', is_system: true, is_default: true, position: 0,
            users: [{ id: 'user-2', username: 'bob', display_name: 'Bob', avatar_url: null, status: 'online' }],
        })
        const u = userEvent.setup()

        render(<RoomRoles {...buildProps([owner, memberWithUsers])} />)

        const memberHeading = screen.getByText('Member')
        const card = memberHeading.closest('div.bg-surface-panel') as HTMLElement
        await u.click(within(card).getByRole('button', { name: 'Remove' }))

        expect(router.reload).toHaveBeenCalledWith({ only: ['room'] })
    })

    it('reloads the room prop after successfully deleting a role, to pick up any orphaned-member fallback', async () => {
        vi.mocked(api.deleteRole).mockResolvedValue(undefined)
        const u = userEvent.setup()

        render(<RoomRoles {...buildProps([owner, customHigh, member])} />)

        const heading = screen.getByText('Moderator')
        const card = heading.closest('div.bg-surface-panel') as HTMLElement
        await u.click(within(card).getByRole('button', { name: 'Delete role' }))

        expect(router.reload).toHaveBeenCalledWith({ only: ['room'] })
    })

    it('shows an error message when removing a member fails (e.g. their only role)', async () => {
        vi.mocked(api.removeRoleMember).mockRejectedValue({
            response: { data: { message: 'A user must hold at least one role — assign another before removing this one.' } },
        })
        const memberWithUsers = role({
            id: 'member', name: 'Member', is_system: true, is_default: true, position: 0,
            users: [{ id: 'user-2', username: 'bob', display_name: 'Bob', avatar_url: null, status: 'online' }],
        })
        const u = userEvent.setup()

        render(<RoomRoles {...buildProps([owner, memberWithUsers])} />)

        const memberHeading = screen.getByText('Member')
        const card = memberHeading.closest('div.bg-surface-panel') as HTMLElement
        await u.click(within(card).getByRole('button', { name: 'Remove' }))

        expect(await within(card).findByText(/must hold at least one role/)).toBeInTheDocument()
    })

    it('reorders custom roles and calls the API with the new order', async () => {
        vi.mocked(api.reorderRoles).mockResolvedValue(undefined)
        const u = userEvent.setup()
        const manageableLow = role({ id: 'custom-low', name: 'Trainee', position: 10, can_manage: true })

        render(<RoomRoles {...buildProps([owner, customHigh, manageableLow, member])} />)

        // customLow ("Trainee") is ranked below customHigh ("Moderator") —
        // moving it up should swap their order (Trainee, Moderator).
        const traineeHeading = screen.getByText('Trainee')
        const card = traineeHeading.closest('div.bg-surface-panel') as HTMLElement
        const upButton = within(card).getByTitle('Move up')

        await u.click(upButton)

        expect(api.reorderRoles).toHaveBeenCalledWith('room-1', ['custom-low', 'custom-high'])
        // Reordering can change which roles the viewer outranks (and so
        // can_manage), which the local position-only optimistic update
        // doesn't know how to recompute — see Api\RoleController::reorder.
        expect(router.reload).toHaveBeenCalledWith({ only: ['room'] })
    })
})
