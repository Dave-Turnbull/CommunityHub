import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useChat } from '@/hooks/useChat'
import { useMessages } from '@/stores'
import * as api from '@/services/api'
import * as echo from '@/services/echo'
import { createMemoryDriver, setMessageCacheDriver } from '@/services/messageCache'
import type { Message, PaginatedMessages } from '@/types'

vi.mock('@/services/echo', () => ({
    subscribe: vi.fn(() => vi.fn()),
}))

vi.mock('@/services/api', () => ({
    fetchChannelMessages: vi.fn(),
    fetchConversationMessages: vi.fn(),
}))

const message = (id: string): Message => ({
    id,
    channel_id: 'chan-1',
    conversation_id: null,
    author_id: 'user-1',
    content: `content-${id}`,
    type: 'text',
    is_edited: false,
    is_pinned: false,
    reply_to_id: null,
    created_at: `2026-01-01T00:00:${id.padStart(2, '0')}Z`,
})

const page = (
    messages: Message[],
    overrides: Partial<PaginatedMessages> = {}
): PaginatedMessages => ({
    data: messages,
    has_older: false,
    older_cursor: null,
    has_newer: false,
    newer_cursor: null,
    ...overrides,
})

describe('useChat', () => {
    beforeEach(() => {
        useMessages.setState({ messages: {}, windows: {}, typing: {} })
        // A fresh cache per test — otherwise a page written by one test gets
        // served to the next, which is exactly the cache working as intended
        // and exactly what makes shared state a bad idea in tests.
        setMessageCacheDriver(createMemoryDriver())
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    const initial = page([message('1')], { has_older: true, older_cursor: '1' })

    it('seeds the message store with the initial page on mount', () => {
        const { result } = renderHook(() =>
            useChat({ scopeId: 'chan-1', scopeType: 'channel', initial })
        )

        expect(result.current.messages.map((m) => m.id)).toEqual(['1'])
        expect(result.current.hasOlder).toBe(true)
        expect(result.current.hasNewer).toBe(false)
        expect(useMessages.getState().messages['chan-1']).toHaveLength(1)
    })

    it('subscribes to the websocket scope on mount and unsubscribes on unmount', () => {
        const unsubscribe = vi.fn()
        vi.mocked(echo.subscribe).mockReturnValue(unsubscribe)

        const { unmount } = renderHook(() =>
            useChat({ scopeId: 'chan-1', scopeType: 'channel', initial })
        )

        expect(echo.subscribe).toHaveBeenCalledWith('chan-1', 'channel')

        unmount()
        expect(unsubscribe).toHaveBeenCalled()
    })

    it('loadOlder prepends the next page and updates the cursor', async () => {
        vi.mocked(api.fetchChannelMessages).mockResolvedValue(page([message('0')]))

        const { result } = renderHook(() =>
            useChat({ scopeId: 'chan-1', scopeType: 'channel', initial })
        )

        await act(async () => {
            await result.current.loadOlder()
        })

        expect(api.fetchChannelMessages).toHaveBeenCalledWith('chan-1', { before: '1' })
        await waitFor(() => {
            expect(useMessages.getState().messages['chan-1'].map((m) => m.id)).toEqual(['0', '1'])
        })
        expect(useMessages.getState().windows['chan-1'].hasOlder).toBe(false)
    })

    it('loadOlder does nothing when there is no more history', async () => {
        const { result } = renderHook(() =>
            useChat({ scopeId: 'chan-1', scopeType: 'channel', initial: page([message('1')]) })
        )

        await act(async () => {
            await result.current.loadOlder()
        })

        expect(api.fetchChannelMessages).not.toHaveBeenCalled()
    })

    it('loadNewer does nothing while the window already reaches the tail', async () => {
        const { result } = renderHook(() =>
            useChat({ scopeId: 'chan-1', scopeType: 'channel', initial })
        )

        await act(async () => {
            await result.current.loadNewer()
        })

        expect(api.fetchChannelMessages).not.toHaveBeenCalled()
    })

    it('loadNewer pages forward from the window newer cursor once detached', async () => {
        vi.mocked(api.fetchChannelMessages).mockResolvedValue(
            page([message('2')], { has_older: true, older_cursor: '2' })
        )

        const { result } = renderHook(() =>
            useChat({
                scopeId: 'chan-1',
                scopeType: 'channel',
                initial: page([message('1')], { has_newer: true, newer_cursor: '1' }),
            })
        )

        await act(async () => {
            await result.current.loadNewer()
        })

        expect(api.fetchChannelMessages).toHaveBeenCalledWith('chan-1', { after: '1' })
        await waitFor(() => {
            expect(useMessages.getState().messages['chan-1'].map((m) => m.id)).toEqual(['1', '2'])
        })
        expect(useMessages.getState().windows['chan-1'].hasNewer).toBe(false)
    })

    it('serves an already-fetched page from the cache instead of re-requesting it', async () => {
        vi.mocked(api.fetchChannelMessages).mockResolvedValue(page([message('0')]))

        const { result } = renderHook(() =>
            useChat({ scopeId: 'chan-1', scopeType: 'channel', initial })
        )

        // Back to the oldest page, then forward to the tail, then back again:
        // only the first trip should have hit the network.
        await act(async () => { await result.current.loadOlder() })
        expect(api.fetchChannelMessages).toHaveBeenCalledTimes(1)

        act(() => {
            useMessages.getState().setWindow(
                'chan-1',
                page([message('1')], { has_older: true, older_cursor: '1' })
            )
        })

        await act(async () => { await result.current.loadOlder() })

        expect(api.fetchChannelMessages).toHaveBeenCalledTimes(1)
        expect(useMessages.getState().messages['chan-1'].map((m) => m.id)).toEqual(['0', '1'])
    })

    it('jumpToPresent replaces the window with a fresh tail page', async () => {
        vi.mocked(api.fetchChannelMessages).mockResolvedValue(page([message('8'), message('9')]))

        const { result } = renderHook(() =>
            useChat({
                scopeId: 'chan-1',
                scopeType: 'channel',
                initial: page([message('1')], { has_newer: true, newer_cursor: '1' }),
            })
        )

        await act(async () => {
            await result.current.jumpToPresent()
        })

        expect(api.fetchChannelMessages).toHaveBeenCalledWith('chan-1', {})
        expect(useMessages.getState().messages['chan-1'].map((m) => m.id)).toEqual(['8', '9'])
        expect(useMessages.getState().windows['chan-1'].hasNewer).toBe(false)
    })

    it('jumpToMessage does nothing when the message is already in the window', async () => {
        const { result } = renderHook(() =>
            useChat({ scopeId: 'chan-1', scopeType: 'channel', initial })
        )

        await act(async () => {
            await result.current.jumpToMessage('1')
        })

        expect(api.fetchChannelMessages).not.toHaveBeenCalled()
    })

    it('jumpToMessage fetches a page centered on the target when not in the window', async () => {
        vi.mocked(api.fetchChannelMessages).mockResolvedValue(
            page([message('4'), message('5'), message('6')], { has_older: true, older_cursor: '4' })
        )

        const { result } = renderHook(() =>
            useChat({ scopeId: 'chan-1', scopeType: 'channel', initial })
        )

        await act(async () => {
            await result.current.jumpToMessage('5')
        })

        expect(api.fetchChannelMessages).toHaveBeenCalledWith('chan-1', { around: '5' })
        expect(useMessages.getState().messages['chan-1'].map((m) => m.id)).toEqual(['4', '5', '6'])
    })

    it('commitSent appends a sent message while the window is at the tail', () => {
        const { result } = renderHook(() =>
            useChat({ scopeId: 'chan-1', scopeType: 'channel', initial })
        )

        act(() => {
            result.current.commitSent(message('2'))
        })

        expect(useMessages.getState().messages['chan-1'].map((m) => m.id)).toEqual(['1', '2'])
    })

    it('commitSent jumps to the present rather than dropping a message sent while detached', async () => {
        vi.mocked(api.fetchChannelMessages).mockResolvedValue(page([message('9')]))

        const { result } = renderHook(() =>
            useChat({
                scopeId: 'chan-1',
                scopeType: 'channel',
                initial: page([message('1')], { has_newer: true, newer_cursor: '1' }),
            })
        )

        await act(async () => {
            result.current.commitSent(message('2'))
        })

        expect(api.fetchChannelMessages).toHaveBeenCalledWith('chan-1', {})
        await waitFor(() => {
            expect(useMessages.getState().messages['chan-1'].map((m) => m.id)).toEqual(['9'])
        })
    })

    it('uses the conversation fetcher for conversation scopes', async () => {
        vi.mocked(api.fetchConversationMessages).mockResolvedValue(page([]))

        const { result } = renderHook(() =>
            useChat({
                scopeId: 'conv-1',
                scopeType: 'conversation',
                initial: page([message('1')], { has_older: true, older_cursor: '1' }),
            })
        )

        await act(async () => {
            await result.current.loadOlder()
        })

        expect(api.fetchConversationMessages).toHaveBeenCalledWith('conv-1', { before: '1' })
        expect(api.fetchChannelMessages).not.toHaveBeenCalled()
    })
})
