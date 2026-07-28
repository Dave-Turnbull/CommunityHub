import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MessageRow } from './MessageRow'
import { useAutoScroll } from '@/hooks/useAutoScroll'
import type { Message, User } from '@/types'

interface Props {
    messages: Message[]
    scopeId: string
    currentUser: User
    hasOlder: boolean
    hasNewer: boolean
    onLoadOlder: () => void
    onLoadNewer: () => void
    /** Increment to send the view back to the live tail — see TextChannelContent. */
    jumpToken?: number
    onReply: (m: Message) => void
    onJumpToMessage: (messageId: string) => void
    /**
     * "Go to message" (see CLAUDE.md) — scroll to and briefly flash this row.
     * `token` is bumped on every jump so re-jumping to the same id (clicking
     * the same reply twice) still re-triggers the effect rather than being a
     * no-op state update. See TextChannelContent.
     */
    scrollTo?: { id: string; token: number } | null
    emptyState?: React.ReactNode
    /** Forwarded to MessageRow — see TextChannelContent's docblock on these three. */
    commentsEnabled?: boolean
    maxCommentDepth?: number | null
    broadcastScope?: { id: string; type: 'channel' | 'conversation' }
}

const FLASH_DURATION_MS = 2000

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

/**
 * The topmost row still in view. Binary search over offsetTop rather than a
 * walk with getBoundingClientRect: rows are in DOM order with increasing
 * offsets, and a window holds up to MAX_WINDOW_MESSAGES of them on a path that
 * runs on every scroll event.
 */
function firstVisibleRow(container: HTMLElement): HTMLElement | null {
    const rows = container.querySelectorAll<HTMLElement>('[data-message-id]')
    if (!rows.length) return null

    let low = 0
    let high = rows.length - 1
    let found: HTMLElement | null = null

    while (low <= high) {
        const mid = (low + high) >> 1
        const row = rows[mid]

        if (row.offsetTop + row.offsetHeight > container.scrollTop) {
            found = row
            high = mid - 1
        } else {
            low = mid + 1
        }
    }

    return found
}

export function MessageList({
    messages, scopeId, currentUser, hasOlder, hasNewer, onLoadOlder, onLoadNewer, jumpToken = 0,
    onReply, onJumpToMessage, scrollTo, emptyState, commentsEnabled = false, maxCommentDepth = null, broadcastScope,
}: Props) {
    const { ref, onScroll, stickToBottom } = useAutoScroll(messages.length, !hasNewer)
    const topSentinel = useRef<HTMLDivElement>(null)
    const bottomSentinel = useRef<HTMLDivElement>(null)
    const [flashId, setFlashId] = useState<string | null>(null)

    // Which message the reader is looking at, and how far below the top edge
    // it sits — kept current by every scroll event so it is never stale by the
    // time a page load lands. Restoring *an element's* position instead of
    // doing scrollTop arithmetic is what makes prepending, appending and
    // trimming (any two of which can land in one update) all behave; see
    // docs/messages-and-pagination.md.
    const anchor = useRef<{ id: string; offset: number } | null>(null)
    const firstId = useRef<string | undefined>(messages[0]?.id)

    const captureAnchor = () => {
        const el = ref.current
        if (!el) return

        const row = firstVisibleRow(el)
        anchor.current = row
            ? { id: row.dataset.messageId!, offset: row.offsetTop - el.scrollTop }
            : null
    }

    // Only when the list gained or lost rows *above* the viewport — a live
    // message arriving at the bottom must be left to useAutoScroll instead.
    useLayoutEffect(() => {
        const previousFirst = firstId.current
        firstId.current = messages[0]?.id

        const pending = anchor.current
        const el = ref.current
        if (!pending || !el || previousFirst === firstId.current) return

        const row = el.querySelector<HTMLElement>(`[data-message-id="${pending.id}"]`)
        if (row) el.scrollTop = row.offsetTop - pending.offset
    }, [messages])

    useEffect(() => {
        if (jumpToken) stickToBottom()
    }, [jumpToken])

    // "Go to message" landing: scroll the target row into view and flash it
    // briefly. Runs after the effects above in the same commit, so it wins
    // over both anchor restoration (which no-ops here — a jump replaces the
    // window, so the old anchor id is gone) and auto-scroll's stick-to-bottom
    // (which jumpToken alone drives, untouched by a reply/link jump).
    // scrollIntoView is optionally chained — jsdom ships no implementation.
    useEffect(() => {
        if (!scrollTo) return

        const row = ref.current?.querySelector<HTMLElement>(`[data-message-id="${scrollTo.id}"]`)
        row?.scrollIntoView?.({ block: 'center' })

        setFlashId(scrollTo.id)
        const timer = setTimeout(() => setFlashId(null), FLASH_DURATION_MS)
        return () => clearTimeout(timer)
    }, [scrollTo])

    // One observer per direction: older history above, and — once the window
    // has trimmed its tail — the messages it dropped below.
    useEffect(() => {
        const load = (sentinel: HTMLDivElement | null, onLoad: () => void) => {
            if (!sentinel) return undefined

            const obs = new IntersectionObserver(
                ([entry]) => entry.isIntersecting && onLoad(),
                { root: ref.current, threshold: 0.1 },
            )
            obs.observe(sentinel)

            return () => obs.disconnect()
        }

        const stopTop = hasOlder ? load(topSentinel.current, onLoadOlder) : undefined
        const stopBottom = hasNewer ? load(bottomSentinel.current, onLoadNewer) : undefined

        return () => { stopTop?.(); stopBottom?.() }
    }, [hasOlder, hasNewer, onLoadOlder, onLoadNewer])

    if (!messages.length && emptyState) {
        return <div className="flex-1 grid place-items-center">{emptyState}</div>
    }

    return (
        <div
            ref={ref}
            onScroll={() => { onScroll(); captureAnchor() }}
            // `relative` is load-bearing: it makes this element the rows'
            // offsetParent, so the offsetTop the scroll anchoring reads is
            // measured from the top of the scrollable content and nothing else.
            className="relative flex-1 overflow-y-auto min-h-0 pb-4"
        >
            <div ref={topSentinel} className="h-px" />

            {messages.map((m, i) => {
                const prev = messages[i - 1]
                const newDay =
                    !prev ||
                    new Date(m.created_at).toDateString() !== new Date(prev.created_at).toDateString()

                return (
                    <div key={m.id} data-message-id={m.id}>
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
                            scopeId={scopeId}
                            grouped={!newDay && isGrouped(prev, m)}
                            currentUser={currentUser}
                            onReply={onReply}
                            onJumpToMessage={onJumpToMessage}
                            highlighted={m.id === flashId}
                            commentsEnabled={commentsEnabled}
                            maxCommentDepth={maxCommentDepth}
                            broadcastScope={broadcastScope}
                        />
                    </div>
                )
            })}

            <div ref={bottomSentinel} className="h-px" />
        </div>
    )
}
