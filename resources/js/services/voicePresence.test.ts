import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useVoice, useVoiceRoster } from '@/stores'
import { subscribeVoiceRoster } from '@/services/voicePresence'
import * as echo from '@/services/echo'

// voicePresence.ts keeps its ref-counted subscriptions Map at module scope,
// shared across every test in this file (no vi.resetModules() — that would
// give the module a fresh, disconnected @/stores instance, decoupling it
// from the useVoiceRoster/useVoice references this file imports statically).
// Each test uses its own channel id instead, so no test's leaked subscription
// state (most don't call every leave() needed to hit ref count zero) can
// affect another test's assertions.
let counter = 0
function uniqueChannelId(): string {
    counter += 1
    return `chan-${counter}`
}

const joiningCallbacks: ((member: unknown) => void)[] = []
const leavingCallbacks: ((member: unknown) => void)[] = []
const whisperListeners: Record<string, (payload: unknown) => void> = {}
const whisper = vi.fn()
const leave = vi.fn()

const presenceChannel = {
    joining: vi.fn((cb) => { joiningCallbacks.push(cb); return presenceChannel }),
    leaving: vi.fn((cb) => { leavingCallbacks.push(cb); return presenceChannel }),
    listenForWhisper: vi.fn((event: string, cb: (payload: unknown) => void) => {
        whisperListeners[event] = cb
        return presenceChannel
    }),
    whisper,
}

vi.mock('@/services/echo', () => ({
    joinVoiceChannel: vi.fn(() => ({ channel: presenceChannel, leave })),
}))

