import { useState } from 'react'
import { clsx } from 'clsx'
import { castVote, removeVote } from '@/services/api'
import type { Message, VoteSummary } from '@/types'

interface Props {
    message: Message
    /** Applies the next {score, mine} pair wherever this message is held — a
     *  Zustand store patch when the caller reads from useMessages (see
     *  CommentThread), or plain local state when it doesn't (see
     *  ForumChannelContent's post list, which isn't windowed/live). */
    onChange: (next: VoteSummary) => void
}

/**
 * Optimistic write → await → reconcile-or-restore, the same shape
 * services/messageActions.ts uses for reactions/edits/deletes — see
 * docs/comments-and-voting.md. Kept local to this component rather than
 * added to messageActions.ts since it has no edit/delete-style "restore
 * the previous message" step, just a score/mine pair. Deliberately takes
 * an onChange callback rather than assuming a Zustand scope — not every
 * caller's list of messages lives in the windowed message store.
 */
export function VoteControl({ message, onChange }: Props) {
    const score = message.votes?.score ?? 0
    const mine = message.votes?.mine ?? null
    const [pending, setPending] = useState(false)

    const cast = async (value: 1 | -1) => {
        if (pending) return
        const previous = { score, mine }
        const next = value === mine
            ? { score: score - value, mine: null as 1 | -1 | null }
            : { score: score + value - (mine ?? 0), mine: value }

        onChange(next)
        setPending(true)
        try {
            const summary = value === mine ? await removeVote(message.id) : await castVote(message.id, value)
            onChange(summary)
        } catch {
            onChange(previous)
        } finally {
            setPending(false)
        }
    }

    return (
        <div className="flex items-center gap-1 text-sm">
            <button
                type="button"
                onClick={() => cast(1)}
                aria-label="Upvote"
                aria-pressed={mine === 1}
                className={clsx(
                    'px-1.5 py-0.5 rounded hover:bg-fourth transition-colors',
                    mine === 1 ? 'text-accent-primary' : 'text-text-secondary',
                )}
            >
                ▲
            </button>
            <span className="min-w-[1.5rem] text-center text-text-primary tabular-nums">{score}</span>
            <button
                type="button"
                onClick={() => cast(-1)}
                aria-label="Downvote"
                aria-pressed={mine === -1}
                className={clsx(
                    'px-1.5 py-0.5 rounded hover:bg-fourth transition-colors',
                    mine === -1 ? 'text-accent-primary' : 'text-text-secondary',
                )}
            >
                ▼
            </button>
        </div>
    )
}
