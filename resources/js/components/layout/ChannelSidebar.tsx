import { useState } from 'react'
import { clsx } from 'clsx'
import { Link } from '@inertiajs/react'
import { InviteModal } from './InviteModal'
import { UserPanel } from './UserPanel'
import { CreateChannelModal } from './CreateChannelModal'
import { channelTypeDescriptor, orderedTypesIn } from '@/services/channelTypes'
import type { Channel, Room, User } from '@/types'

interface Props {
    room: Room
    channels: Channel[]
    activeChannelId: string
    currentUser: User
    canManageChannels?: boolean
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
                    ? 'bg-surface-400 text-text-primary'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-500',
            )}
        >
            <span className="text-text-muted">{descriptor.icon}</span>
            <span className="truncate">{channel.name}</span>
        </Link>
    )
}

export function ChannelSidebar({
    room, channels, activeChannelId, currentUser, canManageChannels, canManageRoles,
}: Props) {
    const [inviting, setInviting] = useState(false)
    const [creatingChannel, setCreatingChannel] = useState(false)
    const [localChannels, setLocalChannels] = useState<Channel[] | null>(null)

    const list = localChannels ?? channels

    return (
        <div className="w-sidebar-channel bg-surface-700 flex flex-col flex-shrink-0">
            <div className="h-12 px-4 flex items-center justify-between gap-2 border-b border-surface-800 flex-shrink-0">
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
                    {canManageChannels && (
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
                    onClose={() => setCreatingChannel(false)}
                    onCreated={(channel) => setLocalChannels([...list, channel])}
                />
            )}

            <nav className="flex-1 min-h-0 overflow-y-auto p-2">
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
                                    <SidebarItem key={c.id} channel={c} active={c.id === activeChannelId} />
                                ) : (
                                    <DefaultChannelRow key={c.id} channel={c} active={c.id === activeChannelId} />
                                )
                            ))}
                        </div>
                    )
                })}
            </nav>

            <UserPanel user={currentUser} />
        </div>
    )
}
