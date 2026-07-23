import { Link } from '@inertiajs/react'
import { clsx } from 'clsx'
import { VoiceParticipantList } from '@/components/sidebar/VoiceParticipantList'
import { useVoiceChannel } from '@/hooks/useVoiceChannel'
import type { Channel, User } from '@/types'

interface Props {
    channel: Channel
    active: boolean
    currentUser: User
}

/**
 * A voice channel's sidebar row, plus a live participant list — see
 * useVoiceChannel. Two ways to join: a hover icon button (single click,
 * toggles join/leave), or double-clicking the channel name itself (join
 * only — see the onDoubleClick handler below for why it never leaves).
 */
export function VoiceChannelSidebarItem({ channel, active, currentUser }: Props) {
    const { participants, selfMuted, isActive, connectionState, join, leave } = useVoiceChannel(
        'channel', channel.id, currentUser, channel.voice_mode
    )

    // useVoiceChannel's `participants` deliberately excludes the current user (so
    // VoiceChannelPanel/VoiceBar can render "you" separately from the roster) — the
    // sidebar wants one flat list including self, so add it back in when connected.
    const listedParticipants = isActive
        ? [
            {
                userId: currentUser.id,
                displayName: `${currentUser.display_name} (you)`,
                avatarUrl: currentUser.avatar_url,
                muted: selfMuted,
            },
            ...participants,
        ]
        : participants

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
                <Link
                    href={`/channels/${channel.id}`}
                    onDoubleClick={(e) => {
                        e.preventDefault()
                        // Join only, never leave — a double-click is two clicks then a
                        // dblclick, and each of those clicks already navigates via the
                        // Link's normal href. Toggling on dblclick too would mean a
                        // double-click while already connected immediately leaves the
                        // call the moment you land back on its own page, which reads as
                        // the sidebar randomly kicking you out. Leaving still has its own
                        // explicit affordance — the hover button below.
                        if (!isActive) void join()
                    }}
                    title={isActive ? undefined : 'Double-click to join voice'}
                    className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
                >
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

            <VoiceParticipantList participants={listedParticipants} />
        </div>
    )
}
