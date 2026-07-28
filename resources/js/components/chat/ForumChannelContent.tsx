import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { Avatar } from '@/components/ui/Avatar'
import { MessageAttachments } from '@/components/chat/MessageAttachments'
import { MessageInput } from '@/components/chat/MessageInput'
import { CommentThread } from '@/components/chat/CommentThread'
import { VoteControl } from '@/components/messages/VoteControl'
import { fetchChannelMessages, fetchComments, fetchTopPosts } from '@/services/api'
import type { TopSortPeriod } from '@/services/api'
import type { Channel, Message, PaginatedMessages, User, VoteSummary } from '@/types'

interface Props {
    channel: Channel
    currentUser: User
}

const PERIODS: { value: TopSortPeriod; label: string }[] = [
    { value: 'hour', label: 'Past hour' },
    { value: 'day', label: 'Past day' },
    { value: 'week', label: 'Past week' },
    { value: 'month', label: 'Past month' },
    { value: 'all', label: 'All time' },
]

const fullTime = (iso: string) =>
    new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

/**
 * A forum channel's post list + detail view — composes the text and vote
 * Features, no primitive of its own (see docs/architecture-vision.md's "a
 * forum is not a new primitive" and docs/comments-and-voting.md). Sort
 * defaults to 'new' (plain chronological, reusing the same cursor list every
 * text channel uses); 'top' switches to the score-ranked, timeframe-filtered
 * offset contract (see services/api.ts's fetchTopPosts).
 */
