import { RemoteParticipantAudio } from '@/components/voice/RemoteParticipantAudio'
import { rosterKey } from '@/services/voicePresence'
import { useVoice, useVoiceRoster, useVoiceVolume } from '@/stores'

/**
 * Plays every remote participant of the active call, mounted once at app level
 * (app.tsx) so playback survives Inertia navigation and does not depend on any
 * page rendering the call's UI. Renders nothing while not in a call.
 */
export function VoiceAudioHost() {
    const scopeType = useVoice((s) => s.scopeType)
    const scopeId = useVoice((s) => s.scopeId)
    const selfUserId = useVoice((s) => s.selfParticipant?.userId)
    const roster = useVoiceRoster((s) =>
        scopeType && scopeId ? s.rosters[rosterKey(scopeType, scopeId)] : undefined
    )
    const volumes = useVoiceVolume((s) => s.volumes)

    if (!roster || !selfUserId) return null

    return (
        <>
            {roster
                .filter((participant) => participant.userId !== selfUserId)
                .map((participant) => (
                    <RemoteParticipantAudio
                        key={participant.userId}
                        userId={participant.userId}
                        volume={volumes[participant.userId] ?? 1}
                    />
                ))}
        </>
    )
}
