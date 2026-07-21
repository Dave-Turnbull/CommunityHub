export type UserStatus  = 'online' | 'idle' | 'dnd' | 'offline'
export type ChannelType = 'text' | 'voice' | 'announcement'

// Mirrors Channel::TEXT_CAPABLE_TYPES on the backend — an allow-list, not a
// "voice has no chat" special case, so a future custom channel type (e.g. a
// drawing or music channel) is text-incapable by default until explicitly
// added here and to the backend const together.
export const TEXT_CAPABLE_CHANNEL_TYPES: ChannelType[] = ['text', 'announcement']

export function isTextCapableChannelType(type: ChannelType): boolean {
    return TEXT_CAPABLE_CHANNEL_TYPES.includes(type)
}

// Single place to add a new channel type's sidebar/header glyph — falls back
// to '#' for a type not listed here yet, rather than every call site needing
// its own default.
const CHANNEL_TYPE_ICONS: Partial<Record<ChannelType, string>> = {
    voice: '🔊',
    announcement: '📢',
}

export function channelIcon(type: ChannelType): string {
    return CHANNEL_TYPE_ICONS[type] ?? '#'
}

// Preferred display order + label for known types. A type not listed here
// (a future custom type) still renders in ChannelSidebar — it's appended
// after the known ones with an auto-generated label — rather than silently
// disappearing because nobody added it to a fixed groups list.
export const CHANNEL_TYPE_ORDER: ChannelType[] = ['announcement', 'text', 'voice']

const CHANNEL_TYPE_LABELS: Partial<Record<ChannelType, string>> = {
    announcement: 'Announcements',
    text: 'Text Channels',
    voice: 'Voice Channels',
}

export function channelTypeLabel(type: ChannelType): string {
    return CHANNEL_TYPE_LABELS[type] ?? `${type.charAt(0).toUpperCase()}${type.slice(1)} Channels`
}

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

export interface Channel {
    id: string
    room_id: string
    name: string
    type: ChannelType
    topic: string | null
    position: number
    voice_mode: VoiceConnectionMode
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
}

export interface DMPageProps extends SharedProps {
    conversation: Conversation
    messages: PaginatedMessages
}
