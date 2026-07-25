import { useEffect, useRef } from 'react'
import { MessageRow } from './MessageRow'
import { useAutoScroll } from '@/hooks/useAutoScroll'
import type { Message, User } from '@/types'

interface Props {
    messages: Message[]
    currentUser: User
    hasMore: boolean
    onLoadMore: () => void
    onReply: (m: Message) => void
    emptyState?: React.ReactNode
}

// Group consecutive messages from the same author within 7 minutes
function isGrouped(prev: Message | undefined, curr: Message): boolean {
    if (!prev || prev.author_id !== curr.author_id) return false

    const gap = +new Date(curr.created_at) - +new Date(prev.created_at)
    return gap < 7 * 60 * 1000
}

function dayLabel(iso: string): string {
    const d = new Date(iso)
    const today = new Date()
    const yday = new Date(today)
    yday.setDate(today.getDate() - 1)

    if (d.toDateString() === today.toDateString()) return 'Today'
    if (d.toDateString() === yday.toDateString())  return 'Yesterday'

    return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
}

export function MessageList({
    messages, currentUser, hasMore, onLoadMore, onReply, emptyState,
}: Props) {
    const { ref, onScroll } = useAutoScroll(messages.length)
    const sentinel = useRef<HTMLDivElement>(null)

    // Load older messages when the top sentinel scrolls into view
    useEffect(() => {
        if (!hasMore || !sentinel.current) return

        const obs = new IntersectionObserver(
            ([entry]) => entry.isIntersecting && onLoadMore(),
            { root: ref.current, threshold: 0.1 },
        )
        obs.observe(sentinel.current)

        return () => obs.disconnect()
    }, [hasMore, onLoadMore])

    if (!messages.length && emptyState) {
        return <div className="flex-1 grid place-items-center">{emptyState}</div>
    }

    return (
        <div ref={ref} onScroll={onScroll} className="flex-1 overflow-y-auto min-h-0 pb-4">
            <div ref={sentinel} className="h-px" />

            {messages.map((m, i) => {
                const prev = messages[i - 1]
                const newDay =
                    !prev ||
                    new Date(m.created_at).toDateString() !== new Date(prev.created_at).toDateString()

                return (
                    <div key={m.id}>
                        {newDay && (
                            <div className="flex items-center gap-3 px-4 my-4">
                                <div className="flex-1 h-px bg-sixth" />
                                <span className="text-xs font-medium text-text-muted">
                                    {dayLabel(m.created_at)}
                                </span>
                                <div className="flex-1 h-px bg-sixth" />
                            </div>
                        )}

                        <MessageRow
                            message={m}
                            grouped={!newDay && isGrouped(prev, m)}
                            currentUser={currentUser}
                            onReply={onReply}
                        />
                    </div>
                )
            })}
        </div>
    )
}
