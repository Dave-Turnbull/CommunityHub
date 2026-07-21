import { useEffect } from 'react'
import { useNotifications as useNotificationStore } from '@/stores'
import { subscribeNotifications } from '@/services/echo'
import { fetchNotifications, markAllNotificationsRead, markNotificationRead } from '@/services/api'

/**
 * Seeds the notification store with the current user's recent notifications
 * and subscribes to their private websocket channel for new ones.
 */
export function useNotifications(userId: string) {
    const notifications  = useNotificationStore((s) => s.notifications)
    const setNotifications = useNotificationStore((s) => s.setNotifications)
    const markReadLocal    = useNotificationStore((s) => s.markRead)
    const markAllReadLocal = useNotificationStore((s) => s.markAllRead)

    useEffect(() => {
        fetchNotifications().then(setNotifications)
    }, [userId])

    useEffect(() => subscribeNotifications(userId), [userId])

    const markRead = async (notificationId: string) => {
        markReadLocal(notificationId)
        await markNotificationRead(notificationId)
    }

    const markAllRead = async () => {
        markAllReadLocal()
        await markAllNotificationsRead()
    }

    const unreadCount = notifications.filter((n) => !n.read_at).length

    return { notifications, unreadCount, markRead, markAllRead }
}
