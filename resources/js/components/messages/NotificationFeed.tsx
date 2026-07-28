import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { Link } from '@inertiajs/react'
import { useNotifications } from '@/hooks/useNotifications'
import { fetchNotificationPreferences } from '@/services/api'
import { NOTIFICATION_CATEGORY_LABELS } from '@/types'
import type { AppNotification, NotificationCategory } from '@/types'

const time = (iso: string) =>
    new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Where the notification links to, and its title/subtitle — varies by category. */
function present(notification: AppNotification): { href: string; title: string; subtitle: string } {
    switch (notification.type) {
        case 'direct_message':
            return {
                href: `/conversations/${notification.data.conversation_id}`,
                title: notification.data.sender_name,
                subtitle: notification.data.preview,
            }
        case 'room_message':
            return {
                href: `/channels/${notification.data.channel_id}`,
                title: notification.data.sender_name,
                subtitle: `#${notification.data.channel_name}: ${notification.data.preview}`,
            }
        case 'room_invite':
            return {
                href: `/invite/${notification.data.invite_token}`,
                title: `Invited to ${notification.data.room_name}`,
                subtitle: `${notification.data.invited_by} invited you to join.`,
            }
        case 'comment_reply':
            return {
                href: `/messages/${notification.data.message_id}`,
                title: `${notification.data.replier_name} replied`,
                subtitle: notification.data.preview,
            }
    }
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
    return (
        <button
            onClick={onClick}
            className={clsx(
                'px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors duration-100',
                active
                    ? 'bg-accent-primary text-inverse'
                    : 'bg-second text-text-secondary hover:text-text-primary hover:bg-fifth',
            )}
        >
            {children}
        </button>
    )
}

function Row({ notification, onRead }: { notification: AppNotification; onRead: (id: string) => void }) {
    const unread = !notification.read_at
    const { href, title, subtitle } = present(notification)

    return (
        <Link
            href={href}
            onClick={() => unread && onRead(notification.id)}
            className={clsx(
                'block px-6 py-3 border-b border-third hover:bg-fifth transition-colors',
                unread && 'bg-second',
            )}
        >
            <div className="flex items-center gap-1.5">
                {unread && <span className="w-1.5 h-1.5 rounded-full bg-accent-primary flex-shrink-0" />}
                <p className="text-sm font-medium text-text-primary truncate">{title}</p>
                <span className="ml-auto text-[11px] text-text-muted flex-shrink-0">
                    {time(notification.created_at)}
                </span>
            </div>
            <p className="text-xs text-text-muted truncate mt-0.5">{subtitle}</p>
        </Link>
    )
}

export function NotificationFeed({ userId }: { userId: string }) {
    const { notifications, unreadCount, markRead, markAllRead } = useNotifications(userId)
    const [enabledCategories, setEnabledCategories] = useState<NotificationCategory[]>([])
    const [filter, setFilter] = useState<'all' | NotificationCategory>('all')

    useEffect(() => {
        fetchNotificationPreferences().then((preferences) =>
            setEnabledCategories(preferences.filter((p) => p.in_app).map((p) => p.category))
        )
    }, [userId])

    // A category disabled after some notifications of that type already
    // existed shouldn't surface them either — the backend already excludes
    // these from `notifications`, this just also drops them from the filter
    // chips themselves.
    const visible = notifications.filter((n) => enabledCategories.includes(n.type))
    const filtered = filter === 'all' ? visible : visible.filter((n) => n.type === filter)

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-primary">
            <div className="h-12 px-6 flex items-center justify-between border-b border-third flex-shrink-0">
                <span className="font-semibold text-text-primary">Notifications</span>
                {unreadCount > 0 && (
                    <button onClick={() => markAllRead()} className="text-xs text-accent-primary hover:underline">
                        Mark all read
                    </button>
                )}
            </div>

            <div className="flex items-center gap-2 px-6 py-3 border-b border-third overflow-x-auto flex-shrink-0">
                <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>All</FilterChip>
                {enabledCategories.map((category) => (
                    <FilterChip key={category} active={filter === category} onClick={() => setFilter(category)}>
                        {NOTIFICATION_CATEGORY_LABELS[category]}
                    </FilterChip>
                ))}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
                {filtered.length === 0 ? (
                    <div className="h-full grid place-items-center text-center px-8">
                        <div>
                            <p className="text-5xl mb-4">🔔</p>
                            <p className="text-sm text-text-muted">You&apos;re all caught up.</p>
                        </div>
                    </div>
                ) : (
                    filtered.map((n) => <Row key={n.id} notification={n} onRead={markRead} />)
                )}
            </div>
        </div>
    )
}
