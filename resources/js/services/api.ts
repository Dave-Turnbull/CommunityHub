import axios from 'axios'
import { compressImageFile } from '@/services/imageCompression'
import type {
    AppNotification,
    Attachment,
    Channel,
    Conversation,
    IceServer,
    Message,
    NotificationPreference,
    PaginatedMessages,
    PermissionKey,
    ReactionSummary,
    RecentCustomStatus,
    Role,
    RoomInvite,
    RoomMember,
    User,
    UserStatus,
    VoiceDevicePreference,
    VoteSummary,
} from '@/types'

axios.defaults.withCredentials = true
axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest'

export type SendPayload = {
    content?: string
    title?: string
    attachment_ids?: string[]
    reply_to_id?: string
}

// ── Messages ─────────────────────────────────────────────────────────────

/** One cursor at a time — the endpoint rejects more than one of these together. */
export type MessageCursor = { before?: string; after?: string; around?: string }

export async function fetchChannelMessages(
    channelId: string,
    cursor: MessageCursor = {}
): Promise<PaginatedMessages> {
    const { data } = await axios.get(`/api/channels/${channelId}/messages`, { params: cursor })
    return data
}

export async function fetchConversationMessages(
    conversationId: string,
    cursor: MessageCursor = {}
): Promise<PaginatedMessages> {
    const { data } = await axios.get(`/api/conversations/${conversationId}/messages`, {
        params: cursor,
    })
    return data
}

export async function sendChannelMessage(
    channelId: string,
    payload: SendPayload
): Promise<Message> {
    const { data } = await axios.post(`/api/channels/${channelId}/messages`, payload)
    return data
}

export async function sendConversationMessage(
    conversationId: string,
    payload: SendPayload
): Promise<Message> {
    const { data } = await axios.post(`/api/conversations/${conversationId}/messages`, payload)
    return data
}

export async function editMessage(messageId: string, content: string): Promise<Message> {
    const { data } = await axios.patch(`/api/messages/${messageId}`, { content })
    return data
}

export async function deleteMessage(messageId: string): Promise<void> {
    await axios.delete(`/api/messages/${messageId}`)
}

// ── Comments ─────────────────────────────────────────────────────────────
// A comment's parent is another message rather than a channel/conversation
// — same cursor contract as the two message-list fetches above, see
// docs/comments-and-voting.md.

export async function fetchComments(
    messageId: string,
    cursor: MessageCursor = {}
): Promise<PaginatedMessages> {
    const { data } = await axios.get(`/api/messages/${messageId}/comments`, { params: cursor })
    return data
}

export async function sendComment(messageId: string, payload: SendPayload): Promise<Message> {
    const { data } = await axios.post(`/api/messages/${messageId}/comments`, payload)
    return data
}

export type TopSortPeriod = 'hour' | 'day' | 'week' | 'month' | 'all' | 'custom'
export type TopPage = { data: Message[]; next_offset: number; has_more: boolean }

/**
 * Score-ranked, timeframe-filtered, offset-paginated — a distinct contract
 * from fetchChannelMessages/fetchComments' cursor pages (score is mutable,
 * see TextMessageService::listTop). Works for a forum's top-level post list
 * (channelId) the same way it works for top-sorted comments within a
 * thread (pass a message id as `channelOrMessageId` against the comments
 * route instead) — see docs/comments-and-voting.md.
 */
export async function fetchTopPosts(
    channelId: string,
    params: { period: TopSortPeriod; start?: string; end?: string; offset?: number }
): Promise<TopPage> {
    const { data } = await axios.get(`/api/channels/${channelId}/messages`, {
        params: { sort: 'top', ...params },
    })
    return data
}

// ── Votes ────────────────────────────────────────────────────────────────

export async function castVote(messageId: string, value: 1 | -1): Promise<VoteSummary> {
    const { data } = await axios.post(`/api/messages/${messageId}/votes`, { value })
    return data
}

export async function removeVote(messageId: string): Promise<VoteSummary> {
    const { data } = await axios.delete(`/api/messages/${messageId}/votes`)
    return data
}

