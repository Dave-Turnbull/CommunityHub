import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useChannels, useMessages, useNotifications, usePresence } from '@/stores'

const listeners: Record<string, (event: unknown) => void> = {}
const hereCallbacks: ((users: unknown[]) => void)[] = []
const joiningCallbacks: ((user: unknown) => void)[] = []
const leavingCallbacks: ((user: unknown) => void)[] = []

const presenceChannel = {
    here: vi.fn((cb) => {
        hereCallbacks.push(cb)
        return presenceChannel
    }),
    joining: vi.fn((cb) => {
        joiningCallbacks.push(cb)
        return presenceChannel
    }),
    leaving: vi.fn((cb) => {
        leavingCallbacks.push(cb)
        return presenceChannel
    }),
    listen: vi.fn((event: string, cb: (event: unknown) => void) => {
        listeners[event] = cb
        return presenceChannel
    }),
}

const whisperListeners: Record<string, (event: unknown) => void> = {}

const channel = {
    listen: vi.fn((event: string, cb: (event: unknown) => void) => {
        listeners[event] = cb
        return channel
    }),
    whisper: vi.fn(() => channel),
    listenForWhisper: vi.fn((event: string, cb: (event: unknown) => void) => {
        whisperListeners[event] = cb
        return channel
    }),
    stopListeningForWhisper: vi.fn(),
}

const echoInstance = {
    join: vi.fn((name: string) => (name === 'presence.global' ? presenceChannel : channel)),
    private: vi.fn(() => channel),
    leave: vi.fn(),
}

vi.mock('laravel-echo', () => ({
    default: vi.fn().mockImplementation(function () {
        return echoInstance
    }),
}))

vi.mock('pusher-js', () => ({ default: vi.fn() }))

