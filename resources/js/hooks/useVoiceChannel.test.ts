import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useVoiceChannel } from '@/hooks/useVoiceChannel'
import { useVoice, useVoiceRoster, useSpeaking, useConnectionQuality } from '@/stores'
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
        useVoiceRoster.setState({ rosters: {} })
        useSpeaking.setState({ speaking: {} })
        useConnectionQuality.setState({ quality: {} })
        vi.mocked(api.fetchVoiceDevicePreference).mockResolvedValue({
            client_id: 'client-1', input_device_id: 'mic-1', output_device_id: null, send_threshold: 0,
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
            { inputDeviceId: 'mic-1', connectionMode: 'auto', sendThreshold: 0 }
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

    it('toggleDeafen flips the current deafened state directly, without going through webrtc.ts', () => {
        useVoice.setState({ deafened: false })
        const { result } = renderHook(() => useVoiceChannel('channel', 'chan-1', currentUser, 'auto'))

        act(() => result.current.toggleDeafen())

        expect(useVoice.getState().deafened).toBe(true)
        expect(webrtc.setMuted).not.toHaveBeenCalled()
    })

    it('isActive reflects whether this scope is the one currently in the store', () => {
        useVoice.setState({ scopeId: 'chan-1' })
        const { result } = renderHook(() => useVoiceChannel('channel', 'chan-1', currentUser, 'auto'))

        expect(result.current.isActive).toBe(true)
    })

    it('merges each participant\'s live speaking state from useSpeaking', () => {
        useVoiceRoster.getState().setRoster('channel.chan-1', [
            { userId: 'user-2', displayName: 'Bob', avatarUrl: null, muted: false },
            { userId: 'user-3', displayName: 'Carol', avatarUrl: null, muted: false },
        ])
        useSpeaking.getState().setSpeaking('user-2', true)
        const { result } = renderHook(() => useVoiceChannel('channel', 'chan-1', currentUser, 'auto'))

        expect(result.current.participants).toEqual([
            { userId: 'user-2', displayName: 'Bob', avatarUrl: null, muted: false, speaking: true, quality: 'unknown' },
            { userId: 'user-3', displayName: 'Carol', avatarUrl: null, muted: false, speaking: false, quality: 'unknown' },
        ])
    })

    it('merges each participant\'s live connection quality from useConnectionQuality', () => {
        useVoiceRoster.getState().setRoster('channel.chan-1', [
            { userId: 'user-2', displayName: 'Bob', avatarUrl: null, muted: false },
        ])
        useConnectionQuality.getState().setQuality('user-2', 'poor')
        const { result } = renderHook(() => useVoiceChannel('channel', 'chan-1', currentUser, 'auto'))

        expect(result.current.participants[0].quality).toBe('poor')
    })

    it('does not leave the call on unmount — navigating channels/rooms must not drop an active call', () => {
        useVoice.setState({ scopeId: 'chan-1' })
        const { unmount } = renderHook(() => useVoiceChannel('channel', 'chan-1', currentUser, 'auto'))

        unmount()

        expect(webrtc.leaveVoice).not.toHaveBeenCalled()
    })
})
