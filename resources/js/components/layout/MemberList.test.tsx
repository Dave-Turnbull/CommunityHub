import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { forwardRef } from 'react'
import type { ReactNode } from 'react'
import { MemberList } from '@/components/layout/MemberList'
import { usePresence } from '@/stores'
import * as api from '@/services/api'
import type { PresenceEntry } from '@/stores'
import type { RoomBan, RoomMember, User } from '@/types'

vi.mock('@inertiajs/react', () => ({
    Link: forwardRef<HTMLAnchorElement, { href: string; className?: string; children: ReactNode }>(
        ({ href, className, children }, ref) => <a href={href} className={className} ref={ref}>{children}</a>
    ),
    router: { reload: vi.fn() },
}))

vi.mock('@/services/api', async () => {
    const actual = await vi.importActual<typeof api>('@/services/api')
    return {
        ...actual,
        kickRoomMember: vi.fn(),
        banRoomMember: vi.fn(),
        fetchRoomBans: vi.fn(),
        unbanRoomMember: vi.fn(),
    }
})

const makeUser = (overrides: Partial<User> = {}): User => ({
    id: 'user-1', username: 'alice', display_name: 'Alice', avatar_url: null, status: 'online', ...overrides,
})

const makeMember = (overrides: Partial<RoomMember> = {}): RoomMember => ({
    id: 'rm-1', room_id: 'room-1', user_id: 'user-1', nickname: null, user: makeUser(), ...overrides,
})

const entry = (overrides: Partial<PresenceEntry> = {}): PresenceEntry => ({
    status: 'online', customStatus: null, customStatusColor: null, ...overrides,
})

