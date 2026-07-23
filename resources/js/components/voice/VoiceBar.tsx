import { Avatar } from '@/components/ui/Avatar'
import { ParticipantVolumeControl } from '@/components/voice/ParticipantVolumeControl'
import { useVoiceChannel } from '@/hooks/useVoiceChannel'
import type { Conversation, User } from '@/types'

interface Props {
    conversation: Conversation
    currentUser: User
}

/**
 * A persistent bar above the message thread — every dm/group Conversation
 * always has voice available (not an optional add-on), so this always
 * renders, layered above MessageList/MessageInput without touching either.
 */
export function VoiceBar({ conversation, currentUser }: Props) {
    const { participants, selfMuted, deafened, connectionState, isActive, join, leave, toggleMute, toggleDeafen } =
        useVoiceChannel('conversation', conversation.id, currentUser, conversation.voice_mode)

    return (
        <div className="flex items-center gap-3 px-4 py-2 border-b border-surface-800 bg-surface-700 flex-shrink-0">
            {isActive ? (
                <>
                    <div className="flex -space-x-2">
                        <Avatar user={currentUser} size="sm" />
                        {participants.map((p) => (
                            <ParticipantVolumeControl key={p.userId} participant={p} size="sm" />
                        ))}
                    </div>

                    <span className="text-xs text-text-muted">
                        {connectionState === 'connecting' ? 'Connecting…' : `${participants.length + 1} in call`}
                    </span>

                    <button
                        onClick={toggleMute}
                        className="ml-auto rounded bg-surface-500 hover:bg-surface-400 px-3 py-1 text-xs font-medium text-text-primary transition-colors duration-100"
                    >
                        {selfMuted ? 'Unmute' : 'Mute'}
                    </button>
                    <button
                        onClick={toggleDeafen}
                        className="rounded bg-surface-500 hover:bg-surface-400 px-3 py-1 text-xs font-medium text-text-primary transition-colors duration-100"
                    >
                        {deafened ? 'Undeafen' : 'Deafen'}
                    </button>
                    <button
                        onClick={leave}
                        className="rounded bg-danger hover:opacity-90 px-3 py-1 text-xs font-medium text-white transition-opacity duration-100"
                    >
                        Leave
                    </button>
                </>
            ) : (
                <button
                    onClick={join}
                    className="rounded bg-brand hover:bg-brand-hover px-3 py-1 text-xs font-medium text-white transition-colors duration-100"
                >
                    🎙️ Join Voice
                </button>
            )}
        </div>
    )
}
