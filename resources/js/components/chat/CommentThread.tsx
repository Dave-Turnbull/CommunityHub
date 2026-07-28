import { useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { MessageInput } from '@/components/chat/MessageInput'
import { VoteControl } from '@/components/messages/VoteControl'
import { useChat } from '@/hooks/useChat'
import { useMessages } from '@/stores'
import type { Message, PaginatedMessages, VoteSummary } from '@/types'

interface BroadcastScope {
    id: string
    type: 'channel' | 'conversation'
}

interface CommentThreadProps {
    /** The message whose children this renders — a post or another comment. */
    parentId: string
    /** This parent's own nesting depth (0 for a post) — determines whether
     *  *this* thread's composer may add one more level. See maxDepth. */
    parentDepth: number
    initial: PaginatedMessages
    broadcastScope: BroadcastScope
    currentUserId: string
    canComment: boolean
    /**
     * Deepest a comment may nest — null (the default everywhere except
     * `message_and_comment`) means unlimited. 1 means only top-level
     * comments on the root message are allowed; a reply to a comment would
     * land at depth 2 and is hidden entirely rather than shown disabled —
     * see docs/comments-and-voting.md.
     */
    maxDepth?: number | null
}

/**
 * One message's top-level comments, each collapsed by default behind a
 * reply-count affordance — expanding one lazily fetches and mounts another
 * CommentThread for *its* children. This recursive shape, not a
 * depth-specific component, is what delivers "comments can have comments"
 * while never fetching an unbounded subtree at once. See
 * docs/comments-and-voting.md.
 */
export function CommentThread({
    parentId, parentDepth, initial, broadcastScope, currentUserId, canComment, maxDepth = null,
}: CommentThreadProps) {
    const { messages, hasOlder, loadOlder, commitSent } = useChat({
        scopeId: parentId,
        scopeType: 'message',
        initial,
        broadcastScope,
    })

    const canReplyHere = canComment && (maxDepth === null || parentDepth < maxDepth)

    return (
        <div className="flex flex-col gap-3 pl-4 border-l-2 border-panel-border">
            {hasOlder && (
                <button
                    type="button"
                    onClick={loadOlder}
                    className="text-xs text-text-secondary hover:text-text-primary self-start"
                >
                    Load earlier comments
                </button>
            )}

            {messages.map((comment) => (
                <CommentRow
                    key={comment.id}
                    comment={comment}
                    broadcastScope={broadcastScope}
                    currentUserId={currentUserId}
                    canComment={canComment}
                    maxDepth={maxDepth}
                />
            ))}

            {canReplyHere && (
                <MessageInput
                    scopeId={parentId}
                    scopeType="message"
                    placeholder="Write a comment…"
                    replyTo={null}
                    onClearReply={() => {}}
                    onSent={commitSent}
                />
            )}
        </div>
    )
}

function CommentRow({
    comment,
    broadcastScope,
    currentUserId,
    canComment,
    maxDepth,
}: {
    comment: Message
    broadcastScope: BroadcastScope
    currentUserId: string
    canComment: boolean
    maxDepth: number | null
}) {
    const [expanded, setExpanded] = useState(false)
    const [childInitial, setChildInitial] = useState<PaginatedMessages | null>(null)
    const [loading, setLoading] = useState(false)
    const patchMessage = useMessages((s) => s.update)

    // A reply to this comment would land at comment.depth + 1 — if that
    // exceeds maxDepth, there is nothing to expand into and no way to add
    // one, so the affordance is hidden entirely rather than shown disabled.
    const canNestFurther = maxDepth === null || comment.depth! < maxDepth

    const onVoteChange = (next: VoteSummary) => {
        patchMessage(comment.parent_message_id!, { ...comment, votes: next })
    }

    const expand = async () => {
        if (expanded) {
            setExpanded(false)
            return
        }

        if (!childInitial) {
            setLoading(true)
            try {
                const { fetchComments } = await import('@/services/api')
                setChildInitial(await fetchComments(comment.id))
            } finally {
                setLoading(false)
            }
        }

        setExpanded(true)
    }

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-start gap-2">
                <Avatar user={comment.author!} size="sm" />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text-primary">
                            {comment.author?.display_name}
                        </span>
                        <VoteControl message={comment} onChange={onVoteChange} />
                    </div>
                    <p className="text-sm text-text-secondary leading-relaxed break-words whitespace-pre-wrap">
                        {comment.is_tombstoned ? <em className="text-text-muted">[deleted]</em> : comment.content}
                    </p>
                    {canNestFurther && (
                        <button
                            type="button"
                            onClick={expand}
                            disabled={loading}
                            className="text-xs text-text-secondary hover:text-text-primary"
                        >
                            {loading ? 'Loading…' : expanded ? 'Hide replies' : (comment.comment_count ? `${comment.comment_count} ${comment.comment_count === 1 ? 'reply' : 'replies'}` : 'Reply')}
                        </button>
                    )}
                </div>
            </div>

            {expanded && childInitial && canNestFurther && (
                <CommentThread
                    parentId={comment.id}
                    parentDepth={comment.depth!}
                    initial={childInitial}
                    broadcastScope={broadcastScope}
                    currentUserId={currentUserId}
                    canComment={canComment}
                    maxDepth={maxDepth}
                />
            )}
        </div>
    )
}
