import { useCallback, useEffect, useRef } from 'react'
import { useMessages } from '@/stores'
import { subscribe } from '@/services/echo'
import { fetchChannelMessages, fetchConversationMessages } from '@/services/api'
import * as cache from '@/services/messageCache'
import type { Message, PaginatedMessages } from '@/types'
import type { MessageCursor } from '@/services/api'

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

// Matches TextMessageService::PAGE_SIZE — the cache serves whole pages or
// nothing (see services/messageCache.ts), so it has to agree with the server
// about how big one is.
const PAGE_SIZE = 50

/**
 * Owns one scope's message window: seeds it from the server-rendered first
 * page, keeps it live over the websocket, and pages it in both directions —
 * older on scroll-up, newer on scroll-down after the window trimmed its tail.
 * `hasNewer` is the "not looking at the present" signal that drives the
 * jump-to-present affordance. See docs/messages-and-pagination.md.
 */
export function useChat({ scopeId, scopeType, initial, enabled = true }: Options) {
    const messages     = useMessages((s) => s.messages[scopeId] ?? EMPTY_MESSAGES)
    const windowState  = useMessages((s) => s.windows[scopeId])
    const setWindow    = useMessages((s) => s.setWindow)
    const prependOlder = useMessages((s) => s.prependOlder)
    const appendNewer  = useMessages((s) => s.appendNewer)

    const loading = useRef(false)

    const fetchPage = useCallback(
        (cursor: MessageCursor) => scopeType === 'channel'
            ? fetchChannelMessages(scopeId, cursor)
            : fetchConversationMessages(scopeId, cursor),
        [scopeId, scopeType],
    )

    // Seed store on mount / scope change. The Inertia prop is a page the
    // server rendered for this navigation, so it always wins over the cache;
    // the cache exists to answer paging, not first paint.
    useEffect(() => {
        if (!enabled) return
        setWindow(scopeId, initial)
        cache.seedRun(scopeId, initial)
    }, [scopeId, enabled])

    // Websocket subscription
    useEffect(() => {
        if (!enabled) return
        return subscribe(scopeId, scopeType)
    }, [scopeId, scopeType, enabled])

    const loadOlder = useCallback(async () => {
        if (!enabled || loading.current) return

        const { hasOlder, olderCursor } = useMessages.getState().windows[scopeId] ?? {}
        if (!hasOlder || !olderCursor) return

        loading.current = true
        try {
            const cached = await cache.readOlder(scopeId, olderCursor, PAGE_SIZE)
            const page = cached ?? await fetchPage({ before: olderCursor })

            prependOlder(scopeId, page)
            if (!cached) await cache.extendRun(scopeId, page, 'older')
        } finally {
            loading.current = false
        }
    }, [scopeId, fetchPage, prependOlder, enabled])

    const loadNewer = useCallback(async () => {
        if (!enabled || loading.current) return

        const { hasNewer, newerCursor } = useMessages.getState().windows[scopeId] ?? {}
        if (!hasNewer || !newerCursor) return

        loading.current = true
        try {
            const cached = await cache.readNewer(scopeId, newerCursor, PAGE_SIZE)
            const page = cached ?? await fetchPage({ after: newerCursor })

            appendNewer(scopeId, page)
            if (!cached) await cache.extendRun(scopeId, page, 'newer')
        } finally {
            loading.current = false
        }
    }, [scopeId, fetchPage, appendNewer, enabled])

    /**
     * Back to the live tail in one step. Deliberately a fresh tail fetch
     * rather than paging forward or just scrolling: everything between the
     * window and the present is unfetched, and the tail is the only page whose
     * position is known without walking there.
     */
    const jumpToPresent = useCallback(async () => {
        if (!enabled) return

        loading.current = true
        try {
            const page = await fetchPage({})
            setWindow(scopeId, page)
            await cache.seedRun(scopeId, page)
        } finally {
            loading.current = false
        }
    }, [scopeId, fetchPage, setWindow, enabled])

    /**
     * The network half of "go to message" (see CLAUDE.md) — a reply preview
     * click or a direct link's target. Only hits the network when the
     * message isn't already held: a reply within the currently loaded window
     * needs no fetch, it's already there. Scrolling to and highlighting the
     * row is the caller's job (see MessageList's scrollTo prop) — this hook
     * only owns the window's contents, not the DOM.
     */
    const jumpToMessage = useCallback(async (messageId: string) => {
        if (!enabled) return

        const alreadyLoaded = (useMessages.getState().messages[scopeId] ?? [])
            .some((m) => m.id === messageId)
        if (alreadyLoaded) return

        loading.current = true
        try {
            const page = await fetchPage({ around: messageId })
            setWindow(scopeId, page)
            await cache.seedRun(scopeId, page)
        } finally {
            loading.current = false
        }
    }, [scopeId, fetchPage, setWindow, enabled])

    /**
     * A message this tab just sent. While detached, appending it would put it
     * on the far side of the window's gap (the store refuses, see
     * useMessages.add) — the reader plainly wants to be at the present, so go
     * there instead of silently dropping their own message.
     */
    const commitSent = useCallback(
        (message: Message) => {
            if (useMessages.getState().windows[scopeId]?.hasNewer) {
                jumpToPresent()
                return
            }

            useMessages.getState().add(scopeId, message)
            cache.appendLive(scopeId, message)
        },
        [scopeId, jumpToPresent],
    )

    return {
        messages: enabled ? messages : EMPTY_MESSAGES,
        hasOlder: enabled && (windowState?.hasOlder ?? false),
        hasNewer: enabled && (windowState?.hasNewer ?? false),
        loadOlder,
        loadNewer,
        jumpToPresent,
        jumpToMessage,
        commitSent,
    }
}
