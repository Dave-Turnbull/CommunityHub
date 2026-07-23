import { Link } from '@inertiajs/react'
import { clsx } from 'clsx'
import { Avatar } from '@/components/ui/Avatar'
import { useVoiceChannel } from '@/hooks/useVoiceChannel'
import type { Channel, User } from '@/types'

interface Props {
    channel: Channel
    active: boolean
    currentUser: User
}

/** A voice channel's sidebar row, plus a live list of who's currently in its call, and a hover join/leave button — see useVoiceChannel. */
export function VoiceChannelSidebarItem({ channel, active, currentUser }: Props) {
    const { participants, isActive, connectionState, join, leave } = useVoiceChannel(
        'channel', channel.id, currentUser, channel.voice_mode
    )

    return (
        <div className="group">
            <div
                className={clsx(
                    'flex items-center gap-2 px-2 py-1.5 rounded transition-colors duration-100',
                    active
                        ? 'bg-surface-400 text-text-primary'
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface-500',
                )}
            >
                <Link href={`/channels/${channel.id}`} className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                    <span className="text-text-muted">🔊</span>
                    <span className="truncate">{channel.name}</span>
                </Link>

                <button
                    onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        if (isActive) {
                            leave()
                        } else {
                            void join()
                        }
                    }}
                    title={isActive ? 'Leave voice' : 'Join voice'}
                    className={clsx(
                        'flex-shrink-0 leading-none transition-opacity duration-100',
                        isActive ? 'opacity-100 text-danger' : 'opacity-0 group-hover:opacity-100 text-text-muted hover:text-text-primary',
                    )}
                >
                    {isActive ? '📵' : connectionState === 'connecting' ? '…' : '🎙️'}
                </button>
            </div>

            {participants.length > 0 && (
                <div className="pl-7 pr-2 py-0.5 space-y-1">
                    {participants.map((p) => (
                        <div key={p.userId} className="flex items-center gap-1.5 min-w-0">
                            <Avatar
                                user={{ id: p.userId, display_name: p.displayName, avatar_url: p.avatarUrl, username: p.userId, status: 'online' }}
                                size="xs"
                            />
                            <span className="truncate text-xs text-text-muted">{p.displayName}</span>
                            {p.muted && <span className="flex-shrink-0 text-xxs" aria-label="Muted">🔇</span>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
