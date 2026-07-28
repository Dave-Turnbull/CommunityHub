import { useEffect, useState } from 'react'
import { Toggle } from '@/components/ui/Toggle'
import { fetchNotificationPreferences, updateNotificationPreference } from '@/services/api'
import { NOTIFICATION_CATEGORY_LABELS, NOTIFICATION_IN_APP_LOCKED } from '@/types'
import type { NotificationCategory, NotificationPreference } from '@/types'

const DESCRIPTIONS: Record<NotificationCategory, string> = {
    room_invite: 'Someone invites you to a room.',
    room_message: 'A new message is posted in a room you belong to.',
    direct_message: 'Someone sends you a direct message. Always on — this is your inbox.',
    comment_reply: 'Someone replies to your message or comment.',
}

const CATEGORY_ORDER: NotificationCategory[] = ['room_invite', 'room_message', 'direct_message', 'comment_reply']

export function NotificationPreferences() {
    const [preferences, setPreferences] = useState<NotificationPreference[]>([])
    const [loaded, setLoaded] = useState(false)

    useEffect(() => {
        fetchNotificationPreferences().then((data) => {
            setPreferences(data)
            setLoaded(true)
        })
    }, [])

    const preferenceFor = (category: NotificationCategory): NotificationPreference =>
        preferences.find((p) => p.category === category) ?? { category, email: false, in_app: false }

    const toggle = (category: NotificationCategory, field: 'email' | 'in_app', value: boolean) => {
        if (field === 'in_app' && !value && NOTIFICATION_IN_APP_LOCKED.includes(category)) return

        const next = { ...preferenceFor(category), [field]: value }

        setPreferences((prev) => {
            const others = prev.filter((p) => p.category !== category)
            return [...others, next]
        })
        updateNotificationPreference(next)
    }

    if (!loaded) {
        return <p className="text-sm text-text-muted">Loading…</p>
    }

    return (
        <div className="bg-second rounded-lg divide-y divide-fifth">
            <div className="grid grid-cols-[1fr,auto,auto] gap-4 px-6 py-3 text-xxs font-semibold uppercase tracking-wide text-text-muted">
                <span>Category</span>
                <span className="w-12 text-center">Email</span>
                <span className="w-12 text-center">In-app</span>
            </div>

            {CATEGORY_ORDER.map((category) => {
                const pref = preferenceFor(category)
                const label = NOTIFICATION_CATEGORY_LABELS[category]
                const inAppLocked = NOTIFICATION_IN_APP_LOCKED.includes(category)

                return (
                    <div key={category} className="grid grid-cols-[1fr,auto,auto] gap-4 items-center px-6 py-4">
                        <div>
                            <p className="text-sm font-medium text-text-primary">{label}</p>
                            <p className="text-xs text-text-muted mt-0.5">{DESCRIPTIONS[category]}</p>
                        </div>

                        <div className="w-12 flex justify-center">
                            <Toggle
                                checked={pref.email}
                                onChange={(checked) => toggle(category, 'email', checked)}
                                label={`Email notifications for ${label}`}
                            />
                        </div>

                        <div className="w-12 flex justify-center">
                            <Toggle
                                checked={pref.in_app}
                                onChange={(checked) => toggle(category, 'in_app', checked)}
                                label={`In-app notifications for ${label}`}
                                disabled={inAppLocked}
                            />
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
