import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemberList } from '@/components/layout/MemberList'
import { usePresence } from '@/stores'
import type { PresenceEntry } from '@/stores'
import type { RoomMember, User } from '@/types'

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
})
