import { useEffect, useRef } from 'react'
import { getRemoteStream } from '@/services/webrtc'
import { useRemoteStreamVersion, useVoice } from '@/stores'

interface Props {
    userId: string
    volume: number
}

/**
 * The actual playback element for one remote participant's audio — without
 * this, a peer connection's incoming track is decoded but never routed
 * anywhere audible. Hidden (no visible controls); volume is driven by the
 * caller (see ParticipantVolumeControl) but always overridden to 0 while
 * deafened, without touching the underlying per-participant volume itself —
 * un-deafening restores exactly what each participant was set to before.
 */
export function RemoteParticipantAudio({ userId, volume }: Props) {
    const audioRef = useRef<HTMLAudioElement>(null)
    const streamVersion = useRemoteStreamVersion((s) => s.version)
    const deafened = useVoice((s) => s.deafened)

    useEffect(() => {
        if (audioRef.current) audioRef.current.srcObject = getRemoteStream(userId) ?? null
        // streamVersion ticks whenever services/webrtc.ts's remoteStreams Map
        // changes for any peer — cheap to re-read on every tick since this is
        // just a Map lookup, and the only way to learn "your stream is ready
        // now" without putting MediaStream objects in a store.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId, streamVersion])

    useEffect(() => {
        if (audioRef.current) audioRef.current.volume = deafened ? 0 : volume
    }, [volume, deafened])

    return <audio ref={audioRef} autoPlay className="hidden" />
}