// ── Channel focus ────────────────────────────────────────────────────────

export async function focusChannel(channelId: string): Promise<void> {
    await axios.post(`/api/channels/${channelId}/focus`)
}

export async function blurChannel(channelId: string): Promise<void> {
    await axios.post(`/api/channels/${channelId}/blur`)
}

// ── Reactions ────────────────────────────────────────────────────────────

// Both return the message's full, authoritative reaction summary — what
// services/messageActions.ts reconciles its optimistic guess against.

export async function addReaction(messageId: string, emoji: string): Promise<ReactionSummary[]> {
    const { data } = await axios.post(`/api/messages/${messageId}/reactions`, { emoji })
    return data
}

export async function removeReaction(messageId: string, emoji: string): Promise<ReactionSummary[]> {
    const { data } = await axios.delete(
        `/api/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`
    )
    return data
}

// ── Uploads ──────────────────────────────────────────────────────────────

export async function uploadFile(file: File): Promise<Attachment> {
    const upload = await compressImageFile(file)

    const form = new FormData()
    form.append('file', upload)

    const { data } = await axios.post('/api/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
}

// ── Channels ─────────────────────────────────────────────────────────────

export async function createChannel(
    roomId: string,
    payload: { name: string; type: string; topic?: string }
): Promise<Channel> {
    const { data } = await axios.post(`/api/rooms/${roomId}/channels`, payload)
    return data
}

export async function updateChannel(
    channelId: string,
    payload: Partial<{ name: string; topic: string | null; is_nsfw: boolean; slow_mode_seconds: number }>
): Promise<Channel> {
    const { data } = await axios.patch(`/api/channels/${channelId}`, payload)
    return data
}

// Separate from updateChannel — gated by ManageChannelVisibility, not
// ManageChannels, so it can be called by an actor who only holds the former
// (see Api\ChannelController::update's split authorization).
export async function updateChannelVisibility(channelId: string, roleIds: string[]): Promise<Channel> {
    const { data } = await axios.patch(`/api/channels/${channelId}`, { visibility_role_ids: roleIds })
    return data
}

// Visibility (who sees this channel) and permission overrides (who can do
// what in it) are edited together in one panel (ChannelPermissionsPanel) and
// saved as one request — see Api\ChannelController::update's transactional
// handling of both fields together.
export async function updateChannelPermissions(
    channelId: string,
    payload: { visibility_role_ids: string[]; permission_overrides: { role_id: string; permission: PermissionKey; allowed: boolean }[] }
): Promise<Channel> {
    const { data } = await axios.patch(`/api/channels/${channelId}`, payload)
    return data
}

export async function deleteChannel(channelId: string): Promise<void> {
    await axios.delete(`/api/channels/${channelId}`)
}

export async function reorderChannels(roomId: string, channelIds: string[]): Promise<void> {
    await axios.patch(`/api/rooms/${roomId}/channels/reorder`, { channel_ids: channelIds })
}

// ── Roles ────────────────────────────────────────────────────────────────

export async function fetchRoomRoles(roomId: string): Promise<{ roles: Role[]; members: RoomMember[] }> {
    const { data } = await axios.get(`/api/rooms/${roomId}/roles`)
    return data
}

export async function createRole(roomId: string, name: string): Promise<Role> {
    const { data } = await axios.post(`/api/rooms/${roomId}/roles`, { name })
    return data
}

export async function updateRole(
    roleId: string,
    payload: Partial<{ name: string; position: number; permissions: PermissionKey[]; channel_categories: string[] }>
): Promise<Role> {
    const { data } = await axios.patch(`/api/roles/${roleId}`, payload)
    return data
}

export async function deleteRole(roleId: string): Promise<void> {
    await axios.delete(`/api/roles/${roleId}`)
}

export async function reorderRoles(roomId: string, roleIds: string[]): Promise<void> {
    await axios.patch(`/api/rooms/${roomId}/roles/reorder`, { role_ids: roleIds })
}

export async function addRoleMember(roleId: string, userId: string): Promise<void> {
    await axios.post(`/api/roles/${roleId}/members`, { user_id: userId })
}

export async function removeRoleMember(roleId: string, userId: string): Promise<void> {
    await axios.delete(`/api/roles/${roleId}/members/${userId}`)
}

// ── Global (instance-wide) roles ────────────────────────────────────────
// update/delete/addMember/removeMember above are room-less already (keyed
// by role id, not room id) and work unchanged for global roles — only
// create/reorder need room-less endpoints, see Api\RoleController::
// storeGlobal/reorderGlobal.

export async function fetchGlobalRoles(): Promise<{ roles: Role[]; users: User[] }> {
    const { data } = await axios.get('/api/settings/roles')
    return data
}

export async function createGlobalRole(name: string): Promise<Role> {
    const { data } = await axios.post('/api/settings/roles', { name })
    return data
}

export async function reorderGlobalRoles(roleIds: string[]): Promise<void> {
    await axios.patch('/api/settings/roles/reorder', { role_ids: roleIds })
}

export async function updateRoleRoomCeiling(
    roleId: string,
    payload: { has_ceiling: boolean; permissions?: PermissionKey[]; channel_categories?: string[] }
): Promise<{ has_room_permission_ceiling: boolean; room_permission_ceiling: PermissionKey[]; room_channel_category_ceiling: string[] }> {
    const { data } = await axios.patch(`/api/settings/roles/${roleId}/room-ceiling`, payload)
    return data
}

// ── Instance settings (server signup-path toggles) ─────────────────────
// Backs Settings' self-fetching "Server" tab — see Api\InstanceSettingsController.

export interface InstanceSettings {
    signup_manual_enabled: boolean
    signup_email_invite_enabled: boolean
    signup_oauth_enabled: boolean
}

export async function fetchInstanceSettings(): Promise<InstanceSettings> {
    const { data } = await axios.get('/api/settings/instance')
    return data
}

export async function updateInstanceSettings(payload: InstanceSettings): Promise<InstanceSettings> {
    const { data } = await axios.patch('/api/settings/instance', payload)
    return data
}

// A server invite (account-creation invite) — distinct from a room invite.
// `email` is optional: omit it for an open, shareable link.
export async function createServerInvite(email?: string): Promise<{ url: string }> {
    const { data } = await axios.post('/api/server-invites', { email: email || undefined })
    return data
}

// ── Room membership (kick/ban) ──────────────────────────────────────────
// See RoomMemberPolicy/RoomMembershipService. Kicking or banning a room's
// Owner 409s with { requires_owner_transfer: true } — the caller must
// resubmit with confirmOwnerTransfer: true to proceed, which makes the
// acting admin the room's new Owner.

export class OwnerTransferRequiredError extends Error {}

async function kickOrBan(
    method: 'delete' | 'post',
    url: string,
    confirmOwnerTransfer: boolean
): Promise<void> {
    try {
        await axios.request({ method, url, data: { confirm_owner_transfer: confirmOwnerTransfer } })
    } catch (e: any) {
        if (e.response?.status === 409 && e.response?.data?.requires_owner_transfer) {
            throw new OwnerTransferRequiredError(e.response.data.message)
        }
        throw e
    }
}

export async function kickRoomMember(roomId: string, userId: string, confirmOwnerTransfer = false): Promise<void> {
    await kickOrBan('delete', `/api/rooms/${roomId}/members/${userId}`, confirmOwnerTransfer)
}

export async function banRoomMember(roomId: string, userId: string, confirmOwnerTransfer = false): Promise<void> {
    await kickOrBan('post', `/api/rooms/${roomId}/bans/${userId}`, confirmOwnerTransfer)
}

export async function unbanRoomMember(roomId: string, userId: string): Promise<void> {
    await axios.delete(`/api/rooms/${roomId}/bans/${userId}`)
}

// ── Room invites ─────────────────────────────────────────────────────────

export async function fetchRoomInvites(roomId: string): Promise<RoomInvite[]> {
    const { data } = await axios.get(`/api/rooms/${roomId}/invites`)
    return data
}

export async function sendRoomInvite(roomId: string, email: string): Promise<RoomInvite> {
    const { data } = await axios.post(`/api/rooms/${roomId}/invites`, { email })
    return data
}

export async function revokeRoomInvite(inviteId: string): Promise<void> {
    await axios.delete(`/api/invites/${inviteId}`)
}

// ── Notifications ────────────────────────────────────────────────────────

export async function fetchNotifications(): Promise<AppNotification[]> {
    const { data } = await axios.get('/api/notifications')
    return data
}

export async function markNotificationRead(notificationId: string): Promise<AppNotification> {
    const { data } = await axios.post(`/api/notifications/${notificationId}/read`)
    return data
}

export async function markAllNotificationsRead(): Promise<void> {
    await axios.post('/api/notifications/read-all')
}

// ── Notification preferences ────────────────────────────────────────────

export async function fetchNotificationPreferences(): Promise<NotificationPreference[]> {
    const { data } = await axios.get('/api/notification-preferences')
    return data
}

export async function updateNotificationPreference(
    preference: NotificationPreference
): Promise<NotificationPreference> {
    const { data } = await axios.put('/api/notification-preferences', preference)
    return data
}

// ── Conversations ────────────────────────────────────────────────────────

export async function fetchConversationCandidates(q?: string): Promise<User[]> {
    const { data } = await axios.get('/api/conversations/candidates', { params: { q } })
    return data
}

export async function resolveConversation(
    userIds: string[]
): Promise<{ type: 'dm' | 'group'; existing: Conversation | null }> {
    const { data } = await axios.get('/api/conversations/resolve', {
        params: { user_ids: userIds },
    })
    return data
}

export type StartConversationPayload = SendPayload & {
    user_ids: string[]
    name?: string
    confirm_duplicate?: boolean
}

export async function startConversation(
    payload: StartConversationPayload
): Promise<{ conversation: Conversation; message: Message }> {
    const { data } = await axios.post('/api/conversations', payload)
    return data
}

export async function addConversationParticipants(
    conversationId: string,
    userIds: string[]
): Promise<Conversation> {
    const { data } = await axios.post(`/api/conversations/${conversationId}/participants`, {
        user_ids: userIds,
    })
    return data
}

// ── Voice ────────────────────────────────────────────────────────────────

export async function fetchIceServers(): Promise<{ iceServers: IceServer[] }> {
    const { data } = await axios.get('/api/voice/ice-servers')
    return data
}

export async function fetchVoiceDevicePreference(clientId: string): Promise<VoiceDevicePreference> {
    const { data } = await axios.get('/api/voice/device-preference', { params: { client_id: clientId } })
    return data
}

export async function updateVoiceDevicePreference(
    preference: VoiceDevicePreference
): Promise<VoiceDevicePreference> {
    const { data } = await axios.put('/api/voice/device-preference', preference)
    return data
}

// ── Theme preference ─────────────────────────────────────────────────────

export interface ThemePreference {
    preset: string
    overrides: Record<string, string>
}

export async function fetchThemePreference(): Promise<ThemePreference> {
    const { data } = await axios.get('/api/theme-preference')
    return data
}

export async function updateThemePreference(preference: ThemePreference): Promise<ThemePreference> {
    const { data } = await axios.put('/api/theme-preference', preference)
    return data
}

// ── User status ──────────────────────────────────────────────────────────

// One endpoint for all 5 statuses — `custom_status`/`custom_status_color` are
// only meaningful (and required backend-side) when status is 'custom'.
export async function updateUserStatus(
    status: UserStatus,
    customStatus?: string | null,
    customStatusColor?: string | null
): Promise<{
    status: UserStatus
    custom_status: string | null
    custom_status_color: string | null
    recent: RecentCustomStatus[]
}> {
    const { data } = await axios.patch('/api/user-status', {
        status,
        custom_status: customStatus,
        custom_status_color: customStatusColor,
    })
    return data
}
