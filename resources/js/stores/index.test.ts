import { beforeEach, describe, expect, it } from 'vitest'
import { useChannels, useMessages, useNotifications, usePresence, useUI, useVoice, useVoiceRoster } from '@/stores'
import type { AppNotification, Channel, Message, VoiceParticipant } from '@/types'

const makeMessage = (overrides: Partial<Message> = {}): Message => ({
    id: 'msg-1',
    channel_id: 'channel-1',
    conversation_id: null,
    author_id: 'user-1',
    content: 'hello',
    type: 'text',
    is_edited: false,
    is_pinned: false,
    reply_to_id: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
})

describe('useMessages', () => {
    beforeEach(() => {
        useMessages.setState({ messages: {}, typing: {} })
    })

    it('setMessages seeds a scope', () => {
        const msg = makeMessage()
        useMessages.getState().setMessages('scope-1', [msg])

        expect(useMessages.getState().messages['scope-1']).toEqual([msg])
    })

    it('add appends a message to a scope', () => {
        useMessages.getState().setMessages('scope-1', [makeMessage({ id: 'msg-1' })])
        useMessages.getState().add('scope-1', makeMessage({ id: 'msg-2' }))

        expect(useMessages.getState().messages['scope-1'].map((m) => m.id)).toEqual(['msg-1', 'msg-2'])
    })

    it('add guards against duplicate ids', () => {
        const msg = makeMessage({ id: 'msg-1' })
        useMessages.getState().setMessages('scope-1', [msg])
        useMessages.getState().add('scope-1', msg)

        expect(useMessages.getState().messages['scope-1']).toHaveLength(1)
    })

    it('prepend adds older messages before existing ones', () => {
        useMessages.getState().setMessages('scope-1', [makeMessage({ id: 'new' })])
        useMessages.getState().prepend('scope-1', [makeMessage({ id: 'old' })])

        expect(useMessages.getState().messages['scope-1'].map((m) => m.id)).toEqual(['old', 'new'])
    })

    it('update replaces a message by id', () => {
        useMessages.getState().setMessages('scope-1', [makeMessage({ id: 'msg-1', content: 'original' })])
        useMessages.getState().update('scope-1', makeMessage({ id: 'msg-1', content: 'edited' }))

        expect(useMessages.getState().messages['scope-1'][0].content).toBe('edited')
    })

    it('remove deletes a message by id', () => {
        useMessages.getState().setMessages('scope-1', [
            makeMessage({ id: 'msg-1' }),
            makeMessage({ id: 'msg-2' }),
        ])
        useMessages.getState().remove('scope-1', 'msg-1')

        expect(useMessages.getState().messages['scope-1'].map((m) => m.id)).toEqual(['msg-2'])
    })

    it('setReactions attaches reactions to the matching message only', () => {
        useMessages.getState().setMessages('scope-1', [
            makeMessage({ id: 'msg-1' }),
            makeMessage({ id: 'msg-2' }),
        ])
        useMessages.getState().setReactions('scope-1', 'msg-1', [{ emoji: '👍', count: 1, reacted: true }])

        const [m1, m2] = useMessages.getState().messages['scope-1']
        expect(m1.reactions).toEqual([{ emoji: '👍', count: 1, reacted: true }])
        expect(m2.reactions).toBeUndefined()
    })

    it('keeps scopes independent so channels and DMs do not clobber each other', () => {
        useMessages.getState().setMessages('channel-1', [makeMessage({ id: 'a' })])
        useMessages.getState().setMessages('conversation-1', [makeMessage({ id: 'b' })])

        expect(useMessages.getState().messages['channel-1'].map((m) => m.id)).toEqual(['a'])
        expect(useMessages.getState().messages['conversation-1'].map((m) => m.id)).toEqual(['b'])
    })
})

describe('usePresence', () => {
    beforeEach(() => {
        usePresence.setState({ statuses: {} })
    })

    it('setStatus records a user status', () => {
        usePresence.getState().setStatus('user-1', 'online')

        expect(usePresence.getState().statuses['user-1']).toBe('online')
    })
})

describe('useUI', () => {
    it('toggleMemberList flips the boolean', () => {
        useUI.setState({ memberListOpen: true })
        useUI.getState().toggleMemberList()

        expect(useUI.getState().memberListOpen).toBe(false)
    })
})

