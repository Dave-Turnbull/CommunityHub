import { useEffect, useRef } from 'react'
import { markChannelRead, markConversationRead } from '@/services/api'
import { useMessages } from '@/stores'

// At most one mark-read request per window — a busy channel appends many
// messages a second, and the server only needs the latest "now".
const THROTTLE_MS = 2_000

/**
 * Keeps the server's read marker current while a channel/conversation page is
 * open: whenever the scope's newest message changes and the tab is visible,
 * and again when the tab becomes visible. The page load itself already marks
 * the scope read (see Web\ChannelController::show), so this only covers
 * messages that arrive afterward (it also fires once when the first page
 * seeds the store — a redundant but idempotent write). Best-effort — failures
 * are swallowed.
 */
export function useMarkRead(scopeType: 'channel' | 'conversation', scopeId: string | null): void {
    const latestId = useMessages((s) => {
        const list = scopeId ? s.messages[scopeId] : undefined
        return list?.[list.length - 1]?.id ?? null
    })

    const lastSentAt = useRef<number | null>(null)
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        if (!scopeId) return

        const send = () => {
            timer.current = null
            lastSentAt.current = Date.now()
            try {
                const request = scopeType === 'channel' ? markChannelRead(scopeId) : markConversationRead(scopeId)
                void Promise.resolve(request).catch(() => {})
            } catch {
                // best-effort
            }
        }

        const requestMark = () => {
            if (document.visibilityState !== 'visible' || timer.current) return

            const wait = lastSentAt.current === null ? 0 : Math.max(0, lastSentAt.current + THROTTLE_MS - Date.now())
            if (wait === 0) {
                send()
            } else {
                timer.current = setTimeout(send, wait)
            }
        }

        const onVisibilityChange = () => requestMark()
        document.addEventListener('visibilitychange', onVisibilityChange)

        if (latestId) requestMark()

        return () => {
            document.removeEventListener('visibilitychange', onVisibilityChange)
            if (timer.current) clearTimeout(timer.current)
            timer.current = null
        }
    }, [scopeType, scopeId, latestId])
}
