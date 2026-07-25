import { useState } from 'react'
import { Head } from '@inertiajs/react'
import { RoomRail } from '@/components/layout/RoomRail'
import { DMSidebar } from '@/components/layout/DMSidebar'
import { AddParticipantsModal } from '@/components/messages/AddParticipantsModal'
import { Avatar } from '@/components/ui/Avatar'
import { channelTypeDescriptor } from '@/services/channelTypes'
import type { DMPageProps } from '@/types'

export default function DMShow({
    auth, rooms, conversations, conversation, messages: initial, recentCustomStatuses,
}: DMPageProps) {
    const [addingPeople, setAddingPeople] = useState(false)

    const other = conversation.participants?.find((p) => p.user_id !== auth.user.id)

    const name = conversation.type === 'group'
        ? (conversation.name ?? 'Group Chat')
        : (other?.user?.display_name ?? 'Unknown')

    // Every Conversation resolves through the one registered 'conversation'
    // type (HybridConversationType on the backend) — see services/channelTypes.tsx.
    const Content = channelTypeDescriptor('conversation').Content

    return (
        <>
            <Head title={name} />

            <div className="flex flex-col h-screen">
                <RoomRail rooms={rooms} currentUserId={auth.user.id} />

                <div className="flex flex-1 min-h-0">
                    <DMSidebar
                        conversations={conversations}
                        currentUser={auth.user}
                        recentCustomStatuses={recentCustomStatuses}
                        activeConversationId={conversation.id}
                    />

                    <main className="flex-1 flex flex-col bg-surface-canvas min-w-0">
                        <header className="h-12 px-4 flex items-center gap-3 border-b border-surface-inset flex-shrink-0">
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

                        {Content && (
                            <Content conversation={conversation} currentUser={auth.user} initialMessages={initial} />
                        )}
                    </main>
                </div>
            </div>
        </>
    )
}
