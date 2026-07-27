import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { forwardRef } from 'react'
import type { ReactNode } from 'react'
import { MemberList } from '@/components/layout/MemberList'
import { usePresence } from '@/stores'
import * as api from '@/services/api'
import type { PresenceEntry } from '@/stores'
import type { RoomMember, User } from '@/types'

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
})