export function ForumChannelContent({ channel, currentUser }: Props) {
    const [sort, setSort] = useState<'new' | 'top'>('new')
    const [period, setPeriod] = useState<TopSortPeriod>('day')
    const [posts, setPosts] = useState<Message[]>([])
    const [selected, setSelected] = useState<Message | null>(null)
    const [composing, setComposing] = useState(false)

    useEffect(() => {
        let cancelled = false
        const run = async () => {
            const result = sort === 'top'
                ? (await fetchTopPosts(channel.id, { period })).data
                : [...(await fetchChannelMessages(channel.id)).data].reverse()
            if (!cancelled) setPosts(result)
        }
        run()
        return () => { cancelled = true }
    }, [channel.id, sort, period])

    const onPostVoteChange = (postId: string, next: VoteSummary) => {
        setPosts((p) => p.map((post) => (post.id === postId ? { ...post, votes: next } : post)))
        setSelected((s) => (s && s.id === postId ? { ...s, votes: next } : s))
    }

    if (selected) {
        return (
            <PostDetail
                channel={channel}
                post={selected}
                currentUser={currentUser}
                onBack={() => setSelected(null)}
                onVoteChange={(next) => onPostVoteChange(selected.id, next)}
            />
        )
    }

    return (
        <div className="flex flex-col h-full overflow-y-auto">
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-panel-border">
                <div className="flex items-center gap-1 bg-second rounded-lg p-1">
                    <button
                        onClick={() => setSort('new')}
                        className={clsx(
                            'px-3 py-1 rounded-md text-sm transition-colors',
                            sort === 'new' ? 'bg-accent-primary text-inverse' : 'text-text-secondary hover:text-text-primary',
                        )}
                    >
                        New
                    </button>
                    <button
                        onClick={() => setSort('top')}
                        className={clsx(
                            'px-3 py-1 rounded-md text-sm transition-colors',
                            sort === 'top' ? 'bg-accent-primary text-inverse' : 'text-text-secondary hover:text-text-primary',
                        )}
                    >
                        Top
                    </button>
                    {sort === 'top' && (
                        <select
                            value={period}
                            onChange={(e) => setPeriod(e.target.value as TopSortPeriod)}
                            className="bg-transparent text-sm text-text-secondary rounded px-2 py-1 focus:outline-none"
                        >
                            {PERIODS.map((p) => (
                                <option key={p.value} value={p.value}>{p.label}</option>
                            ))}
                        </select>
                    )}
                </div>

                <button
                    onClick={() => setComposing((c) => !c)}
                    className="px-3 py-1.5 rounded-lg bg-accent-primary hover:bg-accent-secondary text-inverse text-sm font-medium"
                >
                    {composing ? 'Cancel' : '+ New post'}
                </button>
            </div>

            {composing && (
                <div className="px-6 pt-4">
                    <MessageInput
                        scopeId={channel.id}
                        scopeType="channel"
                        placeholder="Say more about it…"
                        replyTo={null}
                        onClearReply={() => {}}
                        showTitleField
                        onSent={(post) => {
                            setPosts((p) => [post, ...p])
                            setComposing(false)
                        }}
                    />
                </div>
            )}

            <div className="flex flex-col gap-3 p-6">
                {posts.length === 0 && !composing && (
                    <div className="text-center py-16">
                        <p className="text-3xl mb-2">📋</p>
                        <p className="text-text-primary font-semibold">No posts yet</p>
                        <p className="text-sm text-text-muted">Be the first to start a discussion.</p>
                    </div>
                )}

                {posts.map((post) => (
                    <button
                        key={post.id}
                        onClick={() => setSelected(post)}
                        className="flex items-start gap-3 p-4 rounded-lg bg-second hover:bg-third
                                   border-panel border-panel-border transition-colors text-left"
                    >
                        <div onClick={(e) => e.stopPropagation()} className="pt-0.5">
                            <VoteControl message={post} onChange={(next) => onPostVoteChange(post.id, next)} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <Avatar user={post.author!} size="sm" />
                                <span className="text-xs font-medium text-text-secondary">{post.author?.display_name}</span>
                                <span className="text-[11px] text-text-muted">{fullTime(post.created_at)}</span>
                            </div>
                            {post.title ? (
                                <p className="font-semibold text-text-primary">{post.title}</p>
                            ) : (
                                <p className="text-text-primary line-clamp-2">{post.content}</p>
                            )}
                            {!!post.attachments?.length && (
                                <p className="text-xs text-text-muted mt-1">📎 {post.attachments.length} attachment{post.attachments.length === 1 ? '' : 's'}</p>
                            )}
                            <p className="text-xs text-text-muted mt-1.5">
                                💬 {post.comment_count ? `${post.comment_count} comment${post.comment_count === 1 ? '' : 's'}` : 'No comments yet'}
                            </p>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    )
}

function PostDetail({
    channel,
    post,
    currentUser,
    onBack,
    onVoteChange,
}: {
    channel: Channel
    post: Message
    currentUser: User
    onBack: () => void
    onVoteChange: (next: VoteSummary) => void
}) {
    const [commentsInitial, setCommentsInitial] = useState<PaginatedMessages | null>(null)

    useEffect(() => {
        let cancelled = false
        fetchComments(post.id).then((page) => { if (!cancelled) setCommentsInitial(page) })
        return () => { cancelled = true }
    }, [post.id])

    return (
        <div className="flex flex-col h-full overflow-y-auto">
            <div className="px-6 pt-4">
                <button onClick={onBack} className="text-sm text-text-secondary hover:text-text-primary">
                    ← Back to posts
                </button>
            </div>

            <div className="flex items-start gap-4 px-6 py-4 border-b border-panel-border">
                <VoteControl message={post} onChange={onVoteChange} />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <Avatar user={post.author!} size="sm" />
                        <span className="text-sm font-medium text-text-secondary">{post.author?.display_name}</span>
                        <span className="text-[11px] text-text-muted">{fullTime(post.created_at)}</span>
                    </div>
                    {post.title && <h2 className="text-lg font-semibold text-text-primary mb-1">{post.title}</h2>}
                    <p className="text-text-primary leading-relaxed whitespace-pre-wrap break-words">{post.content}</p>
                    {!!post.attachments?.length && <MessageAttachments attachments={post.attachments} />}
                </div>
            </div>

            <div className="px-6 py-4">
                {commentsInitial && (
                    <CommentThread
                        parentId={post.id}
                        parentDepth={0}
                        initial={commentsInitial}
                        broadcastScope={{ id: channel.id, type: 'channel' }}
                        currentUserId={currentUser.id}
                        canComment
                    />
                )}
            </div>
        </div>
    )
}
