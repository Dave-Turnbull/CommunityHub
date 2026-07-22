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

    const { messages, loadMore, hasMore } = useChat({ scopeId, scopeType, initial: initialMessages })

    return (
        <>
            <MessageList
                messages={messages}
                currentUser={currentUser}
                hasMore={hasMore}
                onLoadMore={loadMore}
                onReply={setReplyTo}
                emptyState={emptyState}
            />

            <MessageInput
                scopeId={scopeId}
                scopeType={scopeType}
                placeholder={placeholder}
                replyTo={replyTo}
                onClearReply={() => setReplyTo(null)}
            />
        </>
    )
}
