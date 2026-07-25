import { useLayoutEffect, useRef } from 'react'

/**
 * Keeps a scroll container pinned to the bottom as new messages arrive,
 * unless the user has scrolled up to read history.
 *
 * `atLive` is a veto: the bottom of a message window that has been trimmed
 * away from the live tail is not the present, so pinning to it would follow
 * paging rather than new messages. A layout effect (not a passive one) so the
 * adjustment lands in the same frame as the rows it follows — and so
 * MessageList's scroll anchoring, registered after this hook, can run last and
 * win when both apply to the same render.
 */
export function useAutoScroll(dep: number, atLive = true) {
    const ref = useRef<HTMLDivElement>(null)
    const pinned = useRef(true)

    const onScroll = () => {
        const el = ref.current
        if (!el) return
        pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    }

    /** Re-pin and jump now — for a deliberate "take me to the present". */
    const stickToBottom = () => {
        pinned.current = true
        const el = ref.current
        if (el) el.scrollTop = el.scrollHeight
    }

    useLayoutEffect(() => {
        const el = ref.current
        if (el && pinned.current && atLive) {
            el.scrollTop = el.scrollHeight
        }
    }, [dep])

    return { ref, onScroll, stickToBottom }
}