const makeNotification = (overrides: Partial<Pick<AppNotification, 'id' | 'read_at'>> = {}): AppNotification => ({
    id: 'notif-1',
    user_id: 'user-1',
    type: 'direct_message',
    data: {
        conversation_id: 'conv-1',
        message_id: 'msg-1',
        sender_id: 'user-2',
        sender_name: 'Bob',
        preview: 'hey there',
    },
    read_at: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
})

describe('useNotifications', () => {
    beforeEach(() => {
        useNotifications.setState({ notifications: [] })
    })

    it('setNotifications seeds the list', () => {
        const n = makeNotification()
        useNotifications.getState().setNotifications([n])

        expect(useNotifications.getState().notifications).toEqual([n])
    })

    it('add prepends a notification', () => {
        useNotifications.getState().setNotifications([makeNotification({ id: 'notif-1' })])
        useNotifications.getState().add(makeNotification({ id: 'notif-2' }))

        expect(useNotifications.getState().notifications.map((n) => n.id)).toEqual(['notif-2', 'notif-1'])
    })

    it('add guards against duplicate ids', () => {
        const n = makeNotification()
        useNotifications.getState().setNotifications([n])
        useNotifications.getState().add(n)

        expect(useNotifications.getState().notifications).toHaveLength(1)
    })

    it('markRead sets read_at on the matching notification only', () => {
        useNotifications.getState().setNotifications([
            makeNotification({ id: 'notif-1' }),
            makeNotification({ id: 'notif-2' }),
        ])
        useNotifications.getState().markRead('notif-1')

        const [n1, n2] = useNotifications.getState().notifications
        expect(n1.read_at).not.toBeNull()
        expect(n2.read_at).toBeNull()
    })

    it('markAllRead sets read_at on every notification', () => {
        useNotifications.getState().setNotifications([
            makeNotification({ id: 'notif-1' }),
            makeNotification({ id: 'notif-2' }),
        ])
        useNotifications.getState().markAllRead()

        expect(useNotifications.getState().notifications.every((n) => n.read_at !== null)).toBe(true)
    })
})

const makeParticipant = (overrides: Partial<VoiceParticipant> = {}): VoiceParticipant => ({
    userId: 'user-2',
    displayName: 'Bob',
    avatarUrl: null,
    muted: false,
    ...overrides,
})

describe('useVoice', () => {
    beforeEach(() => {
        useVoice.getState().reset()
    })

    it('setScope records the active channel/conversation and self participant', () => {
        useVoice.getState().setScope('channel', 'chan-1', makeParticipant({ userId: 'me' }))

        expect(useVoice.getState().scopeType).toBe('channel')
        expect(useVoice.getState().scopeId).toBe('chan-1')
        expect(useVoice.getState().selfParticipant).toEqual(makeParticipant({ userId: 'me' }))
    })

    it('setSelfMuted and setConnectionState update their own fields', () => {
        useVoice.getState().setSelfMuted(true)
        useVoice.getState().setConnectionState('connected')

        expect(useVoice.getState().selfMuted).toBe(true)
        expect(useVoice.getState().connectionState).toBe('connected')
    })

    it('reset clears scope, self participant, mute, and connection state', () => {
        useVoice.getState().setScope('conversation', 'conv-1', makeParticipant({ userId: 'me' }))
        useVoice.getState().setSelfMuted(true)
        useVoice.getState().setConnectionState('connected')

        useVoice.getState().reset()

        expect(useVoice.getState()).toMatchObject({
            scopeType: null,
            selfParticipant: null,
            scopeId: null,
            selfMuted: false,
            connectionState: 'idle',
        })
    })
})

