import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { Link } from '@inertiajs/react'
import { InviteModal } from './InviteModal'
import { UserPanel } from './UserPanel'
import { CreateChannelModal } from './CreateChannelModal'
import { channelTypeDescriptor, orderedTypesIn } from '@/services/channelTypes'
import { subscribeRoomChannels } from '@/services/echo'
import { useChannels } from '@/stores'
import type { Channel, RecentCustomStatus, Room, User } from '@/types'

interface Props {
    room: Room
    channels: Channel[]
    activeChannelId: string
    currentUser: User
    recentCustomStatuses: RecentCustomStatus[]
    creatableChannelTypes?: string[]
    canManageRoles?: boolean
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
    room, channels, activeChannelId, currentUser, recentCustomStatuses, creatableChannelTypes = [], canManageRoles,
}: Props) {
    const [inviting, setInviting] = useState(false)
    const [creatingChannel, setCreatingChannel] = useState(false)

    const list = useChannels((s) => s.channels[room.id] ?? channels)
    const { setChannels, addChannel } = useChannels()

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
                <div className="flex items-center gap-3 flex-shrink-0">
                    {canManageRoles && (
                        <Link
                            href={`/rooms/${room.id}/roles`}
                            title="Manage roles"
                            className="text-text-muted hover:text-text-primary transition-colors duration-100"
                        >
                            🛡
                        </Link>
                    )}
                    {creatableChannelTypes.length > 0 && (
                        <button
                            onClick={() => setCreatingChannel(true)}
                            title="Add channel"
                            className="text-text-muted hover:text-text-primary transition-colors duration-100 text-lg leading-none"
                        >
                            +
                        </button>
                    )}
                    <button
                        onClick={() => setInviting(true)}
                        title="Invite people"
                        className="text-text-muted hover:text-text-primary transition-colors duration-100"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path d="M11 4a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM3 15.5c0-2.5 2.5-4 5-4s5 1.5 5 4v.5H3v-.5ZM15.5 7v2h2v1.5h-2v2H14v-2h-2V9h2V7h1.5Z" />
                        </svg>
                    </button>
                </div>
            </div>

            {inviting && <InviteModal room={room} onClose={() => setInviting(false)} />}
            {creatingChannel && (
                <CreateChannelModal
                    room={room}
                    creatableTypes={creatableChannelTypes}
                    onClose={() => setCreatingChannel(false)}
                    onCreated={(channel) => addChannel(room.id, channel)}
                />
            )}

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

                            {group.map((c) => (
                                SidebarItem ? (
                                    <SidebarItem key={c.id} channel={c} active={c.id === activeChannelId} currentUser={currentUser} />
                                ) : (
                                    <DefaultChannelRow key={c.id} channel={c} active={c.id === activeChannelId} />
                                )
                            ))}
                        </div>
                    )
                })}
            </nav>

            <UserPanel user={currentUser} recentCustomStatuses={recentCustomStatuses} />
        </div>
    )
}
