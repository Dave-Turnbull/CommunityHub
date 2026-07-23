import { create } from 'zustand'
import type { AppNotification, Channel, Message, ReactionSummary, UserStatus, VoiceParticipant } from '@/types'

// ── Channels ─────────────────────────────────────────────────────────────
// Keyed by roomId, mirroring useMessages' scopeId-keyed shape. Seeded from
// the Inertia page's `room.channels` prop on every page load (always fresh
// at that moment), then kept live by ChannelCreated/ChannelUpdated/
// ChannelDeleted broadcasts on the room.{roomId} private channel — see
// services/echo.ts's subscribeRoomChannels(). The creating/editing/deleting
// user's own tab updates this store directly from the HTTP response (the
// broadcast uses ->toOthers(), same convention as useMessages).

interface ChannelStore {
    channels: Record<string, Channel[]>

    setChannels: (roomId: string, channels: Channel[]) => void
    addChannel: (roomId: string, channel: Channel) => void
    updateChannel: (roomId: string, channel: Channel) => void
    removeChannel: (roomId: string, channelId: string) => void
}

export const useChannels = create<ChannelStore>((set) => ({
    channels: {},

    setChannels: (roomId, channels) =>
        set((s) => ({ channels: { ...s.channels, [roomId]: channels } })),

    addChannel: (roomId, channel) =>
        set((s) => {
            const existing = s.channels[roomId] ?? []
            if (existing.some((c) => c.id === channel.id)) return s
            return { channels: { ...s.channels, [roomId]: [...existing, channel] } }
        }),

    updateChannel: (roomId, channel) =>
        set((s) => ({
            channels: {
                ...s.channels,
                [roomId]: (s.channels[roomId] ?? []).map((c) => (c.id === channel.id ? channel : c)),
            },
        })),

    removeChannel: (roomId, channelId) =>
        set((s) => ({
            channels: {
                ...s.channels,
                [roomId]: (s.channels[roomId] ?? []).filter((c) => c.id !== channelId),
            },
        })),
}))

// ── Messages ─────────────────────────────────────────────────────────────
// Keyed by scopeId (channelId or conversationId) so multiple chats can
// live in memory at once without clobbering each other.

interface MessageStore {
    messages: Record<string, Message[]>
    typing: Record<string, string[]>

    setMessages: (scope: string, messages: Message[]) => void
    prepend:     (scope: string, older: Message[]) => void
    add:         (scope: string, message: Message) => void
    update:      (scope: string, message: Message) => void
    remove:      (scope: string, messageId: string) => void
    setReactions:(scope: string, messageId: string, reactions: ReactionSummary[]) => void
}

export const useMessages = create<MessageStore>((set) => ({
    messages: {},
    typing: {},

    setMessages: (scope, messages) =>
        set((s) => ({ messages: { ...s.messages, [scope]: messages } })),

    prepend: (scope, older) =>
        set((s) => ({
            messages: { ...s.messages, [scope]: [...older, ...(s.messages[scope] ?? [])] },
        })),

    add: (scope, message) =>
        set((s) => {
            const existing = s.messages[scope] ?? []
            // Guard against duplicates — the sender gets the message back from
            // the HTTP response AND (if not using toOthers) the websocket.
            if (existing.some((m) => m.id === message.id)) return s
            return { messages: { ...s.messages, [scope]: [...existing, message] } }
        }),

    update: (scope, message) =>
        set((s) => ({
            messages: {
                ...s.messages,
                [scope]: (s.messages[scope] ?? []).map((m) => (m.id === message.id ? message : m)),
            },
        })),

    remove: (scope, messageId) =>
        set((s) => ({
            messages: {
                ...s.messages,
                [scope]: (s.messages[scope] ?? []).filter((m) => m.id !== messageId),
            },
        })),

    setReactions: (scope, messageId, reactions) =>
        set((s) => ({
            messages: {
                ...s.messages,
                [scope]: (s.messages[scope] ?? []).map((m) =>
                    m.id === messageId ? { ...m, reactions } : m
                ),
            },
        })),
}))

// ── Presence ─────────────────────────────────────────────────────────────

export interface PresenceEntry {
    status: UserStatus
    customStatus: string | null
    customStatusColor: string | null
}

interface PresenceStore {
    statuses: Record<string, PresenceEntry>
    setPresence: (userId: string, entry: PresenceEntry) => void
}

export const usePresence = create<PresenceStore>((set) => ({
    statuses: {},
    setPresence: (userId, entry) =>
        set((s) => ({ statuses: { ...s.statuses, [userId]: entry } })),
}))

// ── UI ───────────────────────────────────────────────────────────────────

interface UIStore {
    memberListOpen: boolean
    toggleMemberList: () => void
}

export const useUI = create<UIStore>((set) => ({
    memberListOpen: true,
    toggleMemberList: () => set((s) => ({ memberListOpen: !s.memberListOpen })),
}))

