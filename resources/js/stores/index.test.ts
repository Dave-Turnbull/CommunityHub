import { beforeEach, describe, expect, it } from 'vitest'
import { MAX_WINDOW_MESSAGES, useChannels, useConnectionQuality, useMessages, useMicSensitivity, useNotifications, usePresence, useRemoteStreamVersion, useSpeaking, useUI, useVoice, useVoiceRoster, useVoiceVolume } from '@/stores'
import type { AppNotification, Channel, Message, PaginatedMessages, VoiceParticipant } from '@/types'

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

const makePage = (messages: Message[], overrides: Partial<PaginatedMessages> = {}): PaginatedMessages => ({
    data: messages,
    has_older: false,
    older_cursor: null,
    has_newer: false,
    newer_cursor: null,
    ...overrides,
})

// A contiguous stretch of messages with ids '<from>'..'<from+count-1>', in
// chronological order — enough of them to push a window past its cap.
const run = (from: number, count: number): Message[] =>
    Array.from({ length: count }, (_, i) =>
        makeMessage({
            id: String(from + i),
            created_at: `2026-01-01T00:00:${String(from + i).padStart(2, '0')}Z`,
        })
    )

describe('useMessages', () => {
    beforeEach(() => {
        useMessages.setState({ messages: {}, windows: {}, typing: {} })
    })

    it('setWindow seeds a scope and its window flags', () => {
        const msg = makeMessage()
        useMessages.getState().setWindow('scope-1', makePage([msg], { has_older: true, older_cursor: 'msg-1' }))

        expect(useMessages.getState().messages['scope-1']).toEqual([msg])
        expect(useMessages.getState().windows['scope-1']).toEqual({
            hasOlder: true,
            olderCursor: 'msg-1',
            hasNewer: false,
            newerCursor: null,
        })
    })

    it('add appends a message to a scope', () => {
        useMessages.getState().setWindow('scope-1', makePage([makeMessage({ id: 'msg-1' })]))
        useMessages.getState().add('scope-1', makeMessage({ id: 'msg-2' }))

        expect(useMessages.getState().messages['scope-1'].map((m) => m.id)).toEqual(['msg-1', 'msg-2'])
    })

    it('add guards against duplicate ids', () => {
        const msg = makeMessage({ id: 'msg-1' })
        useMessages.getState().setWindow('scope-1', makePage([msg]))
        useMessages.getState().add('scope-1', msg)

        expect(useMessages.getState().messages['scope-1']).toHaveLength(1)
    })

    it('add ignores a live message while the window is detached from the tail', () => {
        useMessages.getState().setWindow(
            'scope-1',
            makePage([makeMessage({ id: 'msg-1' })], { has_newer: true, newer_cursor: 'msg-1' })
        )
        useMessages.getState().add('scope-1', makeMessage({ id: 'msg-2' }))

        expect(useMessages.getState().messages['scope-1'].map((m) => m.id)).toEqual(['msg-1'])
    })

    it('prependOlder adds older messages before existing ones and takes their window flags', () => {
        useMessages.getState().setWindow(
            'scope-1',
            makePage([makeMessage({ id: 'new' })], { has_older: true, older_cursor: 'new' })
        )
        useMessages.getState().prependOlder(
            'scope-1',
            makePage([makeMessage({ id: 'old' })], { has_older: true, older_cursor: 'old' })
        )

        expect(useMessages.getState().messages['scope-1'].map((m) => m.id)).toEqual(['old', 'new'])
        expect(useMessages.getState().windows['scope-1'].olderCursor).toBe('old')
        expect(useMessages.getState().windows['scope-1'].hasNewer).toBe(false)
    })

    it('prependOlder past the window cap drops the newest rows and records them as re-fetchable', () => {
        useMessages.getState().setWindow('scope-1', makePage(run(100, 100), { has_older: true, older_cursor: '100' }))
        useMessages.getState().prependOlder('scope-1', makePage(run(0, 100), { has_older: true, older_cursor: '0' }))

        const { messages, windows } = useMessages.getState()

        expect(messages['scope-1']).toHaveLength(MAX_WINDOW_MESSAGES)
        expect(messages['scope-1'][0].id).toBe('0')
        expect(messages['scope-1'][MAX_WINDOW_MESSAGES - 1].id).toBe(String(MAX_WINDOW_MESSAGES - 1))
        expect(windows['scope-1'].hasNewer).toBe(true)
        expect(windows['scope-1'].newerCursor).toBe(String(MAX_WINDOW_MESSAGES - 1))
    })

    it('appendNewer past the window cap drops the oldest rows instead', () => {
        useMessages.getState().setWindow(
            'scope-1',
            makePage(run(0, 100), { has_newer: true, newer_cursor: '99' })
        )
        useMessages.getState().appendNewer('scope-1', makePage(run(100, 100)))

        const { messages, windows } = useMessages.getState()

        expect(messages['scope-1']).toHaveLength(MAX_WINDOW_MESSAGES)
        expect(messages['scope-1'][0].id).toBe(String(200 - MAX_WINDOW_MESSAGES))
        expect(messages['scope-1'][MAX_WINDOW_MESSAGES - 1].id).toBe('199')
        expect(windows['scope-1'].hasOlder).toBe(true)
        expect(windows['scope-1'].olderCursor).toBe(String(200 - MAX_WINDOW_MESSAGES))
        expect(windows['scope-1'].hasNewer).toBe(false)
    })

    it('a page that fits leaves both ends of the window alone', () => {
        useMessages.getState().setWindow('scope-1', makePage(run(50, 50), { has_older: true, older_cursor: '50' }))
        useMessages.getState().prependOlder('scope-1', makePage(run(0, 50)))

        expect(useMessages.getState().messages['scope-1']).toHaveLength(100)
        expect(useMessages.getState().windows['scope-1']).toEqual({
            hasOlder: false,
            olderCursor: null,
            hasNewer: false,
            newerCursor: null,
        })
    })

    it('a page overlapping the window is not duplicated', () => {
        useMessages.getState().setWindow('scope-1', makePage(run(5, 5), { has_older: true, older_cursor: '5' }))
        useMessages.getState().prependOlder('scope-1', makePage(run(0, 7)))

        expect(useMessages.getState().messages['scope-1'].map((m) => m.id))
            .toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])
    })

    it('insert puts a message back in chronological order rather than at the end', () => {
        useMessages.getState().setWindow('scope-1', makePage(run(0, 3)))
        useMessages.getState().remove('scope-1', '1')
        useMessages.getState().insert('scope-1', run(1, 1)[0])

        expect(useMessages.getState().messages['scope-1'].map((m) => m.id)).toEqual(['0', '1', '2'])
    })

    it('update replaces a message by id', () => {
        useMessages.getState().setWindow('scope-1', makePage([makeMessage({ id: 'msg-1', content: 'original' })]))
        useMessages.getState().update('scope-1', makeMessage({ id: 'msg-1', content: 'edited' }))

        expect(useMessages.getState().messages['scope-1'][0].content).toBe('edited')
    })

    it('remove deletes a message by id', () => {
        useMessages.getState().setWindow('scope-1', makePage([
            makeMessage({ id: 'msg-1' }),
            makeMessage({ id: 'msg-2' }),
        ]))
        useMessages.getState().remove('scope-1', 'msg-1')

        expect(useMessages.getState().messages['scope-1'].map((m) => m.id)).toEqual(['msg-2'])
    })

    it('setReactions attaches reactions to the matching message only', () => {
        useMessages.getState().setWindow('scope-1', makePage([
            makeMessage({ id: 'msg-1' }),
            makeMessage({ id: 'msg-2' }),
        ]))
        useMessages.getState().setReactions('scope-1', 'msg-1', [{ emoji: '👍', count: 1, reacted: true }])

        const [m1, m2] = useMessages.getState().messages['scope-1']
        expect(m1.reactions).toEqual([{ emoji: '👍', count: 1, reacted: true }])
        expect(m2.reactions).toBeUndefined()
    })

    it('keeps scopes independent so channels and DMs do not clobber each other', () => {
        useMessages.getState().setWindow('channel-1', makePage([makeMessage({ id: 'a' })]))
        useMessages.getState().setWindow('conversation-1', makePage([makeMessage({ id: 'b' })]))

        expect(useMessages.getState().messages['channel-1'].map((m) => m.id)).toEqual(['a'])
        expect(useMessages.getState().messages['conversation-1'].map((m) => m.id)).toEqual(['b'])
    })
})