describe('echo service', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        useMessages.setState({ messages: {}, windows: {}, typing: {} })
        usePresence.setState({ statuses: {} })
        useNotifications.setState({ notifications: [] })
        useChannels.setState({ channels: {} })
        for (const key of Object.keys(listeners)) delete listeners[key]
        for (const key of Object.keys(whisperListeners)) delete whisperListeners[key]
        hereCallbacks.length = 0
        joiningCallbacks.length = 0
        leavingCallbacks.length = 0
    })

    it('joins a presence channel for scopeType "channel"', async () => {
        const { subscribe } = await import('@/services/echo')

        subscribe('chan-1', 'channel')

        expect(echoInstance.join).toHaveBeenCalledWith('channel.chan-1')
    })

    it('joins a private channel for scopeType "conversation"', async () => {
        const { subscribe } = await import('@/services/echo')

        subscribe('conv-1', 'conversation')

        expect(echoInstance.private).toHaveBeenCalledWith('conversation.conv-1')
    })

    it('dispatches MessageSent into the message store', async () => {
        const { subscribe } = await import('@/services/echo')
        subscribe('chan-1', 'channel')

        const message = { id: 'msg-1', content: 'hi' }
        listeners['.MessageSent']({ message })

        expect(useMessages.getState().messages['chan-1']).toEqual([message])
    })

    it('dispatches MessageDeleted by removing the message from the store', async () => {
        const { subscribe } = await import('@/services/echo')
        useMessages.getState().setWindow('chan-1', {
            data: [{ id: 'msg-1' } as never],
            has_older: false,
            older_cursor: null,
            has_newer: false,
            newer_cursor: null,
        })
        subscribe('chan-1', 'channel')

        listeners['.MessageDeleted']({ message_id: 'msg-1' })

        expect(useMessages.getState().messages['chan-1']).toEqual([])
    })

    it('returns a cleanup function that leaves the channel', async () => {
        const { subscribe } = await import('@/services/echo')

        const cleanup = subscribe('chan-1', 'channel')
        cleanup()

        expect(echoInstance.leave).toHaveBeenCalledWith('channel.chan-1')
    })

    it('subscribePresence wires here/joining/leaving into the presence store', async () => {
        const { subscribePresence } = await import('@/services/echo')

        subscribePresence()
        hereCallbacks[0]([{ user_id: 'user-1', status: 'online', custom_status: 'Busy', custom_status_color: '#ff00aa' }])
        joiningCallbacks[0]({ user_id: 'user-2', status: 'dnd' })
        leavingCallbacks[0]({ user_id: 'user-2' })

        expect(usePresence.getState().statuses['user-1']).toEqual({
            status: 'online', customStatus: 'Busy', customStatusColor: '#ff00aa',
        })
        expect(usePresence.getState().statuses['user-2']).toEqual({
            status: 'offline', customStatus: null, customStatusColor: null,
        })
    })

    it('honors a joining member\'s actual configured status rather than assuming online', async () => {
        const { subscribePresence } = await import('@/services/echo')

        subscribePresence()
        joiningCallbacks[0]({ user_id: 'user-3', status: 'idle' })

        expect(usePresence.getState().statuses['user-3']).toEqual({
            status: 'idle', customStatus: null, customStatusColor: null,
        })
    })

    it('updates an already-connected member\'s status live on UserStatusChanged, without waiting for a reconnect', async () => {
        const { subscribePresence } = await import('@/services/echo')

        subscribePresence()
        hereCallbacks[0]([{ user_id: 'user-1', status: 'online' }])
        listeners['.UserStatusChanged']({
            user_id: 'user-1', status: 'custom', custom_status: 'Deep in code', custom_status_color: '#112233',
        })

        expect(usePresence.getState().statuses['user-1']).toEqual({
            status: 'custom', customStatus: 'Deep in code', customStatusColor: '#112233',
        })
    })

    it('subscribeNotifications joins the private per-user channel', async () => {
        const { subscribeNotifications } = await import('@/services/echo')

        subscribeNotifications('user-1')

        expect(echoInstance.private).toHaveBeenCalledWith('App.Models.User.user-1')
    })

    it('dispatches NotificationCreated into the notification store', async () => {
        const { subscribeNotifications } = await import('@/services/echo')
        subscribeNotifications('user-1')

        const notification = { id: 'notif-1', user_id: 'user-1' }
        listeners['.NotificationCreated']({ notification })

        expect(useNotifications.getState().notifications).toEqual([notification])
    })

    it('subscribeNotifications returns a cleanup function that leaves the channel', async () => {
        const { subscribeNotifications } = await import('@/services/echo')

        const cleanup = subscribeNotifications('user-1')
        cleanup()

        expect(echoInstance.leave).toHaveBeenCalledWith('App.Models.User.user-1')
    })

    it('subscribeRoomChannels joins the private room channel', async () => {
        const { subscribeRoomChannels } = await import('@/services/echo')

        subscribeRoomChannels('room-1')

        expect(echoInstance.private).toHaveBeenCalledWith('room.room-1')
    })

    it('dispatches ChannelCreated into the channel store', async () => {
        const { subscribeRoomChannels } = await import('@/services/echo')
        subscribeRoomChannels('room-1')

        const newChannel = { id: 'chan-1', name: 'general' }
        listeners['.ChannelCreated']({ channel: newChannel })

        expect(useChannels.getState().channels['room-1']).toEqual([newChannel])
    })

    it('dispatches ChannelUpdated by replacing the channel in the store', async () => {
        const { subscribeRoomChannels } = await import('@/services/echo')
        useChannels.getState().setChannels('room-1', [{ id: 'chan-1', name: 'old' } as never])
        subscribeRoomChannels('room-1')

        listeners['.ChannelUpdated']({ channel: { id: 'chan-1', name: 'new' } })

        expect(useChannels.getState().channels['room-1']).toEqual([{ id: 'chan-1', name: 'new' }])
    })

    it('dispatches ChannelDeleted by removing the channel from the store', async () => {
        const { subscribeRoomChannels } = await import('@/services/echo')
        useChannels.getState().setChannels('room-1', [{ id: 'chan-1', name: 'general' } as never])
        subscribeRoomChannels('room-1')

        listeners['.ChannelDeleted']({ channel_id: 'chan-1' })

        expect(useChannels.getState().channels['room-1']).toEqual([])
    })

    it('subscribeRoomChannels returns a cleanup function that leaves the channel', async () => {
        const { subscribeRoomChannels } = await import('@/services/echo')

        const cleanup = subscribeRoomChannels('room-1')
        cleanup()

        expect(echoInstance.leave).toHaveBeenCalledWith('room.room-1')
    })

    it('announceVoiceJoin whispers voice-join on the per-user private channel', async () => {
        const { announceVoiceJoin } = await import('@/services/echo')

        announceVoiceJoin('user-1', 'channel', 'chan-1')

        expect(echoInstance.private).toHaveBeenCalledWith('App.Models.User.user-1')
        expect(channel.whisper).toHaveBeenCalledWith('voice-join', { scopeType: 'channel', scopeId: 'chan-1' })
    })

    it('subscribeVoiceCallGuard dispatches an incoming voice-join whisper to the callback', async () => {
        const { subscribeVoiceCallGuard } = await import('@/services/echo')
        const onOtherTabJoined = vi.fn()

        subscribeVoiceCallGuard('user-1', onOtherTabJoined)
        whisperListeners['voice-join']({ scopeType: 'channel', scopeId: 'chan-2' })

        expect(onOtherTabJoined).toHaveBeenCalledWith('channel', 'chan-2')
    })

    it('subscribeVoiceCallGuard cleanup removes only its own whisper listener, not the whole channel', async () => {
        const { subscribeVoiceCallGuard } = await import('@/services/echo')

        const cleanup = subscribeVoiceCallGuard('user-1', vi.fn())
        cleanup()

        expect(channel.stopListeningForWhisper).toHaveBeenCalledWith('voice-join', expect.any(Function))
        expect(echoInstance.leave).not.toHaveBeenCalledWith('App.Models.User.user-1')
    })
})
