import { useState } from 'react'
import { Head } from '@inertiajs/react'
import { RoomRail } from '@/components/layout/RoomRail'
import { ChannelSidebar } from '@/components/layout/ChannelSidebar'
import { MemberList } from '@/components/layout/MemberList'
import { ChannelVisibilityModal } from '@/components/layout/ChannelVisibilityModal'
import { useChannelFocus } from '@/hooks/useChannelFocus'
import { useUI } from '@/stores'
import { channelTypeDescriptor, isTextCapableChannelType } from '@/services/channelTypes'
import type { ChannelPageProps } from '@/types'

export default function ChannelShow({
    auth, rooms, room, channel: initialChannel, members, messages: initial, can_manage_channels, can_manage_roles,
    can_manage_channel_visibility, can_manage_members, can_ban_members, recentCustomStatuses,
}: ChannelPageProps) {
    const [channel, setChannel] = useState(initialChannel)
    const [editingVisibility, setEditingVisibility] = useState(false)

    const isTextCapable = isTextCapableChannelType(channel.type)
    const descriptor = channelTypeDescriptor(channel.type)
    const Content = descriptor.Content

    const { memberListOpen, toggleMemberList } = useUI()

    useChannelFocus(isTextCapable ? channel.id : null)

    return (
        <>
            <Head title={`${descriptor.icon} ${channel.name}`} />

            <div className="flex flex-col h-screen">
                <RoomRail rooms={rooms} currentUserId={auth.user.id} activeRoomId={room.id} />

                <div className="flex flex-1 min-h-0">
                    <ChannelSidebar
                        room={room}
                        channels={room.channels ?? []}
                        activeChannelId={channel.id}
                        currentUser={auth.user}
                        recentCustomStatuses={recentCustomStatuses}
                        canManageChannels={can_manage_channels}
                        canManageRoles={can_manage_roles}
                    />

                    <main className="flex-1 flex flex-col bg-primary min-w-0">
                        <header className="h-12 px-4 flex items-center gap-3 border-b border-third flex-shrink-0">
                            <span className="text-text-muted font-bold text-lg">{descriptor.icon}</span>
                            <span className="font-semibold text-text-primary">{channel.name}</span>

                            {channel.topic && (
                                <>
                                    <span className="w-px h-4 bg-sixth" />
                                    <span className="text-sm text-text-muted truncate">{channel.topic}</span>
                                </>
                            )}

                            {can_manage_channel_visibility && (
                                <button
                                    onClick={() => setEditingVisibility(true)}
                                    className="p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-fifth"
                                    title="Channel visibility"
                                >
                                    🔒
                                </button>
                            )}

                            <button
                                onClick={toggleMemberList}
                                className="ml-auto p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-fifth"
                                title="Toggle member list"
                            >
                                👥
                            </button>
                        </header>

                        {Content ? (
                            <Content channel={channel} currentUser={auth.user} initialMessages={initial} />
                        ) : (
                            <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
                                This channel type has no features enabled.
                            </div>
                        )}
                    </main>

                    {memberListOpen && (
                        <MemberList
                            members={members}
                            roomId={room.id}
                            currentUserId={auth.user.id}
                            canManageMembers={can_manage_members}
                            canBanMembers={can_ban_members}
                        />
                    )}
                </div>
            </div>

            {editingVisibility && (
                <ChannelVisibilityModal
                    channel={channel}
                    roomRoles={room.roles ?? []}
                    onClose={() => setEditingVisibility(false)}
                    onUpdated={setChannel}
                />
            )}
        </>
    )
}
