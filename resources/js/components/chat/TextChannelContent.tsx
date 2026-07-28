import { useState } from 'react'
import type { ReactNode } from 'react'
import { MessageList } from '@/components/chat/MessageList'
import { MessageInput } from '@/components/chat/MessageInput'
import { useChat } from '@/hooks/useChat'
import type { Message, PaginatedMessages, User } from '@/types'

interface Props {
    scopeId: string
    scopeType: 'channel' | 'conversation'
    currentUser: User
    initialMessages: PaginatedMessages
    placeholder: string
    emptyState: ReactNode
    /**
     * A message to land on and flash as soon as this scope mounts — set by a
     * "go to message" direct link (Web\MessageController redirects here with
     * ?message=, which is also why `initialMessages` already centers on it
     * rather than the live tail). See CLAUDE.md and
     * docs/messages-and-pagination.md.
     */
    initialHighlightMessageId?: string | null
    /**
     * Whether the viewer may post here — defaults to true. `false` is only
     * ever passed for an 'announcement' channel the viewer lacks
     * PostAnnouncements for (see Channel.can_post/ChannelPolicy::post); the
     * composer is omitted entirely rather than rendered disabled, since
     * there's nothing the viewer can do to unlock it from here. The jump-to-
     * present control is unaffected — it's not part of "posting" — see
     * below. The real enforcement is server-side
     * (TextMessageService::authorizeSend) — this is only the affordance.
     */
    canPost?: boolean
    /**
     * Shows an inline "comment" affordance under each message — used by the
     * `message_and_comment` channel type (see docs/comments-and-voting.md).
     * Omitted/false for every other type, matching `comments_enabled` being
     * off by default. `maxCommentDepth` mirrors the channel's setting (1
     * disables replying to a comment — `message_and_comment`'s default).
     */
    commentsEnabled?: boolean
    maxCommentDepth?: number | null
}

/**
 * The "text" Feature's frontend piece — owns its own useChat() subscription
 * rather than the page calling it, so any registered type (or a hybrid
 * type composing this alongside voice) can drop this in without the page
 * needing to know it's there. Mirrors App\Support\Capabilities\TextFeature
 * on the backend, which is what actually gates whether a given channel/
 * conversation is allowed to use it.
 */
export function TextChannelContent({
    scopeId, scopeType, currentUser, initialMessages, placeholder, emptyState, initialHighlightMessageId, canPost = true,
    commentsEnabled = false, maxCommentDepth = null,
}: Props) {
    const [replyTo, setReplyTo] = useState<Message | null>(null)
    // Bumped per jump so MessageList re-pins to the bottom even when two jumps
    // in a row resolve to the same window.
    const [jumpToken, setJumpToken] = useState(0)
    // The "go to message" landing target — see MessageList's scrollTo prop.
    const [highlight, setHighlight] = useState<{ id: string; token: number } | null>(
        initialHighlightMessageId ? { id: initialHighlightMessageId, token: 0 } : null
    )

    const { messages, hasOlder, hasNewer, loadOlder, loadNewer, jumpToPresent, jumpToMessage, commitSent } =
        useChat({ scopeId, scopeType, initial: initialMessages })

    const jump = () => {
        setJumpToken((t) => t + 1)
        jumpToPresent()
    }

    // Only while the window has been trimmed away from the live tail — i.e.
    // exactly when there are messages below the ones on screen that this tab
    // isn't holding. See useChat. Independent of `canPost` — jumping to the
    // present is not a posting action, so it must keep working (e.g. in an
    // announcement channel) even when the composer itself is hidden.
    const jumpButton = hasNewer && (
        <button
            onClick={jump}
            title="Jump to present"
            aria-label="Jump to present"
            className="mb-0.5 w-9 h-9 flex-shrink-0 grid place-items-center rounded-lg bg-fifth
                       border-panel border-panel-border text-text-secondary hover:text-text-primary"
        >
            ⬇
        </button>
    )

    // Fetches the message's window if it isn't already loaded (useChat's
    // job), then tells MessageList where to scroll and flash (this
    // component's job — see CLAUDE.md's "go to message").
    const jumpToMessageAndHighlight = async (messageId: string) => {
        await jumpToMessage(messageId)
        setHighlight((h) => ({ id: messageId, token: (h?.token ?? 0) + 1 }))
    }

    return (
        <>
            <MessageList
                messages={messages}
                scopeId={scopeId}
                currentUser={currentUser}
                hasOlder={hasOlder}
                hasNewer={hasNewer}
                onLoadOlder={loadOlder}
                onLoadNewer={loadNewer}
                jumpToken={jumpToken}
                onReply={setReplyTo}
                onJumpToMessage={jumpToMessageAndHighlight}
                scrollTo={highlight}
                emptyState={emptyState}
                commentsEnabled={commentsEnabled}
                maxCommentDepth={maxCommentDepth}
                broadcastScope={{ id: scopeId, type: scopeType }}
            />

            {canPost ? (
                <MessageInput
                    scopeId={scopeId}
                    scopeType={scopeType}
                    placeholder={placeholder}
                    replyTo={replyTo}
                    onClearReply={() => setReplyTo(null)}
                    onSent={commitSent}
                    leading={jumpButton}
                />
            ) : (
                // No composer at all when the viewer can't post — but the
                // jump-to-present affordance isn't part of "posting", so it
                // still needs somewhere to render without MessageInput's
                // `leading` slot to hold it.
                jumpButton && <div className="px-4 pb-4 flex-shrink-0 flex justify-end">{jumpButton}</div>
            )}
        </>
    )
}
