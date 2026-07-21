import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { forwardRef } from 'react'
import type { ReactNode } from 'react'
import { RoomRail } from '@/components/layout/RoomRail'
import * as api from '@/services/api'
import type { Room } from '@/types'

vi.mock('@inertiajs/react', () => ({
    // Radix's Tooltip.Trigger asChild clones this and attaches a ref —
    // forwardRef avoids a "function components cannot be given refs" warning.
    Link: forwardRef<HTMLAnchorElement, { href: string; children: ReactNode }>(
        ({ href, children }, ref) => <a href={href} ref={ref}>{children}</a>
    ),
    usePage: () => ({ url: '/' }),
}))

vi.mock('@/services/echo', () => ({
    subscribeNotifications: vi.fn(() => vi.fn()),
}))

vi.mock('@/services/api', () => ({
    fetchNotifications: vi.fn(),
    markNotificationRead: vi.fn(),
    markAllNotificationsRead: vi.fn(),
}))

const rooms: Room[] = [
    { id: 'room-1', name: 'Cool Room', icon_url: null, owner_id: 'user-1', invite_code: 'abc123' },
]

describe('RoomRail', () => {
    afterEach(() => {
        vi.clearAllMocks()
    })

    it('renders no unread badge when there are no unread notifications', async () => {
        vi.mocked(api.fetchNotifications).mockResolvedValue([])

        render(<RoomRail rooms={rooms} currentUserId="user-1" />)

        await screen.findByText('C')
        expect(screen.queryByText('1')).not.toBeInTheDocument()
    })

    it('shows an unread count badge on the Messages icon', async () => {
        vi.mocked(api.fetchNotifications).mockResolvedValue([
            {
                id: 'notif-1', user_id: 'user-1', type: 'direct_message',
                data: {
                    conversation_id: 'conv-1', message_id: 'msg-1', sender_id: 'user-2',
                    sender_name: 'Bob', preview: 'hey',
                },
                read_at: null, created_at: '2026-01-01T00:00:00Z',
            },
        ])

        render(<RoomRail rooms={rooms} currentUserId="user-1" />)

        expect(await screen.findByText('1')).toBeInTheDocument()
    })
})
