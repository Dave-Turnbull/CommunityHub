import { useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import { Head } from '@inertiajs/react'
import { RoomRail } from '@/components/layout/RoomRail'
import { ChannelSidebar } from '@/components/layout/ChannelSidebar'
import { MemberList } from '@/components/layout/MemberList'
import { MessageList } from '@/components/chat/MessageList'
import { MessageInput } from '@/components/chat/MessageInput'
import { VoiceChannelPanel } from '@/components/voice/VoiceChannelPanel'
import { useChat } from '@/hooks/useChat'
import { useChannelFocus } from '@/hooks/useChannelFocus'
import { useUI } from '@/stores'
import { subscribePresence } from '@/services/echo'
import { channelIcon, isTextCapableChannelType } from '@/types'
import type { Channel, ChannelPageProps, ChannelType, Message, User } from '@/types'

// Non-text-capable channel types render their own main-pane content instead
// of the chat UI — add a new type's panel here (and to
// Channel::TEXT_CAPABLE_TYPES on the backend if it should stay text-incapable
// too); nothing else in this file needs to change.
const CUSTOM_CHANNEL_PANELS: Partial<Record<ChannelType, ComponentType<{ channel: Channel; currentUser: User }>>> = {
    voice: VoiceChannelPanel,
}

export default function ChannelShow({
    auth, rooms, room, channel, members, messages: initial,
}: ChannelPageProps) {
    const [replyTo, setReplyTo] = useState<Message | null>(null)
    const isTextCapable = isTextCapableChannelType(channel.type)
    const CustomPanel = CUSTOM_CHANNEL_PANELS[channel.type]

    const { memberListOpen, toggleMemberList } = useUI()

    // useChat/useChannelFocus assume a text scope with a message history —
    // meaningless for a non-text-capable channel (see MessageController's
    // guard against posting/listing messages there), so skip
    // seeding/subscribing entirely.
    const { messages, loadMore, hasMore } = useChat({
        scopeId: channel.id,
        scopeType: 'channel',
        initial: initial ?? { data: [], has_more: false, next_cursor: null },
        enabled: isTextCapable,
    })

    useEffect(() => subscribePresence(), [])
    useChannelFocus(isTextCapable ? channel.id : null)

    return (
        <>
            <Head title={`${channelIcon(channel.type)} ${channel.name}`} />

            <div className="flex flex-col h-screen">
                <RoomRail rooms={rooms} currentUserId={auth.user.id} activeRoomId={room.id} />

                <div className="flex flex-1 min-h-0">
                    <ChannelSidebar
                        room={room}
                        channels={room.channels ?? []}
                        activeChannelId={channel.id}
                        currentUser={auth.user}
                    />

                    <main className="flex-1 flex flex-col bg-surface-600 min-w-0">
                        <header className="h-12 px-4 flex items-center gap-3 border-b border-surface-800 flex-shrink-0">
                            <span className="text-text-muted font-bold text-lg">{channelIcon(channel.type)}</span>
                            <span className="font-semibold text-text-primary">{channel.name}</span>

                            {channel.topic && (
                                <>
                                    <span className="w-px h-4 bg-surface-400" />
                                    <span className="text-sm text-text-muted truncate">{channel.topic}</span>
                                </>
                            )}

                            <button
                                onClick={toggleMemberList}
                                className="ml-auto p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-surface-500"
                                title="Toggle member list"
                            >
                                👥
                            </button>
                        </header>

                        {CustomPanel ? (
                            <CustomPanel channel={channel} currentUser={auth.user} />
                        ) : (
                            <>
                                <MessageList
                                    messages={messages}
                                    currentUser={auth.user}
                                    hasMore={hasMore}
                                    onLoadMore={loadMore}
                                    onReply={setReplyTo}
                                    emptyState={
                                        <div className="text-center">
                                            <p className="text-3xl mb-2">👋</p>
                                            <p className="text-text-primary font-semibold">
                                                Welcome to #{channel.name}
                                            </p>
                                            <p className="text-sm text-text-muted">
                                                This is the start of the channel.
                                            </p>
                                        </div>
                                    }
                                />

                                <MessageInput
                                    scopeId={channel.id}
                                    scopeType="channel"
                                    placeholder={`Message #${channel.name}`}
                                    replyTo={replyTo}
                                    onClearReply={() => setReplyTo(null)}
                                />
                            </>
                        )}
                    </main>

                    {memberListOpen && <MemberList members={members} />}
                </div>
            </div>
        </>
    )
}
