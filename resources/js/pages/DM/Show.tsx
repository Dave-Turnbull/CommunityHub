import { useEffect, useState } from 'react'
import { Head } from '@inertiajs/react'
import { RoomRail } from '@/components/layout/RoomRail'
import { DMSidebar } from '@/components/layout/DMSidebar'
import { MessageList } from '@/components/chat/MessageList'
import { MessageInput } from '@/components/chat/MessageInput'
import { AddParticipantsModal } from '@/components/messages/AddParticipantsModal'
import { VoiceBar } from '@/components/voice/VoiceBar'
import { Avatar } from '@/components/ui/Avatar'
import { useChat } from '@/hooks/useChat'
import { subscribePresence } from '@/services/echo'
import type { DMPageProps, Message } from '@/types'

export default function DMShow({
    auth, rooms, conversations, conversation, messages: initial,
}: DMPageProps) {
    const [replyTo, setReplyTo] = useState<Message | null>(null)
    const [addingPeople, setAddingPeople] = useState(false)

    const { messages, loadMore, hasMore } = useChat({
        scopeId: conversation.id,
        scopeType: 'conversation',
        initial,
    })

    useEffect(() => subscribePresence(), [])

    const other = conversation.participants?.find((p) => p.user_id !== auth.user.id)

    const name = conversation.type === 'group'
        ? (conversation.name ?? 'Group Chat')
        : (other?.user?.display_name ?? 'Unknown')

    return (
        <>
            <Head title={name} />

            <div className="flex flex-col h-screen">
                <RoomRail rooms={rooms} currentUserId={auth.user.id} />

                <div className="flex flex-1 min-h-0">
                    <DMSidebar
                        conversations={conversations}
                        currentUser={auth.user}
                        activeConversationId={conversation.id}
                    />

                    <main className="flex-1 flex flex-col bg-surface-600 min-w-0">
                        <header className="h-12 px-4 flex items-center gap-3 border-b border-surface-800 flex-shrink-0">
                            {conversation.type === 'dm' && other?.user ? (
                                <Avatar user={other.user} size="sm" showStatus />
                            ) : (
                                <span className="text-xl">👥</span>
                            )}

                            <span className="font-semibold text-text-primary">{name}</span>

                            {conversation.type === 'group' && (
                                <>
                                    <span className="text-xs text-text-muted">
                                        {conversation.participants?.length ?? 0} members
                                    </span>
                                    <button
                                        onClick={() => setAddingPeople(true)}
                                        className="ml-auto text-xs font-medium text-text-muted hover:text-text-primary transition-colors duration-100"
                                    >
                                        Add people
                                    </button>
                                </>
                            )}
                        </header>

                        {addingPeople && (
                            <AddParticipantsModal
                                conversation={conversation}
                                onClose={() => setAddingPeople(false)}
                            />
                        )}

                        <VoiceBar conversation={conversation} currentUser={auth.user} />

                        <MessageList
                            messages={messages}
                            currentUser={auth.user}
                            hasMore={hasMore}
                            onLoadMore={loadMore}
                            onReply={setReplyTo}
                            emptyState={
                                <div className="text-center">
                                    <p className="text-text-primary font-semibold">
                                        This is the beginning of your conversation with {name}.
                                    </p>
                                </div>
                            }
                        />

                        <MessageInput
                            scopeId={conversation.id}
                            scopeType="conversation"
                            placeholder={`Message ${name}`}
                            replyTo={replyTo}
                            onClearReply={() => setReplyTo(null)}
                        />
                    </main>
                </div>
            </div>
        </>
    )
}
