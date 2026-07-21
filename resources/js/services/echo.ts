import Echo from 'laravel-echo'
import Pusher from 'pusher-js'
import { useMessages, useNotifications, usePresence } from '@/stores'
import type { AppNotification, Message, ReactionSummary, UserStatus } from '@/types'

declare global {
    interface Window { Pusher: typeof Pusher; Echo: Echo<'reverb'> }
}

window.Pusher = Pusher

let echo: Echo<'reverb'> | null = null

function getEcho(): Echo<'reverb'> {
    if (!echo) {
        echo = new Echo({
            broadcaster: 'reverb',
            key:      import.meta.env.VITE_REVERB_APP_KEY,
            wsHost:   import.meta.env.VITE_REVERB_HOST,
            wsPort:   Number(import.meta.env.VITE_REVERB_PORT ?? 8080),
            wssPort:  Number(import.meta.env.VITE_REVERB_PORT ?? 8080),
            forceTLS: import.meta.env.VITE_REVERB_SCHEME === 'https',
            enabledTransports: ['ws', 'wss'],
        })
        window.Echo = echo
    }
    return echo
}

/** Subscribe to a channel or conversation. Returns a cleanup function. */
export function subscribe(
    scopeId: string,
    scopeType: 'channel' | 'conversation'
): () => void {
    const e = getEcho()
    const store = useMessages.getState()
    const name = `${scopeType}.${scopeId}`

    const chan = scopeType === 'channel' ? e.join(name) : e.private(name)

    chan.listen('.MessageSent',    (ev: { message: Message })    => store.add(scopeId, ev.message))
    chan.listen('.MessageUpdated', (ev: { message: Message })    => store.update(scopeId, ev.message))
    chan.listen('.MessageDeleted', (ev: { message_id: string })  => store.remove(scopeId, ev.message_id))
    chan.listen('.ReactionChanged', (ev: { message_id: string; reactions: ReactionSummary[] }) =>
        store.setReactions(scopeId, ev.message_id, ev.reactions)
    )

    return () => e.leave(name)
}

/** Subscribe to the global presence channel. Returns a cleanup function. */
export function subscribePresence(): () => void {
    const e = getEcho()
    const { setStatus } = usePresence.getState()

    e.join('presence.global')
        .here((users: { user_id: string; status: UserStatus }[]) =>
            users.forEach((u) => setStatus(u.user_id, u.status))
        )
        .joining((u: { user_id: string }) => setStatus(u.user_id, 'online'))
        .leaving((u: { user_id: string }) => setStatus(u.user_id, 'offline'))

    return () => e.leave('presence.global')
}

/**
 * Join a voice call's presence channel — roster (`.here/.joining/.leaving`)
 * AND signaling transport (SDP offer/answer + ICE candidates as Reverb
 * client events, i.e. `.whisper()`/`.listenForWhisper()`) for
 * services/webrtc.ts. A dedicated `voice.*` channel, not a reuse of
 * subscribe()'s channel.{id}/conversation.{id} — those are the text-message
 * presence/private channels, and coupling voice signaling onto them would
 * tie two unrelated concerns to one socket subscription. Whisper payloads
 * never reach PHP, so there's no queue-latency concern for real-time SDP/ICE
 * exchange (a deliberate deviation from this app's usual ShouldBroadcast +
 * queued-worker broadcasting convention).
 */
export function joinVoiceChannel(scopeType: 'channel' | 'conversation', scopeId: string) {
    const e = getEcho()
    const name = `voice.${scopeType}.${scopeId}`

    return { channel: e.join(name), leave: () => e.leave(name) }
}

/**
 * Subscribe to the current user's private channel — notifications today,
 * a foundation for any future user-targeted push. Returns a cleanup function.
 */
export function subscribeNotifications(userId: string): () => void {
    const e = getEcho()
    const store = useNotifications.getState()
    const name = `App.Models.User.${userId}`

    e.private(name).listen(
        '.NotificationCreated',
        (ev: { notification: AppNotification }) => store.add(ev.notification)
    )

    return () => e.leave(name)
}
