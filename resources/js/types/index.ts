// 'custom' replaces the other 4 entirely rather than combining with them —
// custom_status/custom_status_color only ever hold something when status is
// 'custom' (see UserStatusService).
export type UserStatus  = 'online' | 'idle' | 'dnd' | 'offline' | 'custom'

// Open-ended on purpose — runtime types come from the channel-type registry
// (services/channelTypes.tsx), which mirrors App\Support\ChannelTypes on the
// backend. A closed union here would contradict the goal of channel types
// being pluggable without a frontend code change to widen it.
export type ChannelType = string

// auto: prefer P2P, fall back to TURN relay per-pair when direct fails (just
// normal ICE candidate priority given both STUN+TURN servers are supplied).
// direct: STUN only, no TURN servers sent — a pair that can't connect
// directly simply doesn't connect. relay: iceTransportPolicy 'relay', forces
// TURN for every pair. A property of the voice-capable channel/conversation
// itself (applies to every participant in that call equally), not a
// per-user preference — see channels.voice_mode / conversations.voice_mode.
export type VoiceConnectionMode = 'auto' | 'direct' | 'relay'

export interface User {
    id: string
    username: string
    display_name: string
    avatar_url: string | null
    banner_url?: string | null
    bio?: string | null
    status: UserStatus
    custom_status?: string | null
    custom_status_color?: string | null
}

// One entry per (text, color) pair a user has set as their custom status —
// see UserStatusService::recordRecentCustomStatus. Capped at 3, most recent
// first.
export interface RecentCustomStatus {
    text: string
    color: string
}

export interface Room {
    id: string
    name: string
    icon_url: string | null
    owner_id: string
    invite_code: string
    channels?: Channel[]
    custom_emojis?: CustomEmoji[]
}

export interface RoomMember {
    id: string
    room_id: string
    user_id: string
    nickname: string | null
    user?: User
}

// Mirrors App\Support\Permission on the backend — see PermissionChecker.
// Administrator implies every other permission in whatever scope the role
// applies (room-scoped, or global/instance-wide when role.room_id is null).
export type PermissionKey =
    | 'administrator'
    | 'manage_room'
    | 'manage_roles'
    | 'manage_channels'
    | 'manage_members'
    | 'ban_members'
    | 'manage_messages'
    | 'manage_emojis'

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
    administrator: 'Administrator',
    manage_room: 'Manage Room',
    manage_roles: 'Manage Roles',
    manage_channels: 'Manage Channels',
    manage_members: 'Manage Members',
    ban_members: 'Ban Members',
    manage_messages: 'Manage Messages',
    manage_emojis: 'Manage Emojis',
}

export interface RolePermission {
    id: string
    permission: PermissionKey
}

export interface Role {
    id: string
    room_id: string | null
    name: string
    position: number
    is_default: boolean
    is_system: boolean
    role_permissions?: RolePermission[]
    users?: User[]
    // Gate::allows('manage', $role) for the current viewer — hierarchy-aware
    // (Role::outranks), not just "has manage_roles somewhere" — see
    // RolePolicy::manage. Only present on Rooms/Roles.tsx's room.roles.
    can_manage?: boolean
}

export interface Channel {
    id: string
    room_id: string
    name: string
    type: ChannelType
    topic: string | null
    position: number
    voice_mode: VoiceConnectionMode
    settings: Record<string, unknown> | null
}

export interface Attachment {
    id: string
    url: string
    filename: string
    mime_type: string
    size_bytes: number
    width: number | null
    height: number | null
}

export interface ReactionSummary {
    emoji: string
    count: number
    reacted: boolean
}

export interface Message {
    id: string
    channel_id: string | null
    conversation_id: string | null
    author_id: string
    content: string | null
    type: string
    is_edited: boolean
    is_pinned: boolean
    reply_to_id: string | null
    created_at: string
    author?: User
    attachments?: Attachment[]
    reactions?: ReactionSummary[]
    reply_to?: Message
}

export interface RoomInvite {
    id: string
    room_id: string
    email: string
    invited_by: User
    expires_at: string
    created_at: string
}

export interface CustomEmoji {
    id: string
    room_id: string
    name: string
    image_url: string
}

export interface ConversationParticipant {
    id: string
    user_id: string
    user?: User
}

export interface Conversation {
    id: string
    type: 'dm' | 'group'
    name: string | null
    icon_url: string | null
    unread_count: number
    voice_mode: VoiceConnectionMode
    participants?: ConversationParticipant[]
    last_message?: Message
}

export interface PaginatedMessages {
    data: Message[]
    has_more: boolean
    next_cursor: string | null
}

