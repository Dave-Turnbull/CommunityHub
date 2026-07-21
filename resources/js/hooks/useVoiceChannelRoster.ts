import { useEffect } from 'react'
import { rosterKey, subscribeVoiceRoster } from '@/services/voicePresence'
import { useVoiceRoster } from '@/stores'
import type { VoiceParticipant } from '@/types'

/**
 * Read-only "who's in this call right now" — subscribes to the shared
 * presence roster without joining the call (no mic, no WebRTC). Used by
 * ChannelSidebar to show participants for a voice channel the viewer hasn't
 * joined, the same way Discord's channel list does.
 */
export function useVoiceChannelRoster(scopeType: 'channel' | 'conversation', scopeId: string): VoiceParticipant[] {
    const key = rosterKey(scopeType, scopeId)
    const roster = useVoiceRoster((s) => s.rosters[key])

    useEffect(() => {
        const { leave } = subscribeVoiceRoster(scopeType, scopeId)
        return leave
    }, [scopeType, scopeId])

    return roster ?? []
}
