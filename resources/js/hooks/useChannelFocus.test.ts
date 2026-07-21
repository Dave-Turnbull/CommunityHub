import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useChannelFocus } from '@/hooks/useChannelFocus'
import * as api from '@/services/api'

vi.mock('@/services/api', () => ({
    focusChannel: vi.fn(),
    blurChannel: vi.fn(),
}))

describe('useChannelFocus', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.clearAllMocks()
    })

    it('focuses the channel on mount', () => {
        renderHook(() => useChannelFocus('chan-1'))

        expect(api.focusChannel).toHaveBeenCalledWith('chan-1')
        expect(api.focusChannel).toHaveBeenCalledTimes(1)
    })

    it('sends a heartbeat focus call every 15 seconds while mounted', () => {
        renderHook(() => useChannelFocus('chan-1'))

        vi.advanceTimersByTime(15_000)
        expect(api.focusChannel).toHaveBeenCalledTimes(2)

        vi.advanceTimersByTime(15_000)
        expect(api.focusChannel).toHaveBeenCalledTimes(3)
    })

    it('blurs the channel and stops the heartbeat on unmount', () => {
        const { unmount } = renderHook(() => useChannelFocus('chan-1'))

        unmount()

        expect(api.blurChannel).toHaveBeenCalledWith('chan-1')

        vi.advanceTimersByTime(30_000)
        expect(api.focusChannel).toHaveBeenCalledTimes(1)
    })

    it('blurs the old channel and focuses the new one when the channel changes', () => {
        const { rerender } = renderHook(({ channelId }) => useChannelFocus(channelId), {
            initialProps: { channelId: 'chan-1' },
        })

        rerender({ channelId: 'chan-2' })

        expect(api.blurChannel).toHaveBeenCalledWith('chan-1')
        expect(api.focusChannel).toHaveBeenCalledWith('chan-2')
    })
})
