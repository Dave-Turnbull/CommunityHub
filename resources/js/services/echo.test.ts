import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useMessages, useNotifications, usePresence } from '@/stores'

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
}

const channel = {
    listen: vi.fn((event: string, cb: (event: unknown) => void) => {
        listeners[event] = cb
        return channel
    }),
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
        useMessages.setState({ messages: {}, typing: {} })
        usePresence.setState({ statuses: {} })
        useNotifications.setState({ notifications: [] })
        for (const key of Object.keys(listeners)) delete listeners[key]
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
        useMessages.getState().setMessages('chan-1', [{ id: 'msg-1' } as never])
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
        hereCallbacks[0]([{ user_id: 'user-1', status: 'online' }])
        joiningCallbacks[0]({ user_id: 'user-2' })
        leavingCallbacks[0]({ user_id: 'user-2' })

        expect(usePresence.getState().statuses['user-1']).toBe('online')
        expect(usePresence.getState().statuses['user-2']).toBe('offline')
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
})