describe('MemberList', () => {
    beforeEach(() => {
        usePresence.setState({ statuses: {} })
        vi.clearAllMocks()
    })

    it('groups a member as online when their live presence status is not offline', () => {
        usePresence.getState().setPresence('user-1', entry({ status: 'online' }))

        render(<MemberList members={[makeMember()]} />)

        expect(screen.getByText(/Online — 1/)).toBeInTheDocument()
    })

    it('groups a member as offline from their live presence entry (regression: an object was never === "offline")', () => {
        usePresence.getState().setPresence('user-1', entry({ status: 'offline' }))

        render(<MemberList members={[makeMember()]} />)

        expect(screen.getByText(/Offline — 1/)).toBeInTheDocument()
        expect(screen.queryByText(/Online — 1/)).not.toBeInTheDocument()
    })

    it('falls back to the seeded user status when there is no live presence entry', () => {
        render(<MemberList members={[makeMember({ user: makeUser({ status: 'offline' }) })]} />)

        expect(screen.getByText(/Offline — 1/)).toBeInTheDocument()
    })

    it('shows the live custom status text over the stale seeded prop, when status is custom', () => {
        usePresence.getState().setPresence('user-1', entry({
            status: 'custom', customStatus: 'Live status', customStatusColor: '#ff00aa',
        }))

        render(<MemberList members={[makeMember({ user: makeUser({ status: 'custom', custom_status: 'Stale status' }) })]} />)

        expect(screen.getByText('Live status')).toBeInTheDocument()
        expect(screen.queryByText('Stale status')).not.toBeInTheDocument()
    })

    it('falls back to the seeded custom status when there is no live presence entry', () => {
        render(<MemberList members={[makeMember({ user: makeUser({ status: 'custom', custom_status: 'Seeded status' }) })]} />)

        expect(screen.getByText('Seeded status')).toBeInTheDocument()
    })

    it('does not show a custom status message when status is a plain one, even if custom_status is stale-populated', () => {
        render(<MemberList members={[makeMember({ user: makeUser({ status: 'online', custom_status: 'Leftover' }) })]} />)

        expect(screen.queryByText('Leftover')).not.toBeInTheDocument()
    })

    describe('kick/ban', () => {
        it('does not render member actions without a roomId', () => {
            render(<MemberList members={[makeMember()]} canManageMembers currentUserId="someone-else" />)

            expect(screen.queryByTitle('Member actions')).not.toBeInTheDocument()
        })

        it('does not render member actions for the current user themselves', () => {
            render(<MemberList members={[makeMember()]} roomId="room-1" canManageMembers currentUserId="user-1" />)

            expect(screen.queryByTitle('Member actions')).not.toBeInTheDocument()
        })

        it('does not render member actions without manage or ban permission', () => {
            render(<MemberList members={[makeMember()]} roomId="room-1" currentUserId="someone-else" />)

            expect(screen.queryByTitle('Member actions')).not.toBeInTheDocument()
        })

        it('shows only Kick when only canManageMembers is granted', async () => {
            render(<MemberList members={[makeMember()]} roomId="room-1" currentUserId="someone-else" canManageMembers />)

            await userEvent.click(screen.getByTitle('Member actions'))

            expect(await screen.findByText('Kick')).toBeInTheDocument()
            expect(screen.queryByText('Ban')).not.toBeInTheDocument()
        })

        it('calls kickRoomMember when Kick is selected', async () => {
            vi.mocked(api.kickRoomMember).mockResolvedValue(undefined)

            render(<MemberList members={[makeMember()]} roomId="room-1" currentUserId="someone-else" canManageMembers />)

            await userEvent.click(screen.getByTitle('Member actions'))
            await userEvent.click(await screen.findByText('Kick'))

            expect(api.kickRoomMember).toHaveBeenCalledWith('room-1', 'user-1', false)
        })

        it('shows the owner transfer modal when kicking requires confirmation, then confirms', async () => {
            vi.mocked(api.kickRoomMember)
                .mockRejectedValueOnce(new api.OwnerTransferRequiredError('You will become the new Owner.'))
                .mockResolvedValueOnce(undefined)

            render(<MemberList members={[makeMember()]} roomId="room-1" currentUserId="someone-else" canManageMembers />)

            await userEvent.click(screen.getByTitle('Member actions'))
            await userEvent.click(await screen.findByText('Kick'))

            expect(await screen.findByText('You will become the new Owner.')).toBeInTheDocument()

            await userEvent.click(screen.getByText('Confirm'))

            expect(api.kickRoomMember).toHaveBeenLastCalledWith('room-1', 'user-1', true)
        })
    })

    describe('banned list', () => {
        const makeBan = (id: string, name: string): RoomBan => ({
            id: `ban-${id}`,
            user: { id, username: name.toLowerCase(), display_name: name, avatar_url: null },
            banned_by: null,
            banned_at: '2026-01-01T00:00:00.000Z',
        })

        const renderBans = () =>
            render(<MemberList members={[makeMember()]} roomId="room-1" currentUserId="someone-else" canBanMembers />)

        it('is hidden without canBanMembers', () => {
            render(<MemberList members={[makeMember()]} roomId="room-1" currentUserId="someone-else" canManageMembers />)

            expect(screen.queryByText(/Banned/)).not.toBeInTheDocument()
        })

        it('is hidden without a roomId', () => {
            render(<MemberList members={[makeMember()]} canBanMembers />)

            expect(screen.queryByText(/Banned/)).not.toBeInTheDocument()
        })

        it('does not fetch until expanded, then renders the banned users', async () => {
            vi.mocked(api.fetchRoomBans).mockResolvedValue([makeBan('u-2', 'Mallory'), makeBan('u-3', 'Trudy')])

            renderBans()

            expect(api.fetchRoomBans).not.toHaveBeenCalled()

            await userEvent.click(screen.getByText(/Banned/))

            expect(await screen.findByText('Mallory')).toBeInTheDocument()
            expect(screen.getByText('Trudy')).toBeInTheDocument()
            expect(screen.getByText(/Banned — 2/)).toBeInTheDocument()
            expect(api.fetchRoomBans).toHaveBeenCalledWith('room-1')
        })

        it('shows the empty state', async () => {
            vi.mocked(api.fetchRoomBans).mockResolvedValue([])

            renderBans()
            await userEvent.click(screen.getByText(/Banned/))

            expect(await screen.findByText('No one is banned.')).toBeInTheDocument()
        })

        it('unbans through the API and removes the row', async () => {
            vi.mocked(api.fetchRoomBans).mockResolvedValue([makeBan('u-2', 'Mallory'), makeBan('u-3', 'Trudy')])
            vi.mocked(api.unbanRoomMember).mockResolvedValue(undefined)

            renderBans()
            await userEvent.click(screen.getByText(/Banned/))
            await screen.findByText('Mallory')

            await userEvent.click(screen.getAllByText('Unban')[0])

            expect(api.unbanRoomMember).toHaveBeenCalledWith('room-1', 'u-2')
            await waitFor(() => expect(screen.queryByText('Mallory')).not.toBeInTheDocument())
            expect(screen.getByText('Trudy')).toBeInTheDocument()
        })

        it('keeps the row and shows an error when unbanning fails', async () => {
            vi.mocked(api.fetchRoomBans).mockResolvedValue([makeBan('u-2', 'Mallory')])
            vi.mocked(api.unbanRoomMember).mockRejectedValue(new Error('boom'))

            renderBans()
            await userEvent.click(screen.getByText(/Banned/))
            await screen.findByText('Mallory')

            await userEvent.click(screen.getByText('Unban'))

            expect(await screen.findByText(/Unbanning Mallory failed/)).toBeInTheDocument()
            expect(screen.getByText('Mallory')).toBeInTheDocument()
        })

        it('refetches an expanded list after a successful ban from the member dropdown', async () => {
            vi.mocked(api.fetchRoomBans).mockResolvedValueOnce([]).mockResolvedValueOnce([makeBan('user-1', 'Alice')])
            vi.mocked(api.banRoomMember).mockResolvedValue(undefined)

            renderBans()
            await userEvent.click(screen.getByText(/Banned/))
            await screen.findByText('No one is banned.')

            await userEvent.click(screen.getByTitle('Member actions'))
            await userEvent.click(await screen.findByText('Ban'))

            await waitFor(() => expect(api.fetchRoomBans).toHaveBeenCalledTimes(2))
            expect(await screen.findByText(/Banned — 1/)).toBeInTheDocument()
        })
    })
})
