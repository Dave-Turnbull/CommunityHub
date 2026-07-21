import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useChat } from '@/hooks/useChat'
import { useMessages } from '@/stores'
import * as api from '@/services/api'
import * as echo from '@/services/echo'
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
    created_at: '2026-01-01T00:00:00Z',
})

describe('useChat', () => {
    beforeEach(() => {
        useMessages.setState({ messages: {}, typing: {} })
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    const initial: PaginatedMessages = {
        data: [message('1')],
        has_more: true,
        next_cursor: '1',
    }

    it('seeds the message store with the initial page on mount', () => {
        const { result } = renderHook(() =>
            useChat({ scopeId: 'chan-1', scopeType: 'channel', initial })
        )

        expect(result.current.messages.map((m) => m.id)).toEqual(['1'])
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

    it('loadMore prepends the next page and updates the cursor', async () => {
        vi.mocked(api.fetchChannelMessages).mockResolvedValue({
            data: [message('0')],
            has_more: false,
            next_cursor: null,
        })

        const { result } = renderHook(() =>
            useChat({ scopeId: 'chan-1', scopeType: 'channel', initial })
        )

        await act(async () => {
            await result.current.loadMore()
        })

        expect(api.fetchChannelMessages).toHaveBeenCalledWith('chan-1', '1')
        await waitFor(() => {
            expect(useMessages.getState().messages['chan-1'].map((m) => m.id)).toEqual(['0', '1'])
        })
    })

    it('loadMore does nothing when there is no more history', async () => {
        const { result } = renderHook(() =>
            useChat({
                scopeId: 'chan-1',
                scopeType: 'channel',
                initial: { data: [message('1')], has_more: false, next_cursor: null },
            })
        )

        await act(async () => {
            await result.current.loadMore()
        })

        expect(api.fetchChannelMessages).not.toHaveBeenCalled()
    })

    it('uses the conversation fetcher for conversation scopes', async () => {
        vi.mocked(api.fetchConversationMessages).mockResolvedValue({
            data: [],
            has_more: false,
            next_cursor: null,
        })

        const { result } = renderHook(() =>
            useChat({ scopeId: 'conv-1', scopeType: 'conversation', initial })
        )

        await act(async () => {
            await result.current.loadMore()
        })

        expect(api.fetchConversationMessages).toHaveBeenCalledWith('conv-1', '1')
        expect(api.fetchChannelMessages).not.toHaveBeenCalled()
    })
})
