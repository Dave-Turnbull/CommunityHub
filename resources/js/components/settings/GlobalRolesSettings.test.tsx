import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GlobalRolesSettings } from '@/components/settings/GlobalRolesSettings'
import * as api from '@/services/api'
import type { Role, User } from '@/types'

vi.mock('@/services/api', () => ({
    addRoleMember: vi.fn(),
    createGlobalRole: vi.fn(),
    deleteRole: vi.fn(),
    fetchGlobalRoles: vi.fn(),
    removeRoleMember: vi.fn(),
    reorderGlobalRoles: vi.fn(),
    updateRole: vi.fn(),
}))

const alice: User = {
    id: 'user-1', username: 'alice', display_name: 'Alice', avatar_url: null, status: 'online',
}
const bob: User = {
    id: 'user-2', username: 'bob', display_name: 'Bob', avatar_url: null, status: 'online',
}

function role(overrides: Partial<Role>): Role {
    return {
        id: 'role-x', room_id: null, name: 'Role', position: 0,
        is_default: false, is_system: false, role_permissions: [], users: [],
        can_manage: true, ...overrides,
    }
}

const admin = role({ id: 'admin', name: 'Administrator', is_system: true, position: 100 })
const member = role({ id: 'member', name: 'Member', is_system: true, is_default: true, position: 0 })

describe('GlobalRolesSettings', () => {
    afterEach(() => {
        vi.clearAllMocks()
    })

    it('fetches and renders global roles on mount', async () => {
        vi.mocked(api.fetchGlobalRoles).mockResolvedValue({ roles: [admin, member], users: [alice, bob] })

        render(<GlobalRolesSettings />)

        expect(await screen.findByRole('heading', { name: 'Administrator' })).toBeInTheDocument()
        expect(screen.getByText('Member')).toBeInTheDocument()
    })

    it('creates a new global role', async () => {
        vi.mocked(api.fetchGlobalRoles).mockResolvedValue({ roles: [admin, member], users: [alice, bob] })
        const created = role({ id: 'new-role', name: 'Support', position: 1, can_manage: true })
        vi.mocked(api.createGlobalRole).mockResolvedValue(created)
        const u = userEvent.setup()

        render(<GlobalRolesSettings />)
        await screen.findByRole('heading', { name: 'Administrator' })

        await u.type(screen.getByPlaceholderText('New role name'), 'Support')
        await u.click(screen.getByRole('button', { name: 'New role' }))

        expect(api.createGlobalRole).toHaveBeenCalledWith('Support')
        expect(await screen.findByText('Support')).toBeInTheDocument()
    })

    it('reorders custom global roles without a per-room hierarchy gate', async () => {
        const low = role({ id: 'low', name: 'Trainee', position: 10 })
        const high = role({ id: 'high', name: 'Support', position: 20 })
        vi.mocked(api.fetchGlobalRoles).mockResolvedValue({ roles: [admin, high, low, member], users: [alice, bob] })
        vi.mocked(api.reorderGlobalRoles).mockResolvedValue(undefined)
        const u = userEvent.setup()

        render(<GlobalRolesSettings />)
        const traineeHeading = await screen.findByText('Trainee')
        const card = traineeHeading.closest('div.bg-second') as HTMLElement
        await u.click(within(card).getByTitle('Move up'))

        expect(api.reorderGlobalRoles).toHaveBeenCalledWith(['low', 'high'])
    })

    it('deletes a custom role', async () => {
        const custom = role({ id: 'custom', name: 'Support', position: 10 })
        vi.mocked(api.fetchGlobalRoles).mockResolvedValue({ roles: [admin, custom, member], users: [alice, bob] })
        vi.mocked(api.deleteRole).mockResolvedValue(undefined)
        const u = userEvent.setup()

        render(<GlobalRolesSettings />)
        const heading = await screen.findByText('Support')
        const card = heading.closest('div.bg-second') as HTMLElement
        await u.click(within(card).getByRole('button', { name: 'Delete role' }))

        expect(api.deleteRole).toHaveBeenCalledWith('custom')
    })

    it('lists every instance user as an assignable member option, not just room members', async () => {
        const custom = role({ id: 'custom', name: 'Support', position: 10 })
        vi.mocked(api.fetchGlobalRoles).mockResolvedValue({ roles: [admin, custom, member], users: [alice, bob] })
        const u = userEvent.setup()

        render(<GlobalRolesSettings />)
        const heading = await screen.findByText('Support')
        const card = heading.closest('div.bg-second') as HTMLElement
        await u.click(within(card).getByRole('combobox'))

        expect(within(card).getByText('Bob')).toBeInTheDocument()
    })
})
