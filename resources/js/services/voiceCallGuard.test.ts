import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useVoice } from '@/stores'

const announceVoiceJoin = vi.fn()
let capturedListener: ((scopeType: string, scopeId: string) => void) | null = null
const subscribeVoiceCallGuard = vi.fn((_userId: string, onOtherTabJoined: (scopeType: string, scopeId: string) => void) => {
    capturedListener = onOtherTabJoined
    return vi.fn()
})

vi.mock('@/services/echo', () => ({
    announceVoiceJoin: (...args: unknown[]) => announceVoiceJoin(...args),
    subscribeVoiceCallGuard: (...args: [string, (scopeType: string, scopeId: string) => void]) => subscribeVoiceCallGuard(...args),
}))

describe('voiceCallGuard', () => {
    beforeEach(() => {
        useVoice.getState().reset()
        capturedListener = null
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    it('announceJoin whispers the join over the per-user channel', async () => {
        const { announceJoin } = await import('@/services/voiceCallGuard')

        announceJoin('user-1', 'channel', 'chan-1')

        expect(announceVoiceJoin).toHaveBeenCalledWith('user-1', 'channel', 'chan-1')
    })

    it('leaves the current call when another tab announces a different scope', async () => {
        const { guardAgainstOtherTabsJoining } = await import('@/services/voiceCallGuard')
        useVoice.getState().setScope('channel', 'chan-1', { userId: 'user-1', displayName: 'Me', avatarUrl: null, muted: false })
        const leaveCurrentCall = vi.fn()

        guardAgainstOtherTabsJoining('user-1', leaveCurrentCall)
        capturedListener?.('channel', 'chan-2')

        expect(leaveCurrentCall).toHaveBeenCalled()
    })

    it('does not leave when the announced scope matches the current one', async () => {
        const { guardAgainstOtherTabsJoining } = await import('@/services/voiceCallGuard')
        useVoice.getState().setScope('channel', 'chan-1', { userId: 'user-1', displayName: 'Me', avatarUrl: null, muted: false })
        const leaveCurrentCall = vi.fn()

        guardAgainstOtherTabsJoining('user-1', leaveCurrentCall)
        capturedListener?.('channel', 'chan-1')

        expect(leaveCurrentCall).not.toHaveBeenCalled()
    })

    it('does not leave when this tab has no active call', async () => {
        const { guardAgainstOtherTabsJoining } = await import('@/services/voiceCallGuard')
        const leaveCurrentCall = vi.fn()

        guardAgainstOtherTabsJoining('user-1', leaveCurrentCall)
        capturedListener?.('channel', 'chan-2')

        expect(leaveCurrentCall).not.toHaveBeenCalled()
    })

    it('subscribes via subscribeVoiceCallGuard with the given userId', async () => {
        const { guardAgainstOtherTabsJoining } = await import('@/services/voiceCallGuard')

        guardAgainstOtherTabsJoining('user-1', vi.fn())

        expect(subscribeVoiceCallGuard).toHaveBeenCalledWith('user-1', expect.any(Function))
    })
})
