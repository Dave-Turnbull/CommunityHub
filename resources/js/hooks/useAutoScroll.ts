import { useEffect, useRef } from 'react'

/**
 * Keeps a scroll container pinned to the bottom as new messages arrive,
 * unless the user has scrolled up to read history.
 */
export function useAutoScroll(dep: number) {
    const ref = useRef<HTMLDivElement>(null)
    const pinned = useRef(true)

    const onScroll = () => {
        const el = ref.current
        if (!el) return
        pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    }

    useEffect(() => {
        const el = ref.current
        if (el && pinned.current) {
            el.scrollTop = el.scrollHeight
        }
    }, [dep])

    return { ref, onScroll }
}
