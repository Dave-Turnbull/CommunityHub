import axios from 'axios'
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
    Role,
    RoomInvite,
    User,
    VoiceDevicePreference,
} from '@/types'

axios.defaults.withCredentials = true
axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest'

export type SendPayload = {
    content?: string
    attachment_ids?: string[]
    reply_to_id?: string
}

// ── Messages ─────────────────────────────────────────────────────────────

export async function fetchChannelMessages(
    channelId: string,
    before?: string
): Promise<PaginatedMessages> {
    const { data } = await axios.get(`/api/channels/${channelId}/messages`, {
        params: { before },
    })
    return data
}

export async function fetchConversationMessages(
    conversationId: string,
    before?: string
): Promise<PaginatedMessages> {
    const { data } = await axios.get(`/api/conversations/${conversationId}/messages`, {
        params: { before },
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

// ── Channel focus ────────────────────────────────────────────────────────

export async function focusChannel(channelId: string): Promise<void> {
    await axios.post(`/api/channels/${channelId}/focus`)
}

export async function blurChannel(channelId: string): Promise<void> {
    await axios.post(`/api/channels/${channelId}/blur`)
}

// ── Reactions ────────────────────────────────────────────────────────────

export async function addReaction(messageId: string, emoji: string): Promise<void> {
    await axios.post(`/api/messages/${messageId}/reactions`, { emoji })
}

export async function removeReaction(messageId: string, emoji: string): Promise<void> {
    await axios.delete(`/api/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`)
}

// ── Uploads ──────────────────────────────────────────────────────────────

export async function uploadFile(file: File): Promise<Attachment> {
    const form = new FormData()
    form.append('file', file)

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

export async function deleteChannel(channelId: string): Promise<void> {
    await axios.delete(`/api/channels/${channelId}`)
}

export async function reorderChannels(roomId: string, channelIds: string[]): Promise<void> {
    await axios.patch(`/api/rooms/${roomId}/channels/reorder`, { channel_ids: channelIds })
}

// ── Roles ────────────────────────────────────────────────────────────────

export async function createRole(roomId: string, name: string): Promise<Role> {
    const { data } = await axios.post(`/api/rooms/${roomId}/roles`, { name })
    return data
}

export async function updateRole(
    roleId: string,
    payload: Partial<{ name: string; position: number; permissions: PermissionKey[] }>
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
