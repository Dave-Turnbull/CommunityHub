import { useEffect, useMemo } from 'react'
import { useTyping } from '@/stores'

const PRUNE_INTERVAL_MS = 1000

interface Props {
    scopeId: string
    currentUserId: string
    resolveName: (userId: string) => string | undefined
}

export function describeTyping(names: string[]): string {
    if (names.length === 0) return ''
    if (names.length === 1) return `${names[0]} is typing…`
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`
    return 'Several people are typing…'
}

/**
 * Always renders its fixed-height line, empty or not, so the text appearing
 * never resizes the message list above it or moves its scroll position. Owns
 * the one interval that prunes lapsed entries from useTyping.
 */
export function TypingIndicator({ scopeId, currentUserId, resolveName }: Props) {
    const entries = useTyping((s) => s.expiries[scopeId])

    useEffect(() => {
        const id = setInterval(() => useTyping.getState().prune(), PRUNE_INTERVAL_MS)
        return () => clearInterval(id)
    }, [])

    const names = useMemo(
        () => Object.keys(entries ?? {})
            .filter((userId) => userId !== currentUserId)
            .map(resolveName)
            .filter((name): name is string => !!name),
        [entries, currentUserId, resolveName]
    )

    return (
        <div
            aria-live="polite"
            className="h-5 px-4 flex-shrink-0 truncate text-xs leading-5 text-text-muted"
        >
            {describeTyping(names)}
        </div>
    )
}
