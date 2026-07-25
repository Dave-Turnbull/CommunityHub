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
    scopeId, scopeType, currentUser, initialMessages, placeholder, emptyState,
}: Props) {
    const [replyTo, setReplyTo] = useState<Message | null>(null)
    // Bumped per jump so MessageList re-pins to the bottom even when two jumps
    // in a row resolve to the same window.
    const [jumpToken, setJumpToken] = useState(0)

    const { messages, hasOlder, hasNewer, loadOlder, loadNewer, jumpToPresent, commitSent } =
        useChat({ scopeId, scopeType, initial: initialMessages })

    const jump = () => {
        setJumpToken((t) => t + 1)
        jumpToPresent()
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
                emptyState={emptyState}
            />

            <MessageInput
                scopeId={scopeId}
                scopeType={scopeType}
                placeholder={placeholder}
                replyTo={replyTo}
                onClearReply={() => setReplyTo(null)}
                onSent={commitSent}
                // Only while the window has been trimmed away from the live
                // tail — i.e. exactly when there are messages below the ones
                // on screen that this tab isn't holding. See useChat.
                leading={hasNewer && (
                    <button
                        onClick={jump}
                        className="mb-0.5 px-3 py-2 rounded-lg bg-fifth border-panel border-panel-border
                                   text-xs text-text-secondary hover:text-text-primary whitespace-nowrap"
                    >
                        ↓ Jump to present
                    </button>
                )}
            />
        </>
    )
}
