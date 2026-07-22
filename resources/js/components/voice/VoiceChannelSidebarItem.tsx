import { Link } from '@inertiajs/react'
import { clsx } from 'clsx'
import { Avatar } from '@/components/ui/Avatar'
import { useVoiceChannelRoster } from '@/hooks/useVoiceChannelRoster'
import type { Channel } from '@/types'

interface Props {
    channel: Channel
    active: boolean
}

/** A voice channel's sidebar row, plus a live list of who's currently in its call — see useVoiceChannelRoster. */
export function VoiceChannelSidebarItem({ channel, active }: Props) {
    const participants = useVoiceChannelRoster('channel', channel.id)

    return (
        <div>
            <Link
                href={`/channels/${channel.id}`}
                className={clsx(
                    'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors duration-100',
                    active
                        ? 'bg-surface-400 text-text-primary'
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface-500',
                )}
            >
                <span className="text-text-muted">🔊</span>
                <span className="truncate">{channel.name}</span>
            </Link>

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
