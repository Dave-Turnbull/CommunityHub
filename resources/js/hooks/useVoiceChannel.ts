import { useCallback, useEffect, useRef } from 'react'
import { fetchVoiceDevicePreference } from '@/services/api'
import { getClientId } from '@/services/clientId'
import { rosterKey, subscribeVoiceRoster } from '@/services/voicePresence'
import { joinVoice, leaveVoice, setMuted } from '@/services/webrtc'
import { useVoice, useVoiceRoster, useSpeaking, useConnectionQuality } from '@/stores'
import type { User, VoiceConnectionMode } from '@/types'

export function useVoiceChannel(
    scopeType: 'channel' | 'conversation',
    scopeId: string,
    currentUser: User,
    connectionMode: VoiceConnectionMode
) {
    const userId = currentUser.id
    const key = rosterKey(scopeType, scopeId)
    const roster = useVoiceRoster((s) => s.rosters[key])
    const speaking = useSpeaking((s) => s.speaking)
    const quality = useConnectionQuality((s) => s.quality)
    const selfMuted = useVoice((s) => s.selfMuted)
    const deafened = useVoice((s) => s.deafened)
    const connectionState = useVoice((s) => s.connectionState)
    const activeScopeId = useVoice((s) => s.scopeId)
    const joining = useRef(false)

    // Observe the roster whether or not this user has joined the call — the
    // panel shows who's already in it before you click Join, same as
    // ChannelSidebar's read-only view (services/voicePresence.ts ref-counts
    // this against any other consumer of the same scope, including an active
    // join of this same call).
    useEffect(() => {
        const { leave } = subscribeVoiceRoster(scopeType, scopeId)
        return leave
    }, [scopeType, scopeId])

    const join = useCallback(async () => {
        if (joining.current) return
        joining.current = true

        try {
            const devicePreference = await fetchVoiceDevicePreference(getClientId())
            await joinVoice(
                scopeType,
                scopeId,
                { id: currentUser.id, displayName: currentUser.display_name, avatarUrl: currentUser.avatar_url },
                {
                    inputDeviceId: devicePreference.input_device_id,
                    connectionMode,
                    sendThreshold: devicePreference.send_threshold,
                }
            )
        } finally {
            joining.current = false
        }
    }, [scopeType, scopeId, currentUser.id, currentUser.display_name, currentUser.avatar_url, connectionMode])

    const leave = useCallback(() => leaveVoice(), [])

    const toggleMute = useCallback(() => {
        setMuted(!useVoice.getState().selfMuted)
    }, [])

    // Deafen is pure local playback state — it never touches the mic/track,
    // so unlike toggleMute it doesn't go through services/webrtc.ts at all.
    const toggleDeafen = useCallback(() => {
        useVoice.getState().setDeafened(!useVoice.getState().deafened)
    }, [])

    return {
        participants: (roster ?? [])
            .filter((p) => p.userId !== userId)
            .map((p) => ({ ...p, speaking: speaking[p.userId] ?? false, quality: quality[p.userId] ?? 'unknown' })),
        selfMuted,
        deafened,
        connectionState,
        isActive: activeScopeId === scopeId,
        join,
        leave,
        toggleMute,
        toggleDeafen,
    }
}