describe('useVoiceRoster', () => {
    beforeEach(() => {
        useVoiceRoster.setState({ rosters: {} })
    })

    it('setRoster seeds the participant list for a scope key', () => {
        useVoiceRoster.getState().setRoster('channel.chan-1', [makeParticipant({ userId: 'user-2' })])

        expect(useVoiceRoster.getState().rosters['channel.chan-1']).toEqual([makeParticipant({ userId: 'user-2' })])
    })

    it('upsertParticipant adds a new participant without touching other scopes', () => {
        useVoiceRoster.getState().setRoster('conversation.conv-1', [makeParticipant({ userId: 'user-9' })])
        useVoiceRoster.getState().upsertParticipant('channel.chan-1', makeParticipant({ userId: 'user-2' }))

        expect(useVoiceRoster.getState().rosters['channel.chan-1']).toEqual([makeParticipant({ userId: 'user-2' })])
        expect(useVoiceRoster.getState().rosters['conversation.conv-1']).toEqual([makeParticipant({ userId: 'user-9' })])
    })

    it('upsertParticipant replaces an existing entry for the same userId rather than duplicating', () => {
        useVoiceRoster.getState().setRoster('channel.chan-1', [makeParticipant({ userId: 'user-2', displayName: 'Bob' })])
        useVoiceRoster.getState().upsertParticipant('channel.chan-1', makeParticipant({ userId: 'user-2', displayName: 'Bobby' }))

        expect(useVoiceRoster.getState().rosters['channel.chan-1']).toEqual([
            makeParticipant({ userId: 'user-2', displayName: 'Bobby' }),
        ])
    })

    it('removeParticipant deletes only the matching participant', () => {
        useVoiceRoster.getState().setRoster('channel.chan-1', [
            makeParticipant({ userId: 'user-2' }),
            makeParticipant({ userId: 'user-3' }),
        ])
        useVoiceRoster.getState().removeParticipant('channel.chan-1', 'user-2')

        expect(useVoiceRoster.getState().rosters['channel.chan-1']).toEqual([makeParticipant({ userId: 'user-3' })])
    })

    it('setParticipantMuted updates only the matching participant', () => {
        useVoiceRoster.getState().setRoster('channel.chan-1', [makeParticipant({ userId: 'user-2', muted: false })])
        useVoiceRoster.getState().setParticipantMuted('channel.chan-1', 'user-2', true)

        expect(useVoiceRoster.getState().rosters['channel.chan-1'][0].muted).toBe(true)
    })

    it('clearRoster removes the scope entirely', () => {
        useVoiceRoster.getState().setRoster('channel.chan-1', [makeParticipant()])
        useVoiceRoster.getState().clearRoster('channel.chan-1')

        expect(useVoiceRoster.getState().rosters['channel.chan-1']).toBeUndefined()
    })
})

const makeChannel = (overrides: Partial<Channel> = {}): Channel => ({
    id: 'chan-1', room_id: 'room-1', name: 'general', type: 'text', topic: null, position: 0,
    voice_mode: 'auto', settings: null, ...overrides,
})

describe('useChannels', () => {
    beforeEach(() => {
        useChannels.setState({ channels: {} })
    })

    it('setChannels seeds the channel list for a room', () => {
        useChannels.getState().setChannels('room-1', [makeChannel()])

        expect(useChannels.getState().channels['room-1']).toEqual([makeChannel()])
    })

    it('addChannel appends without touching other rooms', () => {
        useChannels.getState().setChannels('room-9', [makeChannel({ id: 'other-room-chan' })])
        useChannels.getState().addChannel('room-1', makeChannel({ id: 'chan-2' }))

        expect(useChannels.getState().channels['room-1']).toEqual([makeChannel({ id: 'chan-2' })])
        expect(useChannels.getState().channels['room-9']).toEqual([makeChannel({ id: 'other-room-chan' })])
    })

    it('addChannel is a no-op if the id already exists (dup-guard, matches useMessages.add)', () => {
        useChannels.getState().setChannels('room-1', [makeChannel({ id: 'chan-1' })])
        useChannels.getState().addChannel('room-1', makeChannel({ id: 'chan-1', name: 'renamed' }))

        expect(useChannels.getState().channels['room-1']).toEqual([makeChannel({ id: 'chan-1' })])
    })

    it('updateChannel replaces the matching channel in place', () => {
        useChannels.getState().setChannels('room-1', [makeChannel({ id: 'chan-1', name: 'old' })])
        useChannels.getState().updateChannel('room-1', makeChannel({ id: 'chan-1', name: 'new' }))

        expect(useChannels.getState().channels['room-1']).toEqual([makeChannel({ id: 'chan-1', name: 'new' })])
    })

    it('removeChannel deletes only the matching channel', () => {
        useChannels.getState().setChannels('room-1', [
            makeChannel({ id: 'chan-1' }),
            makeChannel({ id: 'chan-2' }),
        ])
        useChannels.getState().removeChannel('room-1', 'chan-1')

        expect(useChannels.getState().channels['room-1']).toEqual([makeChannel({ id: 'chan-2' })])
    })
})
