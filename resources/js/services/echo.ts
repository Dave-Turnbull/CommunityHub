import Echo from 'laravel-echo'
import Pusher from 'pusher-js'
import { useChannels, useMessages, useNotifications, usePresence } from '@/stores'
import type { AppNotification, Channel, Message, ReactionSummary, UserStatus } from '@/types'

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

type PresencePayload = {
    user_id: string
    status: UserStatus
    custom_status?: string | null
    custom_status_color?: string | null
}

/** Subscribe to the global presence channel. Returns a cleanup function. */
export function subscribePresence(): () => void {
    const e = getEcho()
    const { setPresence } = usePresence.getState()

    const apply = (u: PresencePayload) =>
        setPresence(u.user_id, {
            status: u.status,
            customStatus: u.custom_status ?? null,
            customStatusColor: u.custom_status_color ?? null,
        })

    e.join('presence.global')
        .here((users: PresencePayload[]) => users.forEach(apply))
        // Use the joining member's actual configured status (idle/dnd/invisible),
        // not a hardcoded 'online' — a member showing up here is merely "has a tab
        // open," which isn't the same thing as their chosen status.
        .joining((u: PresencePayload) => apply(u))
        .leaving((u: { user_id: string }) =>
            setPresence(u.user_id, { status: 'offline', customStatus: null, customStatusColor: null }))
        // A user changing their own status (the popover, or the forced
        // online/offline on login/logout) — .here()/.joining() only fire once,
        // at connection time, so without this an already-open tab (including
        // the user's own) never sees the change until it reconnects.
        // UserStatusService::setStatus() always broadcasts the full snapshot,
        // so this always applies a self-consistent PresenceEntry.
        .listen('.UserStatusChanged', (e: PresencePayload) => apply(e))

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
 * Announce that this tab just joined a voice call, over the current user's
 * own private channel (already subscribed everywhere via
 * subscribeNotifications() — no dedicated channel needed). Every other open
 * tab for the same user hears this and can decide to leave whatever call it
 * was in — see services/voiceCallGuard.ts, which is what actually acts on
 * it. Fire-and-forget, like every other whisper in this app; never reaches
 * PHP (see CLAUDE.md's Voice conventions on why voice signaling avoids the
 * backend for latency).
 */
export function announceVoiceJoin(userId: string, scopeType: 'channel' | 'conversation', scopeId: string): void {
    getEcho().private(`App.Models.User.${userId}`).whisper('voice-join', { scopeType, scopeId })
}

/**
 * Listen for another of this user's own tabs announcing a voice-call join.
 * Returns a cleanup function that removes only this listener — NOT
 * `e.leave(name)` — this channel is shared with subscribeNotifications()'s
 * own, independent, whole-session subscription to the same
 * `App.Models.User.{id}` channel; leaving it here would tear that down too
 * (the same class of bug as trap #32: two independent subscribers to one
 * channel need independent teardown, not a shared "last one out" leave).
 * See services/voiceCallGuard.ts for how this is used.
 */
export function subscribeVoiceCallGuard(
    userId: string,
    onOtherTabJoined: (scopeType: 'channel' | 'conversation', scopeId: string) => void
): () => void {
    const name = `App.Models.User.${userId}`
    const listener = (ev: { scopeType: 'channel' | 'conversation'; scopeId: string }) =>
        onOtherTabJoined(ev.scopeType, ev.scopeId)

    const channel = getEcho().private(name)
    channel.listenForWhisper('voice-join', listener)

    return () => channel.stopListeningForWhisper('voice-join', listener)
}

/**
 * Subscribe to a room's channel list — ChannelCreated/ChannelUpdated/
 * ChannelDeleted, so every room member's sidebar stays live without a page
 * reload. Private, not presence — nothing here needs a member roster.
 * Returns a cleanup function.
 */
export function subscribeRoomChannels(roomId: string): () => void {
    const e = getEcho()
    const store = useChannels.getState()
    const name = `room.${roomId}`

    e.private(name)
        .listen('.ChannelCreated', (ev: { channel: Channel }) => store.addChannel(roomId, ev.channel))
        .listen('.ChannelUpdated', (ev: { channel: Channel }) => store.updateChannel(roomId, ev.channel))
        .listen('.ChannelDeleted', (ev: { channel_id: string }) => store.removeChannel(roomId, ev.channel_id))

    return () => e.leave(name)
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
