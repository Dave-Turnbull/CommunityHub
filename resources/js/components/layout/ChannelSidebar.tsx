import { useState } from 'react'
import { clsx } from 'clsx'
import { Link } from '@inertiajs/react'
import { InviteModal } from './InviteModal'
import { UserPanel } from './UserPanel'
import { VoiceChannelSidebarItem } from '@/components/voice/VoiceChannelSidebarItem'
import { CHANNEL_TYPE_ORDER, channelIcon, channelTypeLabel } from '@/types'
import type { Channel, ChannelType, Room, User } from '@/types'

interface Props {
    room: Room
    channels: Channel[]
    activeChannelId: string
    currentUser: User
}

/** Known types first (in their preferred order), then any others present — see channelTypeLabel. */
function orderedTypesIn(channels: Channel[]): ChannelType[] {
    const present = Array.from(new Set(channels.map((c) => c.type)))
    const known = CHANNEL_TYPE_ORDER.filter((t) => present.includes(t))
    const rest = present.filter((t) => !CHANNEL_TYPE_ORDER.includes(t))

    return [...known, ...rest]
}

export function ChannelSidebar({ room, channels, activeChannelId, currentUser }: Props) {
    const [inviting, setInviting] = useState(false)

    return (
        <div className="w-sidebar-channel bg-surface-700 flex flex-col flex-shrink-0">
            <div className="h-12 px-4 flex items-center justify-between border-b border-surface-800 flex-shrink-0">
                <span className="font-semibold text-text-primary truncate">{room.name}</span>
                <button
                    onClick={() => setInviting(true)}
                    title="Invite people"
                    className="text-text-muted hover:text-text-primary transition-colors duration-100 flex-shrink-0"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path d="M11 4a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM3 15.5c0-2.5 2.5-4 5-4s5 1.5 5 4v.5H3v-.5ZM15.5 7v2h2v1.5h-2v2H14v-2h-2V9h2V7h1.5Z" />
                    </svg>
                </button>
            </div>

            {inviting && <InviteModal room={room} onClose={() => setInviting(false)} />}

            <nav className="flex-1 min-h-0 overflow-y-auto p-2">
                {orderedTypesIn(channels).map((type) => {
                    const group = channels.filter((c) => c.type === type)

                    return (
                        <div key={type} className="mb-4">
                            <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                                {channelTypeLabel(type)}
                            </p>

                            {group.map((c) => (
                                c.type === 'voice' ? (
                                    <VoiceChannelSidebarItem key={c.id} channel={c} active={c.id === activeChannelId} />
                                ) : (
                                    <Link
                                        key={c.id}
                                        href={`/channels/${c.id}`}
                                        className={clsx(
                                            'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors duration-100',
                                            c.id === activeChannelId
                                                ? 'bg-surface-400 text-text-primary'
                                                : 'text-text-secondary hover:text-text-primary hover:bg-surface-500',
                                        )}
                                    >
                                        <span className="text-text-muted">{channelIcon(c.type)}</span>
                                        <span className="truncate">{c.name}</span>
                                    </Link>
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
