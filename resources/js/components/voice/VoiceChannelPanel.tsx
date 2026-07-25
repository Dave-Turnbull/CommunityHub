import { Avatar } from '@/components/ui/Avatar'
import { ParticipantVolumeControl } from '@/components/voice/ParticipantVolumeControl'
import { useVoiceChannel } from '@/hooks/useVoiceChannel'
import type { Channel, User } from '@/types'

interface Props {
    channel: Channel
    currentUser: User
}

/** A room voice channel's entire main-pane content — no text chat here, see MessageController's guard. */
export function VoiceChannelPanel({ channel, currentUser }: Props) {
    const { participants, selfMuted, deafened, connectionState, isActive, join, leave, toggleMute, toggleDeafen } =
        useVoiceChannel('channel', channel.id, currentUser, channel.voice_mode)

    return (
        <div className="flex-1 flex flex-col items-center justify-center gap-8 p-8">
            <div className="flex flex-wrap justify-center gap-6">
                {isActive && (
                    <div className="flex flex-col items-center gap-2 w-20">
                        <Avatar user={currentUser} size="lg" />
                        <span className="text-sm text-text-secondary truncate max-w-full">
                            {currentUser.display_name} (you){selfMuted ? ' 🔇' : ''}
                        </span>
                    </div>
                )}

                {participants.map((p) => (
                    <div key={p.userId} className="flex flex-col items-center gap-2 w-20">
                        <ParticipantVolumeControl participant={p} size="lg" />
                        <span className="text-sm text-text-secondary truncate max-w-full">
                            {p.displayName}{p.muted ? ' 🔇' : ''}
                        </span>
                    </div>
                ))}
            </div>

            {isActive ? (
                <div className="flex gap-3">
                    <button
                        onClick={toggleMute}
                        className="rounded bg-fifth hover:bg-sixth px-4 py-2 text-sm font-medium text-text-primary transition-colors duration-100"
                    >
                        {selfMuted ? 'Unmute' : 'Mute'}
                    </button>
                    <button
                        onClick={toggleDeafen}
                        className="rounded bg-fifth hover:bg-sixth px-4 py-2 text-sm font-medium text-text-primary transition-colors duration-100"
                    >
                        {deafened ? 'Undeafen' : 'Deafen'}
                    </button>
                    <button
                        onClick={leave}
                        className="rounded bg-danger hover:opacity-90 px-4 py-2 text-sm font-medium text-inverse transition-opacity duration-100"
                    >
                        Leave Voice
                    </button>
                </div>
            ) : (
                <button
                    onClick={join}
                    className="rounded bg-accent-primary hover:bg-accent-secondary px-6 py-2 text-sm font-medium text-inverse transition-colors duration-100"
                >
                    {connectionState === 'connecting' ? 'Joining…' : 'Join Voice'}
                </button>
            )}
        </div>
    )
}
