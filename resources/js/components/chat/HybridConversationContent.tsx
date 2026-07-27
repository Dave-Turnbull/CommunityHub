import { VoiceBar } from '@/components/voice/VoiceBar'
import { TextChannelContent } from '@/components/chat/TextChannelContent'
import type { Conversation, PaginatedMessages, User } from '@/types'

interface Props {
    conversation: Conversation
    currentUser: User
    initialMessages: PaginatedMessages
    initialHighlightMessageId?: string | null
}

/**
 * The registered Content for the 'conversation' type (HybridConversationType
 * on the backend) — composes the voice Feature's bar above the text
 * Feature's thread, the same layout DM/Show.tsx used to hand-build as a
 * one-off page. Every dm/group Conversation grants both 'text.all' and
 * 'voice.all' via HybridConversationType, so both pieces always render.
 */
export function HybridConversationContent({
    conversation, currentUser, initialMessages, initialHighlightMessageId,
}: Props) {
    const other = conversation.participants?.find((p) => p.user_id !== currentUser.id)
    const name = conversation.type === 'group'
        ? (conversation.name ?? 'Group Chat')
        : (other?.user?.display_name ?? 'Unknown')

    return (
        <>
            <VoiceBar conversation={conversation} currentUser={currentUser} />
            <TextChannelContent
                scopeId={conversation.id}
                scopeType="conversation"
                currentUser={currentUser}
                initialMessages={initialMessages}
                initialHighlightMessageId={initialHighlightMessageId}
                placeholder={`Message ${name}`}
                emptyState={
                    <div className="text-center">
                        <p className="text-text-primary font-semibold">
                            This is the beginning of your conversation with {name}.
                        </p>
                    </div>
                }
            />
        </>
    )
}
