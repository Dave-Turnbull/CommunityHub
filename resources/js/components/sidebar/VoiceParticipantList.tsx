import { clsx } from 'clsx'
import { Avatar } from '@/components/ui/Avatar'
import type { VoiceParticipant } from '@/types'

interface Props {
    participants: (VoiceParticipant & { speaking?: boolean })[]
}

/**
 * A sidebar molecule: who's currently in a voice call, muted or not. Only
 * VoiceChannelSidebarItem uses this today, but it takes a plain participant
 * list rather than reaching into voice state itself so it isn't tied to
 * voice specifically — same shape any future roster-style sidebar row
 * (e.g. a music player's listeners) could reuse. A row's optional `speaking`
 * flag only draws the ring; the caller decides what "speaking" means.
 */
export function VoiceParticipantList({ participants }: Props) {
    if (participants.length === 0) return null

    return (
        <div className="pl-7 pr-2 py-0.5 space-y-1">
            {participants.map((p) => (
                <div key={p.userId} className="flex items-center gap-1.5 min-w-0">
                    <Avatar
                        user={{ id: p.userId, display_name: p.displayName, avatar_url: p.avatarUrl, username: p.userId, status: 'online' }}
                        size="xs"
                        className={clsx('rounded-full', p.speaking && 'ring-2 ring-success')}
                    />
                    <span className="truncate text-xs text-text-muted">{p.displayName}</span>
                    {p.muted && <span className="flex-shrink-0 text-xxs" aria-label="Muted">🔇</span>}
                </div>
            ))}
        </div>
    )
}
