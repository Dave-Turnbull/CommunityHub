import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { NotificationFeed } from '@/components/messages/NotificationFeed'
import * as api from '@/services/api'
import type { AppNotification, NotificationPreference } from '@/types'

// Real Inertia <Link> needs a booted Router (createInertiaApp) to visit();
// swap it for a plain anchor (default navigation suppressed, same as the
// real Link) so clicking it in jsdom neither throws nor logs a jsdom
// "navigation not implemented" warning.
vi.mock('@inertiajs/react', () => ({
    Link: ({ href, children, onClick }: { href: string; children: ReactNode; onClick?: () => void }) => (
        <a href={href} onClick={(e) => { e.preventDefault(); onClick?.() }}>{children}</a>
    ),
}))

vi.mock('@/services/echo', () => ({
    subscribeNotifications: vi.fn(() => vi.fn()),
}))

vi.mock('@/services/api', () => ({
    fetchNotifications: vi.fn(),
    markNotificationRead: vi.fn(),
    markAllNotificationsRead: vi.fn(),
    fetchNotificationPreferences: vi.fn(),
}))

const allEnabled: NotificationPreference[] = [
    { category: 'room_invite', email: true, in_app: true },
    { category: 'room_message', email: false, in_app: true },
    { category: 'direct_message', email: false, in_app: true },
]

const roomMessage = (id: string): AppNotification => ({
    id,
    user_id: 'user-1',
    type: 'room_message',
    data: {
        room_id: 'room-1', room_name: 'Cool Room', channel_id: 'chan-1', channel_name: 'general',
        message_id: `msg-${id}`, sender_id: 'user-2', sender_name: 'Carol', preview: 'anyone around?',
    },
    read_at: null,
    created_at: '2026-01-01T00:00:00Z',
})

const directMessage = (id: string): AppNotification => ({
    id,
    user_id: 'user-1',
    type: 'direct_message',
    data: {
        conversation_id: 'conv-1', message_id: `msg-${id}`, sender_id: 'user-2',
        sender_name: 'Bob', preview: 'hey there',
    },
    read_at: null,
    created_at: '2026-01-01T00:00:00Z',
})

const commentReply = (id: string): AppNotification => ({
    id,
    user_id: 'user-1',
    type: 'comment_reply',
    data: {
        message_id: `msg-${id}`, parent_message_id: 'parent-1', root_message_id: 'root-1',
        replier_id: 'user-3', replier_name: 'Dave', preview: 'nice post!',
    },
    read_at: null,
    created_at: '2026-01-01T00:00:00Z',
})

describe('NotificationFeed', () => {
    afterEach(() => {
        vi.clearAllMocks()
    })

    it('shows an empty state when there are no notifications', async () => {
        vi.mocked(api.fetchNotifications).mockResolvedValue([])
        vi.mocked(api.fetchNotificationPreferences).mockResolvedValue(allEnabled)

        render(<NotificationFeed userId="user-1" />)

        expect(await screen.findByText("You're all caught up.")).toBeInTheDocument()
    })

    it('lists notifications for enabled categories', async () => {
        vi.mocked(api.fetchNotifications).mockResolvedValue([roomMessage('1'), directMessage('2')])
        vi.mocked(api.fetchNotificationPreferences).mockResolvedValue(allEnabled)

        render(<NotificationFeed userId="user-1" />)

        expect(await screen.findByText('Carol')).toBeInTheDocument()
        expect(screen.getByText('Bob')).toBeInTheDocument()
    })

    it('renders a comment_reply notification', async () => {
        vi.mocked(api.fetchNotifications).mockResolvedValue([commentReply('3')])
        vi.mocked(api.fetchNotificationPreferences).mockResolvedValue([
            ...allEnabled,
            { category: 'comment_reply', email: false, in_app: true },
        ])

        render(<NotificationFeed userId="user-1" />)

        expect(await screen.findByText('Dave replied')).toBeInTheDocument()
        expect(screen.getByText('nice post!')).toBeInTheDocument()
    })

    it('hides notifications for a category the user has disabled', async () => {
        vi.mocked(api.fetchNotifications).mockResolvedValue([roomMessage('1'), directMessage('2')])
        vi.mocked(api.fetchNotificationPreferences).mockResolvedValue([
            { category: 'room_invite', email: true, in_app: true },
            { category: 'room_message', email: false, in_app: false },
            { category: 'direct_message', email: false, in_app: true },
        ])

        render(<NotificationFeed userId="user-1" />)

        await screen.findByText('Bob')
        expect(screen.queryByText('Carol')).not.toBeInTheDocument()
    })

    it('does not show a filter chip for a disabled category', async () => {
        vi.mocked(api.fetchNotifications).mockResolvedValue([])
        vi.mocked(api.fetchNotificationPreferences).mockResolvedValue([
            { category: 'room_invite', email: true, in_app: true },
            { category: 'room_message', email: false, in_app: false },
            { category: 'direct_message', email: false, in_app: true },
        ])

        render(<NotificationFeed userId="user-1" />)

        await screen.findByText('All')
        expect(screen.getByText('Room Invites')).toBeInTheDocument()
        expect(screen.getByText('Messages')).toBeInTheDocument()
        expect(screen.queryByText('Room Messages')).not.toBeInTheDocument()
    })

    it('filters the list when a category chip is clicked', async () => {
        vi.mocked(api.fetchNotifications).mockResolvedValue([roomMessage('1'), directMessage('2')])
        vi.mocked(api.fetchNotificationPreferences).mockResolvedValue(allEnabled)
        const user = userEvent.setup()

        render(<NotificationFeed userId="user-1" />)
        await screen.findByText('Carol')

        await user.click(screen.getByText('Room Messages'))

        expect(screen.getByText('Carol')).toBeInTheDocument()
        expect(screen.queryByText('Bob')).not.toBeInTheDocument()
    })

    it('marks a notification read when clicked', async () => {
        vi.mocked(api.fetchNotifications).mockResolvedValue([roomMessage('1')])
        vi.mocked(api.fetchNotificationPreferences).mockResolvedValue(allEnabled)
        vi.mocked(api.markNotificationRead).mockResolvedValue(roomMessage('1'))
        const user = userEvent.setup()

        render(<NotificationFeed userId="user-1" />)
        await user.click(await screen.findByText('Carol'))

        expect(api.markNotificationRead).toHaveBeenCalledWith('1')
    })

    it('marks all notifications read', async () => {
        vi.mocked(api.fetchNotifications).mockResolvedValue([roomMessage('1'), directMessage('2')])
        vi.mocked(api.fetchNotificationPreferences).mockResolvedValue(allEnabled)
        vi.mocked(api.markAllNotificationsRead).mockResolvedValue(undefined)
        const user = userEvent.setup()

        render(<NotificationFeed userId="user-1" />)
        await screen.findByText('Carol')
        await user.click(screen.getByRole('button', { name: 'Mark all read' }))

        expect(api.markAllNotificationsRead).toHaveBeenCalled()
    })
})