// ── Notifications ────────────────────────────────────────────────────────

interface NotificationStore {
    notifications: AppNotification[]
    setNotifications: (notifications: AppNotification[]) => void
    add: (notification: AppNotification) => void
    markRead: (notificationId: string) => void
    markAllRead: () => void
}

export const useNotifications = create<NotificationStore>((set) => ({
    notifications: [],

    setNotifications: (notifications) => set({ notifications }),

    add: (notification) =>
        set((s) => {
            if (s.notifications.some((n) => n.id === notification.id)) return s
            return { notifications: [notification, ...s.notifications] }
        }),

    markRead: (notificationId) =>
        set((s) => ({
            notifications: s.notifications.map((n) =>
                n.id === notificationId ? { ...n, read_at: new Date().toISOString() } : n
            ),
        })),

    markAllRead: () =>
        set((s) => ({
            notifications: s.notifications.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })),
        })),
}))

// ── Voice ────────────────────────────────────────────────────────────────
// RTCPeerConnection/MediaStream objects live in services/webrtc.ts's own
// module-level maps, never in a store (not serializable-safe, shouldn't
// trigger a store subscriber re-render on their own).

type VoiceConnectionState = 'idle' | 'connecting' | 'connected'

// "My own active call" state only — who ELSE is actually in a given call
// lives in useVoiceRoster below, since that's observable by anyone (e.g. the
// sidebar), not just someone who has joined. `selfParticipant` is non-null
// exactly while this browser tab has actually joined scopeType/scopeId's
// call — services/voicePresence.ts reads it to decide whether to re-announce
// this user's call-state to a newly arrived subscriber (see the comment
// there): merely being subscribed to the presence channel (as an observer)
// must NOT be mistaken for being in the call.
interface VoiceStore {
    scopeType: 'channel' | 'conversation' | null
    scopeId: string | null
    selfParticipant: VoiceParticipant | null
    selfMuted: boolean
    connectionState: VoiceConnectionState

    setScope: (scopeType: 'channel' | 'conversation', scopeId: string, selfParticipant: VoiceParticipant) => void
    setSelfMuted: (muted: boolean) => void
    setConnectionState: (state: VoiceConnectionState) => void
    reset: () => void
}

const VOICE_INITIAL_STATE = {
    scopeType: null,
    scopeId: null,
    selfParticipant: null,
    selfMuted: false,
    connectionState: 'idle' as VoiceConnectionState,
}

export const useVoice = create<VoiceStore>((set) => ({
    ...VOICE_INITIAL_STATE,

    setScope: (scopeType, scopeId, selfParticipant) => set({ scopeType, scopeId, selfParticipant }),
    setSelfMuted: (muted) => set({ selfMuted: muted }),
    setConnectionState: (state) => set({ connectionState: state }),
    reset: () => set(VOICE_INITIAL_STATE),
}))

// ── Voice roster ─────────────────────────────────────────────────────────
// "Who is currently ACTUALLY IN this channel/conversation's call" — shared,
// observable state, keyed by `${scopeType}.${scopeId}`, independent of
// whether the current user has joined. NOT the same thing as who's merely
// subscribed to the scope's presence channel — ChannelSidebar subscribes
// too, just to observe, without opening a mic. Populated exclusively by
// services/voicePresence.ts's `call-state` whisper handling (an explicit
// "I'm actually in the call" announcement), never by raw presence
// membership — see the trap this fixed in CLAUDE.md before changing it.

interface VoiceRosterStore {
    rosters: Record<string, VoiceParticipant[]>

    setRoster: (key: string, participants: VoiceParticipant[]) => void
    upsertParticipant: (key: string, participant: VoiceParticipant) => void
    removeParticipant: (key: string, userId: string) => void
    setParticipantMuted: (key: string, userId: string, muted: boolean) => void
    clearRoster: (key: string) => void
}

export const useVoiceRoster = create<VoiceRosterStore>((set) => ({
    rosters: {},

    setRoster: (key, participants) =>
        set((s) => ({ rosters: { ...s.rosters, [key]: participants } })),

    upsertParticipant: (key, participant) =>
        set((s) => {
            const existing = s.rosters[key] ?? []
            const others = existing.filter((p) => p.userId !== participant.userId)
            return { rosters: { ...s.rosters, [key]: [...others, participant] } }
        }),

    removeParticipant: (key, userId) =>
        set((s) => ({
            rosters: { ...s.rosters, [key]: (s.rosters[key] ?? []).filter((p) => p.userId !== userId) },
        })),

    setParticipantMuted: (key, userId, muted) =>
        set((s) => ({
            rosters: {
                ...s.rosters,
                [key]: (s.rosters[key] ?? []).map((p) => (p.userId === userId ? { ...p, muted } : p)),
            },
        })),

    clearRoster: (key) =>
        set((s) => {
            const { [key]: _removed, ...rest } = s.rosters
            return { rosters: rest }
        }),
}))
