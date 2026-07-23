import { announceVoiceJoin, subscribeVoiceCallGuard } from '@/services/echo'
import { useVoice } from '@/stores'

/**
 * Enforces "only one active voice call per user, even across rooms/tabs" —
 * entirely client-side, entirely best-effort (whisper has no delivery
 * guarantee, matching this app's existing risk tolerance for voice — see
 * `.leaving()`'s role as a presence safety net in services/voicePresence.ts).
 *
 * The single-tab case is handled separately and deterministically by
 * webrtc.ts's joinVoice() checking its own useVoice state directly — this
 * module only covers the cross-tab case, which needs a signal to reach
 * *other* tabs. Takes `leaveCurrentCall` as a parameter rather than
 * importing webrtc.ts's leaveVoice() directly, to avoid a circular import
 * (webrtc.ts is what calls into this module).
 */
export function announceJoin(userId: string, scopeType: 'channel' | 'conversation', scopeId: string): void {
    announceVoiceJoin(userId, scopeType, scopeId)
}

export function guardAgainstOtherTabsJoining(userId: string, leaveCurrentCall: () => void): () => void {
    return subscribeVoiceCallGuard(userId, (scopeType, scopeId) => {
        const current = useVoice.getState()

        const inADifferentCall =
            current.scopeType !== null &&
            current.scopeId !== null &&
            (current.scopeType !== scopeType || current.scopeId !== scopeId)

        if (inADifferentCall) {
            leaveCurrentCall()
        }
    })
}
