import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useMarkRead } from '@/hooks/useMarkRead'
import { useMessages } from '@/stores'
import * as api from '@/services/api'
import type { Message } from '@/types'

vi.mock('@/services/api', () => ({
    markChannelRead: vi.fn(),
    markConversationRead: vi.fn(),
}))

const msg = (id: string) => ({ id }) as Message

const setVisibility = (state: 'visible' | 'hidden') => {
    Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
}

const land = (scopeId: string, ...ids: string[]) => {
    act(() => {
        useMessages.setState((s) => ({ messages: { ...s.messages, [scopeId]: ids.map(msg) } }))
    })
}

describe('useMarkRead', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2025-01-10T12:00:00Z'))
        setVisibility('visible')
        useMessages.setState({ messages: {}, windows: {}, typing: {} })
        vi.mocked(api.markChannelRead).mockResolvedValue(undefined)
        vi.mocked(api.markConversationRead).mockResolvedValue(undefined)
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.clearAllMocks()
        setVisibility('visible')
    })

    it('does nothing while the scope has no messages', () => {
        renderHook(() => useMarkRead('channel', 'chan-1'))

        expect(api.markChannelRead).not.toHaveBeenCalled()
    })

    it('marks the channel read when its latest message changes', () => {
        renderHook(() => useMarkRead('channel', 'chan-1'))

        land('chan-1', 'm1')

        expect(api.markChannelRead).toHaveBeenCalledWith('chan-1')
        expect(api.markConversationRead).not.toHaveBeenCalled()
    })

    it('uses the conversation endpoint for a conversation scope', () => {
        renderHook(() => useMarkRead('conversation', 'conv-1'))

        land('conv-1', 'm1')

        expect(api.markConversationRead).toHaveBeenCalledWith('conv-1')
        expect(api.markChannelRead).not.toHaveBeenCalled()
    })

    it('ignores messages landing in a different scope', () => {
        renderHook(() => useMarkRead('channel', 'chan-1'))

        land('chan-2', 'm1')

        expect(api.markChannelRead).not.toHaveBeenCalled()
    })

    it('sends at most one request per two seconds, with a trailing request for the latest message', () => {
        renderHook(() => useMarkRead('channel', 'chan-1'))

        land('chan-1', 'm1')
        expect(api.markChannelRead).toHaveBeenCalledTimes(1)

        vi.advanceTimersByTime(500)
        land('chan-1', 'm1', 'm2')
        vi.advanceTimersByTime(500)
        land('chan-1', 'm1', 'm2', 'm3')
        expect(api.markChannelRead).toHaveBeenCalledTimes(1)

        vi.advanceTimersByTime(999)
        expect(api.markChannelRead).toHaveBeenCalledTimes(1)

        vi.advanceTimersByTime(1)
        expect(api.markChannelRead).toHaveBeenCalledTimes(2)

        vi.advanceTimersByTime(10_000)
        expect(api.markChannelRead).toHaveBeenCalledTimes(2)
    })

    it('does not send while the tab is hidden', () => {
        setVisibility('hidden')
        renderHook(() => useMarkRead('channel', 'chan-1'))

        land('chan-1', 'm1')
        vi.advanceTimersByTime(5_000)

        expect(api.markChannelRead).not.toHaveBeenCalled()
    })

    it('sends once when the tab becomes visible again', () => {
        setVisibility('hidden')
        renderHook(() => useMarkRead('channel', 'chan-1'))
        land('chan-1', 'm1')

        setVisibility('visible')
        act(() => {
            document.dispatchEvent(new Event('visibilitychange'))
        })

        expect(api.markChannelRead).toHaveBeenCalledTimes(1)
    })

    it('does not send when the tab becomes hidden', () => {
        renderHook(() => useMarkRead('channel', 'chan-1'))

        setVisibility('hidden')
        act(() => {
            document.dispatchEvent(new Event('visibilitychange'))
        })

        expect(api.markChannelRead).not.toHaveBeenCalled()
    })

    it('swallows a rejected request', async () => {
        const rejection = Promise.reject(new Error('network'))
        const handled = vi.spyOn(rejection, 'catch')
        vi.mocked(api.markChannelRead).mockReturnValue(rejection)
        renderHook(() => useMarkRead('channel', 'chan-1'))

        land('chan-1', 'm1')
        await vi.advanceTimersByTimeAsync(0)

        expect(api.markChannelRead).toHaveBeenCalledTimes(1)
        expect(handled).toHaveBeenCalled()
    })

    it('swallows a synchronous throw', () => {
        vi.mocked(api.markChannelRead).mockImplementation(() => {
            throw new Error('boom')
        })
        renderHook(() => useMarkRead('channel', 'chan-1'))

        expect(() => land('chan-1', 'm1')).not.toThrow()
    })

    it('stops listening and cancels a pending request on unmount', () => {
        const { unmount } = renderHook(() => useMarkRead('channel', 'chan-1'))
        land('chan-1', 'm1')
        vi.advanceTimersByTime(500)
        land('chan-1', 'm1', 'm2')

        unmount()
        vi.advanceTimersByTime(5_000)
        document.dispatchEvent(new Event('visibilitychange'))

        expect(api.markChannelRead).toHaveBeenCalledTimes(1)
    })

    it('does nothing for a null scope', () => {
        renderHook(() => useMarkRead('channel', null))

        land('chan-1', 'm1')

        expect(api.markChannelRead).not.toHaveBeenCalled()
    })
})
