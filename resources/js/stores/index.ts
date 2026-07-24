import { create } from 'zustand'
import type { AppNotification, Channel, Message, ReactionSummary, UserStatus, VoiceParticipant } from '@/types'
import type { ConnectionQuality } from '@/services/connectionQuality'

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
    // Silences every remote participant's playback for this tab only — pure
    // local listening state, entirely independent of selfMuted (deafening
    // does not stop your own mic from sending) and of each participant's
    // individual useVoiceVolume level, which stays untouched underneath it —
    // see docs/voice.md and RemoteParticipantAudio.
    deafened: boolean
    connectionState: VoiceConnectionState

    setScope: (scopeType: 'channel' | 'conversation', scopeId: string, selfParticipant: VoiceParticipant) => void
    setSelfMuted: (muted: boolean) => void
    setDeafened: (deafened: boolean) => void
    setConnectionState: (state: VoiceConnectionState) => void
    reset: () => void
}

const VOICE_INITIAL_STATE = {
    scopeType: null,
    scopeId: null,
    selfParticipant: null,
    selfMuted: false,
    deafened: false,
    connectionState: 'idle' as VoiceConnectionState,
}

export const useVoice = create<VoiceStore>((set) => ({
    ...VOICE_INITIAL_STATE,

    setScope: (scopeType, scopeId, selfParticipant) => set({ scopeType, scopeId, selfParticipant }),
    setSelfMuted: (muted) => set({ selfMuted: muted }),
    setDeafened: (deafened) => set({ deafened }),
    setConnectionState: (state) => set({ connectionState: state }),
    reset: () => set(VOICE_INITIAL_STATE),
}))

// ── Mic sensitivity (send threshold) ────────────────────────────────────
// A live, shared mirror of VoiceDevicePreference's send_threshold (0-100),
// close_threshold_gap (0/10/20/30 — the hysteresis gap, see
// services/voiceActivation.ts's ThresholdPair), close_threshold_timeout_ms
// (the hang-time timeout, null = "Off" — see createHangTimeGate), and
// auto_gain_control — deliberately its own store, NOT part of useVoice,
// because useVoice.reset() runs on every leaveVoice() and these values must
// survive across calls (they're persisted device preferences, not per-call
// ephemeral state like selfMuted/deafened). Both AudioSettings.tsx (on load
// and on every slider/select/toggle change) and useVoiceChannel's join()
// (from the fetched device preference) write to this; services/webrtc.ts's
// voice activation gate and AudioSettings.tsx's mic-test loopback both read
// it live on every tick (via services/voiceActivation.ts's
// computeThresholds/createHangTimeGate), so a change takes effect
// immediately without needing to leave and rejoin a call — see docs/voice.md.
// Initial defaults here match VoiceDevicePreference's own column defaults,
// for the brief window before a fetched preference seeds this store.

interface MicSensitivityStore {
    threshold: number
    closeGap: number
    timeoutMs: number | null
    autoGainControl: boolean
    setThreshold: (threshold: number) => void
    setCloseGap: (closeGap: number) => void
    setTimeoutMs: (timeoutMs: number | null) => void
    setAutoGainControl: (autoGainControl: boolean) => void
}

export const useMicSensitivity = create<MicSensitivityStore>((set) => ({
    threshold: 0,
    closeGap: 20,
    timeoutMs: 2000,
    autoGainControl: true,
    setThreshold: (threshold) => set({ threshold }),
    setCloseGap: (closeGap) => set({ closeGap }),
    setTimeoutMs: (timeoutMs) => set({ timeoutMs }),
    setAutoGainControl: (autoGainControl) => set({ autoGainControl }),
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

// ── Speaking ─────────────────────────────────────────────────────────────
// Whether each remote peer's incoming audio is currently above a fixed level
// threshold — purely local to this tab (each client independently analyzes
// the decoded audio it receives), never whispered/broadcast, and therefore
// kept out of useVoiceRoster's shared, whisper-populated participant state.
// Keyed directly by userId, not by scope, since services/webrtc.ts only ever
// has peer connections open for the one call this tab is currently in (see
// docs/voice.md's "Single active call" section).

interface SpeakingStore {
    speaking: Record<string, boolean>
    setSpeaking: (userId: string, isSpeaking: boolean) => void
    clear: () => void
}

export const useSpeaking = create<SpeakingStore>((set) => ({
    speaking: {},

    setSpeaking: (userId, isSpeaking) =>
        set((s) => {
            if ((s.speaking[userId] ?? false) === isSpeaking) return s
            return { speaking: { ...s.speaking, [userId]: isSpeaking } }
        }),

    clear: () => set({ speaking: {} }),
}))

// ── Voice volume ─────────────────────────────────────────────────────────
// Per-remote-participant *local playback* volume (0..1, default 1) — a
// personal "how loud does this person sound to me" preference. Never shared,
// never affects what anyone sends; kept separate from useVoiceRoster (shared,
// whisper-driven) for the same reason as useSpeaking above. Not persisted
// across sessions — resets to 1 (100%) on reload, same as useSpeaking.

interface VoiceVolumeStore {
    volumes: Record<string, number>
    setVolume: (userId: string, volume: number) => void
}

export const useVoiceVolume = create<VoiceVolumeStore>((set) => ({
    volumes: {},
    setVolume: (userId, volume) =>
        set((s) => ({ volumes: { ...s.volumes, [userId]: volume } })),
}))

// ── Remote stream version ────────────────────────────────────────────────
// services/webrtc.ts's `remoteStreams` Map holds the actual MediaStream
// objects and deliberately stays out of a store (not serializable-safe,
// shouldn't itself trigger re-renders — see the Voice section above). This
// is purely a "something changed" tick a component can subscribe to so it
// knows to re-read services/webrtc.ts's `getRemoteStream(userId)` and
// re-attach a fresh stream to an <audio> element, without ever putting the
// MediaStream itself in React/Zustand state.

interface RemoteStreamVersionStore {
    version: number
    bump: () => void
}

export const useRemoteStreamVersion = create<RemoteStreamVersionStore>((set) => ({
    version: 0,
    bump: () => set((s) => ({ version: s.version + 1 })),
}))

// ── Connection quality ───────────────────────────────────────────────────
// Per-remote-peer connection quality tier, purely local (each side polls its
// own RTCPeerConnection.getStats() for that peer — see
// services/connectionQuality.ts) — never whispered, since every figure it's
// based on already lives on the peer connection object itself. Same keying
// rationale as useSpeaking/useVoiceVolume: by userId, not by scope.

interface ConnectionQualityStore {
    quality: Record<string, ConnectionQuality>
    setQuality: (userId: string, quality: ConnectionQuality) => void
}

export const useConnectionQuality = create<ConnectionQualityStore>((set) => ({
    quality: {},

    setQuality: (userId, quality) =>
        set((s) => {
            if (s.quality[userId] === quality) return s
            return { quality: { ...s.quality, [userId]: quality } }
        }),
}))