describe('usePresence', () => {
    beforeEach(() => {
        usePresence.setState({ statuses: {} })
    })

    it('setPresence records a full presence entry for a user', () => {
        usePresence.getState().setPresence('user-1', { status: 'custom', customStatus: 'Busy', customStatusColor: '#ff00aa' })

        expect(usePresence.getState().statuses['user-1']).toEqual({
            status: 'custom', customStatus: 'Busy', customStatusColor: '#ff00aa',
        })
    })

    it('a later setPresence call replaces the entire entry for a user', () => {
        usePresence.getState().setPresence('user-1', { status: 'custom', customStatus: 'Busy', customStatusColor: '#ff00aa' })
        usePresence.getState().setPresence('user-1', { status: 'dnd', customStatus: null, customStatusColor: null })

        expect(usePresence.getState().statuses['user-1']).toEqual({
            status: 'dnd', customStatus: null, customStatusColor: null,
        })
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

    it('setDeafened updates its own field independently of selfMuted', () => {
        useVoice.getState().setDeafened(true)

        expect(useVoice.getState().deafened).toBe(true)
        expect(useVoice.getState().selfMuted).toBe(false)
    })

    it('reset clears scope, self participant, mute, deafen, and connection state', () => {
        useVoice.getState().setScope('conversation', 'conv-1', makeParticipant({ userId: 'me' }))
        useVoice.getState().setSelfMuted(true)
        useVoice.getState().setDeafened(true)
        useVoice.getState().setConnectionState('connected')

        useVoice.getState().reset()

        expect(useVoice.getState()).toMatchObject({
            scopeType: null,
            selfParticipant: null,
            scopeId: null,
            selfMuted: false,
            deafened: false,
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

describe('useSpeaking', () => {
    beforeEach(() => {
        useSpeaking.setState({ speaking: {} })
    })

    it('defaults to not speaking for an unknown user', () => {
        expect(useSpeaking.getState().speaking['user-2']).toBeUndefined()
    })

    it('setSpeaking records a user as speaking', () => {
        useSpeaking.getState().setSpeaking('user-2', true)

        expect(useSpeaking.getState().speaking['user-2']).toBe(true)
    })

    it('setSpeaking does not affect other users', () => {
        useSpeaking.getState().setSpeaking('user-2', true)
        useSpeaking.getState().setSpeaking('user-3', true)

        expect(useSpeaking.getState().speaking).toEqual({ 'user-2': true, 'user-3': true })
    })

    it('clear resets every tracked user', () => {
        useSpeaking.getState().setSpeaking('user-2', true)

        useSpeaking.getState().clear()

        expect(useSpeaking.getState().speaking).toEqual({})
    })
})

describe('useVoiceVolume', () => {
    beforeEach(() => {
        useVoiceVolume.setState({ volumes: {} })
    })

    it('has no stored volume for an unknown user (callers default to 1)', () => {
        expect(useVoiceVolume.getState().volumes['user-2']).toBeUndefined()
    })

    it('setVolume records a user\'s volume', () => {
        useVoiceVolume.getState().setVolume('user-2', 0.5)

        expect(useVoiceVolume.getState().volumes['user-2']).toBe(0.5)
    })

    it('setVolume does not affect other users', () => {
        useVoiceVolume.getState().setVolume('user-2', 0.5)
        useVoiceVolume.getState().setVolume('user-3', 0.2)

        expect(useVoiceVolume.getState().volumes).toEqual({ 'user-2': 0.5, 'user-3': 0.2 })
    })
})

describe('useRemoteStreamVersion', () => {
    beforeEach(() => {
        useRemoteStreamVersion.setState({ version: 0 })
    })

    it('bump increments the version', () => {
        useRemoteStreamVersion.getState().bump()
        useRemoteStreamVersion.getState().bump()

        expect(useRemoteStreamVersion.getState().version).toBe(2)
    })
})

describe('useMicSensitivity', () => {
    beforeEach(() => {
        useMicSensitivity.setState({ threshold: 0, closeGap: 0, autoGainControl: false })
    })

    it('defaults to threshold 0, closeGap 0, autoGainControl false', () => {
        expect(useMicSensitivity.getState()).toMatchObject({
            threshold: 0, closeGap: 0, autoGainControl: false,
        })
    })

    it('setThreshold updates only the threshold field', () => {
        useMicSensitivity.getState().setThreshold(40)

        expect(useMicSensitivity.getState().threshold).toBe(40)
        expect(useMicSensitivity.getState().closeGap).toBe(0)
    })

    it('setCloseGap updates only the closeGap field', () => {
        useMicSensitivity.getState().setCloseGap(20)

        expect(useMicSensitivity.getState().closeGap).toBe(20)
        expect(useMicSensitivity.getState().threshold).toBe(0)
    })

    it('setAutoGainControl updates only the autoGainControl field', () => {
        useMicSensitivity.getState().setAutoGainControl(true)

        expect(useMicSensitivity.getState().autoGainControl).toBe(true)
        expect(useMicSensitivity.getState().threshold).toBe(0)
    })
})

describe('useConnectionQuality', () => {
    beforeEach(() => {
        useConnectionQuality.setState({ quality: {} })
    })

    it('has no stored quality for an unknown user', () => {
        expect(useConnectionQuality.getState().quality['user-2']).toBeUndefined()
    })

    it('setQuality records a user\'s quality tier', () => {
        useConnectionQuality.getState().setQuality('user-2', 'good')

        expect(useConnectionQuality.getState().quality['user-2']).toBe('good')
    })

    it('setQuality does not affect other users', () => {
        useConnectionQuality.getState().setQuality('user-2', 'good')
        useConnectionQuality.getState().setQuality('user-3', 'poor')

        expect(useConnectionQuality.getState().quality).toEqual({ 'user-2': 'good', 'user-3': 'poor' })
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
