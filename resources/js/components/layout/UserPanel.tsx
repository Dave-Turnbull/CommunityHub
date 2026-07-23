import { Avatar } from '@/components/ui/Avatar'
import { UserStatusPopover } from './UserStatusPopover'
import { usePresence } from '@/stores'
import type { RecentCustomStatus, User } from '@/types'

export function UserPanel({ user, recentCustomStatuses }: { user: User; recentCustomStatuses: RecentCustomStatus[] }) {
    const status = usePresence((s) => s.statuses[user.id]?.status) ?? user.status
    const customStatus = usePresence((s) => s.statuses[user.id]?.customStatus) ?? user.custom_status
    const label = status === 'custom' ? customStatus : null

    return (
        <UserStatusPopover
            user={user}
            recentCustomStatuses={recentCustomStatuses}
            trigger={
                <button className="w-full flex items-center gap-2 px-2 py-2 bg-surface-800 flex-shrink-0 text-left">
                    <Avatar user={user} size="sm" showStatus />

                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate leading-tight">
                            {user.display_name}
                        </p>
                        <p className="text-[11px] text-text-muted truncate leading-tight">
                            {label ?? `@${user.username}`}
                        </p>
                    </div>
                </button>
            }
        />
    )
}