describe('voicePresence', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        joiningCallbacks.length = 0
        leavingCallbacks.length = 0
        for (const key of Object.keys(whisperListeners)) delete whisperListeners[key]
        useVoice.getState().reset()
    })

    it('subscribing twice to the same scope only joins the underlying channel once', () => {
        const id = uniqueChannelId()

        subscribeVoiceRoster('channel', id)
        subscribeVoiceRoster('channel', id)

        expect(echo.joinVoiceChannel).toHaveBeenCalledTimes(1)
    })

    it('a second subscriber gets the same channel object as the first', () => {
        const id = uniqueChannelId()

        const first = subscribeVoiceRoster('channel', id)
        const second = subscribeVoiceRoster('channel', id)

        expect(first.channel).toBe(second.channel)
    })

    it('merely subscribing (observing) does not add anyone to the roster', () => {
        const id = uniqueChannelId()
        subscribeVoiceRoster('channel', id)

        expect(useVoiceRoster.getState().rosters[`channel.${id}`] ?? []).toEqual([])
    })

    it('a new subscriber arriving does not trigger a re-announce if I am not in this call', () => {
        const id = uniqueChannelId()
        subscribeVoiceRoster('channel', id)

        joiningCallbacks[0]({ id: 'user-2', display_name: 'Bob', avatar_url: null })

        expect(whisper).not.toHaveBeenCalled()
    })

    it('a new subscriber arriving triggers a call-state re-announce if I am actually in this call', () => {
        const id = uniqueChannelId()
        useVoice.getState().setScope('channel', id, { userId: 'me', displayName: 'Me', avatarUrl: null, muted: false })
        subscribeVoiceRoster('channel', id)

        joiningCallbacks[0]({ id: 'user-2', display_name: 'Bob', avatar_url: null })

        expect(whisper).toHaveBeenCalledWith('call-state', {
            userId: 'me', displayName: 'Me', avatarUrl: null, muted: false, inCall: true,
        })
    })

    it('does not re-announce for a different scope than the one I am actually in', () => {
        const id = uniqueChannelId()
        const otherId = uniqueChannelId()
        useVoice.getState().setScope('channel', otherId, { userId: 'me', displayName: 'Me', avatarUrl: null, muted: false })
        subscribeVoiceRoster('channel', id)

        joiningCallbacks[0]({ id: 'user-2', display_name: 'Bob', avatar_url: null })

        expect(whisper).not.toHaveBeenCalled()
    })

    it('does not re-announce when the new subscriber is myself', () => {
        const id = uniqueChannelId()
        useVoice.getState().setScope('channel', id, { userId: 'me', displayName: 'Me', avatarUrl: null, muted: false })
        subscribeVoiceRoster('channel', id)

        joiningCallbacks[0]({ id: 'me', display_name: 'Me', avatar_url: null })

        expect(whisper).not.toHaveBeenCalled()
    })

    it('a call-state whisper with inCall:true adds the participant to the roster', () => {
        const id = uniqueChannelId()
        subscribeVoiceRoster('channel', id)

        whisperListeners['call-state']({ userId: 'user-2', displayName: 'Bob', avatarUrl: null, inCall: true })

        expect(useVoiceRoster.getState().rosters[`channel.${id}`]).toEqual([
            { userId: 'user-2', displayName: 'Bob', avatarUrl: null, muted: false },
        ])
    })

    it('a call-state whisper with inCall:false removes the participant from the roster', () => {
        const id = uniqueChannelId()
        subscribeVoiceRoster('channel', id)
        whisperListeners['call-state']({ userId: 'user-2', displayName: 'Bob', avatarUrl: null, inCall: true })

        whisperListeners['call-state']({ userId: 'user-2', inCall: false })

        expect(useVoiceRoster.getState().rosters[`channel.${id}`]).toEqual([])
    })

    it('.leaving() removes a participant from the roster as a disconnect safety net', () => {
        const id = uniqueChannelId()
        subscribeVoiceRoster('channel', id)
        whisperListeners['call-state']({ userId: 'user-2', displayName: 'Bob', avatarUrl: null, inCall: true })

        leavingCallbacks[0]({ id: 'user-2' })

        expect(useVoiceRoster.getState().rosters[`channel.${id}`]).toEqual([])
    })

    it('a mute-state whisper updates the matching roster entry', () => {
        const id = uniqueChannelId()
        subscribeVoiceRoster('channel', id)
        whisperListeners['call-state']({ userId: 'user-2', displayName: 'Bob', avatarUrl: null, inCall: true })

        whisperListeners['mute-state']({ userId: 'user-2', muted: true })

        expect(useVoiceRoster.getState().rosters[`channel.${id}`][0].muted).toBe(true)
    })

    it('leaving does not tear down the underlying subscription while another subscriber remains', () => {
        const id = uniqueChannelId()
        const first = subscribeVoiceRoster('channel', id)
        subscribeVoiceRoster('channel', id)

        first.leave()

        expect(leave).not.toHaveBeenCalled()
    })

    it('the underlying subscription is torn down once the last subscriber leaves', () => {
        const id = uniqueChannelId()
        const first = subscribeVoiceRoster('channel', id)
        const second = subscribeVoiceRoster('channel', id)

        first.leave()
        second.leave()

        expect(leave).toHaveBeenCalledTimes(1)
    })

    it('the roster is cleared once the last subscriber leaves', () => {
        const id = uniqueChannelId()
        const sub = subscribeVoiceRoster('channel', id)
        whisperListeners['call-state']({ userId: 'user-2', displayName: 'Bob', avatarUrl: null, inCall: true })

        sub.leave()

        expect(useVoiceRoster.getState().rosters[`channel.${id}`]).toBeUndefined()
    })

    it('subscribing again after everyone left re-joins the underlying channel', () => {
        const id = uniqueChannelId()
        const sub = subscribeVoiceRoster('channel', id)
        sub.leave()

        subscribeVoiceRoster('channel', id)

        expect(echo.joinVoiceChannel).toHaveBeenCalledTimes(2)
    })

    it('calling leave twice on the same handle only decrements the ref count once', () => {
        const id = uniqueChannelId()
        const first = subscribeVoiceRoster('channel', id)
        subscribeVoiceRoster('channel', id)

        first.leave()
        first.leave()

        expect(leave).not.toHaveBeenCalled()
    })

    it('channel and conversation scopes with the same id are tracked independently', () => {
        const id = uniqueChannelId()

        subscribeVoiceRoster('channel', id)
        subscribeVoiceRoster('conversation', id)

        expect(echo.joinVoiceChannel).toHaveBeenCalledTimes(2)
        expect(echo.joinVoiceChannel).toHaveBeenCalledWith('channel', id)
        expect(echo.joinVoiceChannel).toHaveBeenCalledWith('conversation', id)
    })
})
