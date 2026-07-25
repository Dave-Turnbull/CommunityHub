import { Avatar } from '@/components/ui/Avatar'
import { usePresence } from '@/stores'
import type { RoomMember } from '@/types'

export function MemberList({ members }: { members: RoomMember[] }) {
    const statuses = usePresence((s) => s.statuses)

    const isOnline = (m: RoomMember) =>
        (statuses[m.user_id]?.status ?? m.user?.status) !== 'offline'

    const online  = members.filter(isOnline)
    const offline = members.filter((m) => !isOnline(m))

    const group = (list: RoomMember[], label: string, dim = false) => {
        if (!list.length) return null

        return (
            <div className="mb-4">
                <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                    {label} — {list.length}
                </p>

                {list.map((m) => {
                    if (!m.user) return null

                    const status = statuses[m.user_id]?.status ?? m.user.status
                    const customStatus = statuses[m.user_id]?.customStatus ?? m.user.custom_status
                    const label = status === 'custom' ? customStatus : null

                    return (
                        <div
                            key={m.id}
                            className={`flex items-center gap-2 px-3 py-1.5 mx-1 rounded
                                        hover:bg-surface-raised cursor-pointer ${dim ? 'opacity-40' : ''}`}
                        >
                            <Avatar user={m.user} size="sm" showStatus />
                            <div className="min-w-0">
                                <p className="text-sm text-text-secondary truncate leading-tight">
                                    {m.nickname ?? m.user.display_name}
                                </p>
                                {label && (
                                    <p className="text-[11px] text-text-muted truncate leading-tight">
                                        {label}
                                    </p>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
        )
    }

    return (
        <aside className="w-sidebar-members bg-surface-panel flex-shrink-0 overflow-y-auto py-4">
            {group(online, 'Online')}
            {group(offline, 'Offline', true)}
        </aside>
    )
}
