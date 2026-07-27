import { useEffect } from 'react'
import { clsx } from 'clsx'
import { Link } from '@inertiajs/react'
import { UserPanel } from './UserPanel'
import { channelTypeDescriptor, orderedTypesIn } from '@/services/channelTypes'
import { subscribeRoomChannels } from '@/services/echo'
import { useChannels } from '@/stores'
import type { Channel, MainView, RecentCustomStatus, Room, User } from '@/types'

interface Props {
    room: Room
    channels: Channel[]
    activeChannelId: string
    activeView: MainView
    currentUser: User
    recentCustomStatuses: RecentCustomStatus[]
    creatableChannelTypes?: string[]
    canManageRoles?: boolean
    onSelectRoles: () => void
    onSelectCreateChannel: () => void
    onSelectInvite: () => void
}

function DefaultChannelRow({ channel, active }: { channel: Channel; active: boolean }) {
    const descriptor = channelTypeDescriptor(channel.type)

    return (
        <Link
            href={`/channels/${channel.id}`}
            className={clsx(
                'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors duration-100',
                active
                    ? 'bg-sixth text-text-primary'
                    : 'text-text-secondary hover:text-text-primary hover:bg-fifth',
            )}
        >
            <span className="text-text-muted">{descriptor.icon}</span>
            <span className="truncate">{channel.name}</span>
        </Link>
    )
}

export function ChannelSidebar({
    room, channels, activeChannelId, activeView, currentUser, recentCustomStatuses,
    creatableChannelTypes = [], canManageRoles, onSelectRoles, onSelectCreateChannel, onSelectInvite,
}: Props) {
    const list = useChannels((s) => s.channels[room.id] ?? channels)
    const { setChannels } = useChannels()

    // Re-seed from the page's fresh `channels` prop on every navigation to
    // this room, then let subscribeRoomChannels() keep it live from there.
    useEffect(() => {
        setChannels(room.id, channels)
    }, [room.id])

    useEffect(() => subscribeRoomChannels(room.id), [room.id])

    return (
        <div className="w-sidebar-channel bg-second border-r-panel border-panel-border flex flex-col flex-shrink-0">
            <div className="h-12 px-4 flex items-center justify-between gap-2 border-b border-third flex-shrink-0">
                <span className="font-semibold text-text-primary truncate">{room.name}</span>
                <div className="flex items-center gap-1 flex-shrink-0">
                    {canManageRoles && (
                        <button
                            onClick={onSelectRoles}
                            title="Manage roles"
                            className={clsx(
                                'p-1 rounded transition-colors duration-100',
                                activeView.type === 'roles'
                                    ? 'bg-sixth text-text-primary'
                                    : 'text-text-muted hover:text-text-primary',
                            )}
                        >
                            🛡
                        </button>
                    )}
                    {creatableChannelTypes.length > 0 && (
                        <button
                            onClick={onSelectCreateChannel}
                            title="Add channel"
                            className={clsx(
                                'p-1 rounded text-lg leading-none transition-colors duration-100',
                                activeView.type === 'create-channel'
                                    ? 'bg-sixth text-text-primary'
                                    : 'text-text-muted hover:text-text-primary',
                            )}
                        >
                            +
                        </button>
                    )}
                    <button
                        onClick={onSelectInvite}
                        title="Invite people"
                        className={clsx(
                            'p-1 rounded transition-colors duration-100',
                            activeView.type === 'invite'
                                ? 'bg-sixth text-text-primary'
                                : 'text-text-muted hover:text-text-primary',
                        )}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path d="M11 4a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM3 15.5c0-2.5 2.5-4 5-4s5 1.5 5 4v.5H3v-.5ZM15.5 7v2h2v1.5h-2v2H14v-2h-2V9h2V7h1.5Z" />
                        </svg>
                    </button>
                </div>
            </div>

            <nav className="flex-1 min-h-0 overflow-y-auto p-2 select-none">
                {orderedTypesIn(list.map((c) => c.type)).map((type) => {
                    const group = list.filter((c) => c.type === type)
                    const descriptor = channelTypeDescriptor(type)
                    const SidebarItem = descriptor.SidebarItem

                    return (
                        <div key={type} className="mb-4">
                            <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                                {descriptor.label}
                            </p>

                            {group.map((c) => {
                                const active = activeView.type === 'channel' && c.id === activeChannelId
                                return SidebarItem ? (
                                    <SidebarItem key={c.id} channel={c} active={active} currentUser={currentUser} />
                                ) : (
                                    <DefaultChannelRow key={c.id} channel={c} active={active} />
                                )
                            })}
                        </div>
                    )
                })}
            </nav>

            <UserPanel user={currentUser} recentCustomStatuses={recentCustomStatuses} />
        </div>
    )
}
