import { joinVoiceChannel } from '@/services/echo'
import { useVoice, useVoiceRoster } from '@/stores'

type ScopeType = 'channel' | 'conversation'
type Member = { id: string; display_name: string; avatar_url: string | null }
type VoiceChannelHandle = ReturnType<typeof joinVoiceChannel>['channel']

interface CallStatePayload {
    userId: string
    displayName?: string
    avatarUrl?: string | null
    inCall: boolean
}

interface Subscription {
    channel: VoiceChannelHandle
    leaveUnderlying: () => void
    refCount: number
}

const subscriptions = new Map<string, Subscription>()

export function rosterKey(scopeType: ScopeType, scopeId: string): string {
    return `${scopeType}.${scopeId}`
}

/**
 * Ref-counted subscription to a voice scope's presence channel — shared
 * across every consumer (ChannelSidebar showing who's in a call without
 * joining it, and services/webrtc.ts actually being in the call) so there is
 * only ever one underlying `.join()` and one set of `.joining()/.leaving()`/
 * whisper handlers per scope per session.
 *
 * Presence-channel *subscription* is deliberately NOT treated as "in the
 * call" — merely observing the roster (e.g. the sidebar) subscribes to the
 * exact same channel without opening a mic, so raw membership would make
 * every idle viewer of the room look like an active call participant. Call
 * membership is tracked explicitly instead: a client that has actually
 * joined the call (services/webrtc.ts) whispers a `call-state` announcement
 * of itself, and — because a `.joining()` event fires for every new
 * subscriber, participant or observer — re-announces itself whenever someone
 * new arrives, so that arrival learns who's already in the call without
 * needing whisper history/replay (whisper events, including this
 * re-announcement, never reach the sender). `useVoiceRoster` is populated
 * exclusively by these `call-state` announcements, never by `.here()`/
 * `.joining()` directly.
 */
export function subscribeVoiceRoster(scopeType: ScopeType, scopeId: string): { channel: VoiceChannelHandle; leave: () => void } {
    const key = rosterKey(scopeType, scopeId)
    let sub = subscriptions.get(key)

    if (!sub) {
        const { channel, leave } = joinVoiceChannel(scopeType, scopeId)

        channel
            // Safety net: a socket that just disconnects (tab closed, network
            // drop) may never get to whisper an explicit "leaving" call-state,
            // but presence still fires member_removed — remove them from the
            // roster regardless of whether they announced it.
            .leaving((member: Member) => useVoiceRoster.getState().removeParticipant(key, member.id))
            .joining((member: Member) => {
                const self = useVoice.getState()
                const amInThisCall =
                    self.scopeType === scopeType && self.scopeId === scopeId && self.selfParticipant !== null

                if (amInThisCall && member.id !== self.selfParticipant!.userId) {
                    channel.whisper('call-state', { ...self.selfParticipant, inCall: true })
                }
            })
            .listenForWhisper('call-state', (payload: CallStatePayload) => {
                if (payload.inCall) {
                    useVoiceRoster.getState().upsertParticipant(key, {
                        userId: payload.userId,
                        displayName: payload.displayName ?? '',
                        avatarUrl: payload.avatarUrl ?? null,
                        muted: false,
                    })
                } else {
                    useVoiceRoster.getState().removeParticipant(key, payload.userId)
                }
            })
            .listenForWhisper('mute-state', (payload: { userId: string; muted: boolean }) =>
                useVoiceRoster.getState().setParticipantMuted(key, payload.userId, payload.muted)
            )

        sub = { channel, leaveUnderlying: leave, refCount: 0 }
        subscriptions.set(key, sub)
    }

    sub.refCount += 1
    const subscription = sub

    let released = false

    return {
        channel: subscription.channel,
        leave: () => {
            if (released) return
            released = true

            subscription.refCount -= 1
            if (subscription.refCount <= 0) {
                subscription.leaveUnderlying()
                subscriptions.delete(key)
                useVoiceRoster.getState().clearRoster(key)
            }
        },
    }
}
