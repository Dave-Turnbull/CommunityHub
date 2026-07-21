import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useVoiceChannel } from '@/hooks/useVoiceChannel'
import { useVoice } from '@/stores'
import * as api from '@/services/api'
import * as webrtc from '@/services/webrtc'
import type { User } from '@/types'

vi.mock('@/services/clientId', () => ({
    getClientId: vi.fn(() => 'client-1'),
}))

vi.mock('@/services/api', () => ({
    fetchVoiceDevicePreference: vi.fn(),
}))

vi.mock('@/services/webrtc', () => ({
    joinVoice: vi.fn(),
    leaveVoice: vi.fn(),
    setMuted: vi.fn(),
}))

vi.mock('@/services/voicePresence', () => ({
    rosterKey: (scopeType: string, scopeId: string) => `${scopeType}.${scopeId}`,
    subscribeVoiceRoster: vi.fn(() => ({ channel: {}, leave: vi.fn() })),
}))

const currentUser: User = {
    id: 'user-1', username: 'alice', display_name: 'Alice', avatar_url: null, status: 'online',
}

describe('useVoiceChannel', () => {
    beforeEach(() => {
        useVoice.getState().reset()
        vi.mocked(api.fetchVoiceDevicePreference).mockResolvedValue({
            client_id: 'client-1', input_device_id: 'mic-1', output_device_id: null,
        })
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    it('join fetches the device preference and hands it, plus self info, to webrtc.joinVoice', async () => {
        const { result } = renderHook(() => useVoiceChannel('channel', 'chan-1', currentUser, 'auto'))

        await act(async () => {
            await result.current.join()
        })

        expect(api.fetchVoiceDevicePreference).toHaveBeenCalledWith('client-1')
        expect(webrtc.joinVoice).toHaveBeenCalledWith(
            'channel', 'chan-1',
            { id: 'user-1', displayName: 'Alice', avatarUrl: null },
            { inputDeviceId: 'mic-1', connectionMode: 'auto' }
        )
    })

    it('leave delegates to webrtc.leaveVoice', () => {
        const { result } = renderHook(() => useVoiceChannel('channel', 'chan-1', currentUser, 'auto'))

        act(() => result.current.leave())

        expect(webrtc.leaveVoice).toHaveBeenCalled()
    })

    it('toggleMute flips the current selfMuted state', () => {
        useVoice.setState({ selfMuted: false })
        const { result } = renderHook(() => useVoiceChannel('channel', 'chan-1', currentUser, 'auto'))

        act(() => result.current.toggleMute())

        expect(webrtc.setMuted).toHaveBeenCalledWith(true)
    })

    it('isActive reflects whether this scope is the one currently in the store', () => {
        useVoice.setState({ scopeId: 'chan-1' })
        const { result } = renderHook(() => useVoiceChannel('channel', 'chan-1', currentUser, 'auto'))

        expect(result.current.isActive).toBe(true)
    })

    it('leaves the call on unmount if this scope is still the active one', () => {
        useVoice.setState({ scopeId: 'chan-1' })
        const { unmount } = renderHook(() => useVoiceChannel('channel', 'chan-1', currentUser, 'auto'))

        unmount()

        expect(webrtc.leaveVoice).toHaveBeenCalled()
    })

    it('does not leave the call on unmount if a different scope is active', () => {
        useVoice.setState({ scopeId: 'other-chan' })
        const { unmount } = renderHook(() => useVoiceChannel('channel', 'chan-1', currentUser, 'auto'))

        unmount()

        expect(webrtc.leaveVoice).not.toHaveBeenCalled()
    })
})
