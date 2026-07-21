import { useCallback, useEffect, useRef } from 'react'
import { useMessages } from '@/stores'
import { subscribe } from '@/services/echo'
import { fetchChannelMessages, fetchConversationMessages } from '@/services/api'
import type { Message, PaginatedMessages } from '@/types'

interface Options {
    scopeId: string
    scopeType: 'channel' | 'conversation'
    initial: PaginatedMessages
    // false for a voice channel — no message history to seed/subscribe to
    // (see ChannelController::show / MessageController's voice-channel guard).
    enabled?: boolean
}

// Stable reference so the selector doesn't hand useSyncExternalStore a new
// array every render when a scope has no messages yet — a fresh `[]` there
// trips React's "getSnapshot should be cached" warning.
const EMPTY_MESSAGES: Message[] = []

/**
 * Seeds the message store with the server-rendered first page, subscribes to
 * websocket events, and exposes a loadMore() for infinite scroll upward.
 */
export function useChat({ scopeId, scopeType, initial, enabled = true }: Options) {
    const messages    = useMessages((s) => s.messages[scopeId] ?? EMPTY_MESSAGES)
    const setMessages = useMessages((s) => s.setMessages)
    const prepend     = useMessages((s) => s.prepend)

    const cursor  = useRef(initial.next_cursor)
    const hasMore = useRef(initial.has_more)
    const loading = useRef(false)

    // Seed store on mount / scope change
    useEffect(() => {
        if (!enabled) return
        setMessages(scopeId, initial.data)
        cursor.current  = initial.next_cursor
        hasMore.current = initial.has_more
    }, [scopeId, enabled])

    // Websocket subscription
    useEffect(() => {
        if (!enabled) return
        return subscribe(scopeId, scopeType)
    }, [scopeId, scopeType, enabled])

    const loadMore = useCallback(async () => {
        if (!enabled || !hasMore.current || loading.current) return

        loading.current = true
        try {
            const page = scopeType === 'channel'
                ? await fetchChannelMessages(scopeId, cursor.current ?? undefined)
                : await fetchConversationMessages(scopeId, cursor.current ?? undefined)

            prepend(scopeId, page.data)
            cursor.current  = page.next_cursor
            hasMore.current = page.has_more
        } finally {
            loading.current = false
        }
    }, [scopeId, scopeType, prepend, enabled])

    return { messages: enabled ? messages : EMPTY_MESSAGES, loadMore, hasMore: enabled && hasMore.current }
}
