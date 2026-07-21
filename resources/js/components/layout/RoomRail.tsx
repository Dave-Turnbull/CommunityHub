import { clsx } from 'clsx'
import { Link, usePage } from '@inertiajs/react'
import { Tooltip } from '@/components/ui/Tooltip'
import { useNotifications } from '@/hooks/useNotifications'
import type { Room } from '@/types'

interface Props {
    rooms: Room[]
    currentUserId: string
    activeRoomId?: string
}

export function RoomRail({ rooms, currentUserId, activeRoomId }: Props) {
    const { url } = usePage()
    const onHome = url === '/' || url.startsWith('/conversations')
    const { unreadCount } = useNotifications(currentUserId)

    return (
        <nav className="h-room-rail w-full bg-surface-800 flex items-center gap-2 px-3
                        overflow-x-auto flex-shrink-0">
            <Tooltip content="Messages" side="bottom">
                <Link
                    href="/"
                    className={clsx(
                        'relative w-10 h-10 grid place-items-center text-xl transition-all duration-200 flex-shrink-0',
                        onHome
                            ? 'rounded-2xl bg-brand'
                            : 'rounded-full bg-surface-600 hover:rounded-2xl hover:bg-brand',
                    )}
                >
                    💬
                    {unreadCount > 0 && (
                        <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-danger
                                          text-white text-[10px] font-bold grid place-items-center leading-none">
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                    )}
                </Link>
            </Tooltip>

            <div className="h-8 w-px bg-surface-500 flex-shrink-0" />

            {rooms.map((r) => {
                const active = r.id === activeRoomId

                return (
                    <Tooltip key={r.id} content={r.name} side="bottom">
                        <Link
                            href={`/rooms/${r.id}`}
                            className={clsx(
                                'group relative w-10 h-10 grid place-items-center overflow-hidden flex-shrink-0',
                                'font-bold text-base transition-all duration-200',
                                active
                                    ? 'rounded-2xl bg-brand text-white'
                                    : 'rounded-full bg-surface-600 text-text-primary hover:rounded-2xl hover:bg-brand',
                            )}
                        >
                            {r.icon_url
                                ? <img src={r.icon_url} alt="" className="w-full h-full object-cover" />
                                : r.name[0]?.toUpperCase()}

                            {/* Active indicator underline */}
                            <span className={clsx(
                                'absolute -bottom-1.5 left-1/2 -translate-x-1/2 h-1 rounded-t-full bg-white transition-all duration-200',
                                active ? 'w-6' : 'w-1.5 opacity-0 group-hover:opacity-100',
                            )} />
                        </Link>
                    </Tooltip>
                )
            })}

            <Tooltip content="Add a Room" side="bottom">
                <Link
                    href="/rooms/create"
                    className="w-10 h-10 grid place-items-center rounded-full bg-surface-600 flex-shrink-0
                               text-success text-xl font-light
                               hover:rounded-2xl hover:bg-success hover:text-white transition-all duration-200"
                >
                    +
                </Link>
            </Tooltip>
        </nav>
    )
}
