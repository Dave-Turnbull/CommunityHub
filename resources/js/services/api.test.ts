import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
    addConversationParticipants,
    addReaction,
    blurChannel,
    deleteMessage,
    editMessage,
    fetchChannelMessages,
    fetchConversationCandidates,
    fetchConversationMessages,
    fetchNotifications,
    fetchNotificationPreferences,
    focusChannel,
    markAllNotificationsRead,
    markNotificationRead,
    removeReaction,
    resolveConversation,
    sendChannelMessage,
    sendConversationMessage,
    startConversation,
    fetchThemePreference,
    updateNotificationPreference,
    updateThemePreference,
    uploadFile,
} from '@/services/api'

vi.mock('axios', () => ({
    default: {
        defaults: { withCredentials: false, headers: { common: {} } },
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
    },
}))

const mockedAxios = vi.mocked(axios, true)

describe('api service', () => {
    afterEach(() => {
        vi.clearAllMocks()
    })

    it('sets withCredentials and the XHR header globally', () => {
        expect(axios.defaults.withCredentials).toBe(true)
        expect(axios.defaults.headers.common['X-Requested-With']).toBe('XMLHttpRequest')
    })

    it('fetchChannelMessages hits the channel messages endpoint with a cursor', async () => {
        mockedAxios.get.mockResolvedValue({ data: { data: [], has_more: false, next_cursor: null } })

        await fetchChannelMessages('chan-1', 'msg-9')

        expect(mockedAxios.get).toHaveBeenCalledWith('/api/channels/chan-1/messages', {
            params: { before: 'msg-9' },
        })
    })

    it('fetchConversationMessages hits the conversation messages endpoint', async () => {
        mockedAxios.get.mockResolvedValue({ data: { data: [], has_more: false, next_cursor: null } })

        await fetchConversationMessages('conv-1')

        expect(mockedAxios.get).toHaveBeenCalledWith('/api/conversations/conv-1/messages', {
            params: { before: undefined },
        })
    })

    it('sendChannelMessage posts the payload and returns the created message', async () => {
        const message = { id: 'msg-1', content: 'hi' }
        mockedAxios.post.mockResolvedValue({ data: message })

        const result = await sendChannelMessage('chan-1', { content: 'hi' })

        expect(mockedAxios.post).toHaveBeenCalledWith('/api/channels/chan-1/messages', { content: 'hi' })
        expect(result).toEqual(message)
    })

    it('sendConversationMessage posts to the conversation endpoint', async () => {
        mockedAxios.post.mockResolvedValue({ data: { id: 'msg-1' } })

        await sendConversationMessage('conv-1', { content: 'hey' })

        expect(mockedAxios.post).toHaveBeenCalledWith('/api/conversations/conv-1/messages', { content: 'hey' })
    })

    it('editMessage patches the message content', async () => {
        mockedAxios.patch.mockResolvedValue({ data: { id: 'msg-1', content: 'edited' } })

        await editMessage('msg-1', 'edited')

        expect(mockedAxios.patch).toHaveBeenCalledWith('/api/messages/msg-1', { content: 'edited' })
    })

    it('deleteMessage deletes by id', async () => {
        mockedAxios.delete.mockResolvedValue({ data: { deleted: true } })

        await deleteMessage('msg-1')

        expect(mockedAxios.delete).toHaveBeenCalledWith('/api/messages/msg-1')
    })

    it('focusChannel posts to the focus endpoint', async () => {
        mockedAxios.post.mockResolvedValue({ data: { focused: true } })

        await focusChannel('chan-1')

        expect(mockedAxios.post).toHaveBeenCalledWith('/api/channels/chan-1/focus')
    })

    it('blurChannel posts to the blur endpoint', async () => {
        mockedAxios.post.mockResolvedValue({ data: { focused: false } })

        await blurChannel('chan-1')

        expect(mockedAxios.post).toHaveBeenCalledWith('/api/channels/chan-1/blur')
    })

    it('addReaction posts the emoji', async () => {
        mockedAxios.post.mockResolvedValue({ data: [] })

        await addReaction('msg-1', '👍')

        expect(mockedAxios.post).toHaveBeenCalledWith('/api/messages/msg-1/reactions', { emoji: '👍' })
    })

    it('removeReaction URL-encodes the emoji', async () => {
        mockedAxios.delete.mockResolvedValue({ data: [] })

        await removeReaction('msg-1', '👍')

        expect(mockedAxios.delete).toHaveBeenCalledWith(
            `/api/messages/msg-1/reactions/${encodeURIComponent('👍')}`
        )
    })

    it('uploadFile sends a multipart form with the file', async () => {
        mockedAxios.post.mockResolvedValue({ data: { id: 'att-1' } })
        const file = new File(['content'], 'photo.png', { type: 'image/png' })

        await uploadFile(file)

        expect(mockedAxios.post).toHaveBeenCalledWith(
            '/api/upload',
            expect.any(FormData),
            { headers: { 'Content-Type': 'multipart/form-data' } }
        )
        const form = mockedAxios.post.mock.calls[0][1] as FormData
        expect(form.get('file')).toBe(file)
    })

    it('fetchNotifications hits the notifications endpoint', async () => {
        mockedAxios.get.mockResolvedValue({ data: [] })

        await fetchNotifications()

        expect(mockedAxios.get).toHaveBeenCalledWith('/api/notifications')
    })

    it('markNotificationRead posts to the read endpoint', async () => {
        mockedAxios.post.mockResolvedValue({ data: { id: 'notif-1' } })

        await markNotificationRead('notif-1')

        expect(mockedAxios.post).toHaveBeenCalledWith('/api/notifications/notif-1/read')
    })

    it('markAllNotificationsRead posts to the read-all endpoint', async () => {
        mockedAxios.post.mockResolvedValue({ data: {} })

        await markAllNotificationsRead()

        expect(mockedAxios.post).toHaveBeenCalledWith('/api/notifications/read-all')
    })

    it('fetchNotificationPreferences hits the preferences endpoint', async () => {
        mockedAxios.get.mockResolvedValue({ data: [] })

        await fetchNotificationPreferences()

        expect(mockedAxios.get).toHaveBeenCalledWith('/api/notification-preferences')
    })

    it('updateNotificationPreference puts the category/email/in_app payload', async () => {
        const preference = { category: 'direct_message' as const, email: true, in_app: false }
        mockedAxios.put.mockResolvedValue({ data: preference })

        await updateNotificationPreference(preference)

        expect(mockedAxios.put).toHaveBeenCalledWith('/api/notification-preferences', preference)
    })

    it('fetchThemePreference hits the theme-preference endpoint', async () => {
        mockedAxios.get.mockResolvedValue({ data: { preset: 'classic', overrides: {} } })

        await fetchThemePreference()

        expect(mockedAxios.get).toHaveBeenCalledWith('/api/theme-preference')
    })

    it('updateThemePreference puts the preset/overrides payload', async () => {
        const preference = { preset: 'midnight', overrides: { '--color-brand': '1 2 3' } }
        mockedAxios.put.mockResolvedValue({ data: preference })

        await updateThemePreference(preference)

        expect(mockedAxios.put).toHaveBeenCalledWith('/api/theme-preference', preference)
    })

    it('fetchConversationCandidates hits the candidates endpoint with a query', async () => {
        mockedAxios.get.mockResolvedValue({ data: [] })

        await fetchConversationCandidates('bob')

        expect(mockedAxios.get).toHaveBeenCalledWith('/api/conversations/candidates', {
            params: { q: 'bob' },
        })
    })

    it('resolveConversation hits the resolve endpoint with user_ids', async () => {
        mockedAxios.get.mockResolvedValue({ data: { type: 'dm', existing: null } })

        await resolveConversation(['user-2'])

        expect(mockedAxios.get).toHaveBeenCalledWith('/api/conversations/resolve', {
            params: { user_ids: ['user-2'] },
        })
    })

    it('startConversation posts the payload and returns the conversation and message', async () => {
        const result = { conversation: { id: 'conv-1' }, message: { id: 'msg-1' } }
        mockedAxios.post.mockResolvedValue({ data: result })

        const payload = { user_ids: ['user-2'], content: 'hi' }
        const response = await startConversation(payload)

        expect(mockedAxios.post).toHaveBeenCalledWith('/api/conversations', payload)
        expect(response).toEqual(result)
    })

    it('addConversationParticipants posts the new user_ids', async () => {
        mockedAxios.post.mockResolvedValue({ data: { id: 'conv-1' } })

        await addConversationParticipants('conv-1', ['user-4'])

        expect(mockedAxios.post).toHaveBeenCalledWith('/api/conversations/conv-1/participants', {
            user_ids: ['user-4'],
        })
    })
})
