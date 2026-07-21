import { useCallback, useEffect, useRef } from 'react'
import { fetchVoiceDevicePreference } from '@/services/api'
import { getClientId } from '@/services/clientId'
import { rosterKey, subscribeVoiceRoster } from '@/services/voicePresence'
import { joinVoice, leaveVoice, setMuted } from '@/services/webrtc'
import { useVoice, useVoiceRoster } from '@/stores'
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
    const selfMuted = useVoice((s) => s.selfMuted)
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
                { inputDeviceId: devicePreference.input_device_id, connectionMode }
            )
        } finally {
            joining.current = false
        }
    }, [scopeType, scopeId, currentUser.id, currentUser.display_name, currentUser.avatar_url, connectionMode])

    const leave = useCallback(() => leaveVoice(), [])

    const toggleMute = useCallback(() => {
        setMuted(!useVoice.getState().selfMuted)
    }, [])

    // Leave the call if this page unmounts while still connected to it — e.g.
    // navigating away from the channel/conversation mid-call.
    useEffect(() => {
        return () => {
            if (useVoice.getState().scopeId === scopeId) {
                leaveVoice()
            }
        }
    }, [scopeId])

    return {
        participants: (roster ?? []).filter((p) => p.userId !== userId),
        selfMuted,
        connectionState,
        isActive: activeScopeId === scopeId,
        join,
        leave,
        toggleMute,
    }
}
