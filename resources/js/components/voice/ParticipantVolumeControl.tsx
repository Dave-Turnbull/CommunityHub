import { clsx } from 'clsx'
import { Avatar } from '@/components/ui/Avatar'
import { Popover } from '@/components/ui/Popover'
import { RemoteParticipantAudio } from '@/components/voice/RemoteParticipantAudio'
import { useVoiceVolume } from '@/stores'
import type { ConnectionQuality } from '@/services/connectionQuality'
import type { VoiceParticipant } from '@/types'

interface Props {
    participant: VoiceParticipant & { speaking?: boolean; quality?: ConnectionQuality }
    size: 'sm' | 'lg'
}

const QUALITY_DOT_COLOR: Record<ConnectionQuality, string> = {
    good: 'bg-success',
    fair: 'bg-status-idle',
    poor: 'bg-danger',
    unknown: 'bg-status-offline',
}

const QUALITY_LABEL: Record<ConnectionQuality, string> = {
    good: 'Good connection',
    fair: 'Fair connection',
    poor: 'Poor connection',
    unknown: 'Connection quality unknown',
}

/**
 * A remote participant's avatar, doubling as the trigger for their local
 * playback volume popover — click it to reveal a slider for "how loud does
 * this person sound to me." Also owns their actual audio playback element
 * (RemoteParticipantAudio); without it nothing plays regardless of volume.
 */
export function ParticipantVolumeControl({ participant, size }: Props) {
    const volume = useVoiceVolume((s) => s.volumes[participant.userId] ?? 1)
    const setVolume = useVoiceVolume((s) => s.setVolume)
    const quality = participant.quality ?? 'unknown'

    return (
        <>
            <Popover
                trigger={
                    <button
                        type="button"
                        aria-label={`Volume for ${participant.displayName}`}
                        className="relative block rounded-full bg-transparent border-0 p-0 cursor-pointer"
                    >
                        <Avatar
                            user={{
                                id: participant.userId,
                                display_name: participant.displayName,
                                avatar_url: participant.avatarUrl,
                                username: participant.userId,
                                status: 'online',
                            }}
                            size={size}
                            className={clsx('rounded-full', participant.speaking && 'ring-2 ring-success')}
                        />
                        <span
                            title={QUALITY_LABEL[quality]}
                            className={clsx(
                                'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-surface-700',
                                QUALITY_DOT_COLOR[quality]
                            )}
                        />
                    </button>
                }
                className="bg-surface-600 border border-surface-400 rounded-lg p-3 w-40 shadow-lg"
            >
                <label
                    htmlFor={`volume-${participant.userId}`}
                    className="block text-xs font-medium text-text-primary mb-2 truncate"
                >
                    {participant.displayName}&apos;s volume
                </label>
                <input
                    id={`volume-${participant.userId}`}
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(volume * 100)}
                    onChange={(e) => setVolume(participant.userId, Number(e.target.value) / 100)}
                    className="w-full accent-brand"
                />
            </Popover>

            {/* Deliberately outside the Popover — Radix unmounts closed
                popover content, which would silently stop this person's
                audio the moment you closed the volume slider. */}
            <RemoteParticipantAudio userId={participant.userId} volume={volume} />
        </>
    )
}
