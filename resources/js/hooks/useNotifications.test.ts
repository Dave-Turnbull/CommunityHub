import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useNotifications } from '@/hooks/useNotifications'
import { useNotifications as useNotificationStore } from '@/stores'
import * as api from '@/services/api'
import * as echo from '@/services/echo'
import type { AppNotification } from '@/types'

vi.mock('@/services/echo', () => ({
    subscribeNotifications: vi.fn(() => vi.fn()),
}))

vi.mock('@/services/api', () => ({
    fetchNotifications: vi.fn(),
    markNotificationRead: vi.fn(),
    markAllNotificationsRead: vi.fn(),
}))

const notification = (id: string, read = false): AppNotification => ({
    id,
    user_id: 'user-1',
    type: 'direct_message',
    data: {
        conversation_id: 'conv-1',
        message_id: `msg-${id}`,
        sender_id: 'user-2',
        sender_name: 'Bob',
        preview: 'hey',
    },
    read_at: read ? '2026-01-01T00:00:00Z' : null,
    created_at: '2026-01-01T00:00:00Z',
})

describe('useNotifications', () => {
    beforeEach(() => {
        useNotificationStore.setState({ notifications: [] })
        vi.mocked(api.fetchNotifications).mockResolvedValue([])
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    it('fetches and seeds the store on mount', async () => {
        vi.mocked(api.fetchNotifications).mockResolvedValue([notification('1')])

        const { result } = renderHook(() => useNotifications('user-1'))

        await waitFor(() => {
            expect(result.current.notifications).toHaveLength(1)
        })
    })

    it('subscribes to the user channel on mount and unsubscribes on unmount', () => {
        const unsubscribe = vi.fn()
        vi.mocked(echo.subscribeNotifications).mockReturnValue(unsubscribe)

        const { unmount } = renderHook(() => useNotifications('user-1'))

        expect(echo.subscribeNotifications).toHaveBeenCalledWith('user-1')

        unmount()
        expect(unsubscribe).toHaveBeenCalled()
    })

    it('computes unreadCount from unread notifications', async () => {
        vi.mocked(api.fetchNotifications).mockResolvedValue([notification('1'), notification('2', true)])

        const { result } = renderHook(() => useNotifications('user-1'))

        await waitFor(() => {
            expect(result.current.unreadCount).toBe(1)
        })
    })

    it('markRead updates the store optimistically and calls the API', async () => {
        vi.mocked(api.fetchNotifications).mockResolvedValue([notification('1')])

        const { result } = renderHook(() => useNotifications('user-1'))
        await waitFor(() => expect(result.current.notifications).toHaveLength(1))

        await act(async () => {
            await result.current.markRead('1')
        })

        expect(api.markNotificationRead).toHaveBeenCalledWith('1')
        expect(useNotificationStore.getState().notifications[0].read_at).not.toBeNull()
    })

    it('markAllRead updates the store optimistically and calls the API', async () => {
        vi.mocked(api.fetchNotifications).mockResolvedValue([notification('1'), notification('2')])

        const { result } = renderHook(() => useNotifications('user-1'))
        await waitFor(() => expect(result.current.notifications).toHaveLength(2))

        await act(async () => {
            await result.current.markAllRead()
        })

        expect(api.markAllNotificationsRead).toHaveBeenCalled()
        expect(useNotificationStore.getState().notifications.every((n) => n.read_at !== null)).toBe(true)
    })
})