// ── Voice ─────────────────────────────────────────────────────────────────

export interface IceServer {
    urls: string | string[]
    username?: string
    credential?: string
}

// Keyed by (user, client_id) — see services/clientId.ts — not just user,
// since mic/speaker choice is per browser install.
export interface VoiceDevicePreference {
    client_id: string
    input_device_id: string | null
    output_device_id: string | null
    // 0-100; 0 means voice activation is off and the mic always transmits.
    send_threshold: number
    // 0/10/20/30 — hysteresis gap subtracted from send_threshold to get the
    // "close" threshold; 0 means no gap (single-threshold behavior).
    close_threshold_gap: number
    // 500-5000 (step 500) or null ("Off") — forces the gate closed if the
    // level hasn't hit the open threshold again within this many ms, even if
    // still above the close threshold (handles continuous background noise
    // sitting in the hysteresis band). null is a real, meaningful stored
    // value here, not "unset" — see services/voiceActivation.ts's
    // createHangTimeGate and docs/voice.md.
    close_threshold_timeout_ms: number | null
    // getUserMedia audio-processing constraints — applied at the next
    // getUserMedia call (join or mic test), not live-reactive like
    // send_threshold, since they're fixed at stream-acquisition time.
    echo_cancellation: boolean
    noise_suppression: boolean
    auto_gain_control: boolean
}

export interface VoiceParticipant {
    userId: string
    displayName: string
    avatarUrl: string | null
    muted: boolean
}

interface NotificationBase {
    id: string
    user_id: string
    read_at: string | null
    created_at: string
}

export interface DirectMessageNotificationData {
    conversation_id: string
    // null when this notification is "you were added to a group" rather than
    // an actual message — see ConversationController::addParticipants.
    message_id: string | null
    sender_id: string
    sender_name: string
    preview: string
}

export interface RoomMessageNotificationData {
    room_id: string
    room_name: string
    channel_id: string
    channel_name: string
    message_id: string
    sender_id: string
    sender_name: string
    preview: string
}

export interface RoomInviteNotificationData {
    room_id: string
    room_name: string
    invited_by: string
    invite_token: string
}

// Discriminated on `type` — narrow with `if (n.type === '...')` before reading `data`.
export type AppNotification =
    | (NotificationBase & { type: 'direct_message'; data: DirectMessageNotificationData })
    | (NotificationBase & { type: 'room_message'; data: RoomMessageNotificationData })
    | (NotificationBase & { type: 'room_invite'; data: RoomInviteNotificationData })

// User-level notification preference categories. Room-by-room and
// channel-by-channel categories/overrides are planned but not implemented —
// see CLAUDE.md "## Planned work".
export type NotificationCategory = 'room_invite' | 'room_message' | 'direct_message'

// Shared between Settings' NotificationPreferences panel and the Messages
// page's NotificationFeed filter chips, so a label never drifts between the
// two surfaces. "direct_message" reads as "Messages" — see NotificationFeed
// and NotificationPreference::IN_APP_LOCKED for why it can't be disabled.
export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
    room_invite: 'Room Invites',
    room_message: 'Room Messages',
    direct_message: 'Messages',
}

// Mirrors NotificationPreference::IN_APP_LOCKED on the backend, which is the
// actual source of truth (rejects the write); this only drives the UI so the
// toggle looks locked instead of just failing silently on click.
export const NOTIFICATION_IN_APP_LOCKED: NotificationCategory[] = ['direct_message']

export interface NotificationPreference {
    category: NotificationCategory
    email: boolean
    in_app: boolean
}

// ── Inertia shared props ─────────────────────────────────────────────────
export interface SharedProps {
    appName: string
    auth: { user: User }
    rooms: Room[]
    conversations: Conversation[]
    recentCustomStatuses: RecentCustomStatus[]
    flash: { success?: string; error?: string }
}

export interface ChannelPageProps extends SharedProps {
    room: Room
    channel: Channel
    members: RoomMember[]
    custom_emojis: CustomEmoji[]
    // null for a voice channel — see ChannelController::show, MessageController's
    // matching guard against posting/listing text into a voice channel.
    messages: PaginatedMessages | null
    // Gate::allows('create', [Channel::class, $room]) / [Role::class, $room] —
    // drives ChannelSidebar's "+ Add Channel" button and "Roles" link.
    can_manage_channels: boolean
    can_manage_roles: boolean
}

export interface DMPageProps extends SharedProps {
    conversation: Conversation
    messages: PaginatedMessages
}

export interface RoomRolesPageProps extends SharedProps {
    room: Room & { roles: Role[]; members: RoomMember[] }
}
