import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { Head } from '@inertiajs/react'
import { RoomRail } from '@/components/layout/RoomRail'
import { ChannelSidebar } from '@/components/layout/ChannelSidebar'
import { MemberList } from '@/components/layout/MemberList'
import { ChannelPermissionsPanel } from '@/components/layout/ChannelPermissionsPanel'
import { CreateChannelPanel } from '@/components/layout/CreateChannelPanel'
import { InvitePanel } from '@/components/layout/InvitePanel'
import { RoomSettingsPanel } from '@/components/layout/RoomSettingsPanel'
import { RoomRolesPanel } from '@/components/roles/RoomRolesPanel'
import { useChannelFocus } from '@/hooks/useChannelFocus'
import { useMarkRead } from '@/hooks/useMarkRead'
import { useChannels, useUI } from '@/stores'
import { channelTypeDescriptor, isTextCapableChannelType } from '@/services/channelTypes'
import type { ChannelPageProps, MainView } from '@/types'

const VIEW_ICONS = { roles: '🛡', 'create-channel': '+', invite: '✉', 'room-settings': '⚙' }
const VIEW_LABELS = { roles: 'Roles', 'create-channel': 'Create channel', invite: 'Invite people', 'room-settings': 'Room settings' }

export default function ChannelShow({
    auth, rooms, room, channel: initialChannel, members, messages: initial, highlight_message_id, creatable_channel_types,
    can_manage_roles, can_manage_channels, can_manage_channel_visibility, can_manage_members, can_ban_members, can_manage_room, can_delete_room,
    recentCustomStatuses,
}: ChannelPageProps) {
    const [channel, setChannel] = useState(initialChannel)
    const [mainView, setMainView] = useState<MainView>({ type: 'channel' })
    const [visibilityOpen, setVisibilityOpen] = useState(false)
    const headerRef = useRef<HTMLDivElement>(null)

    const isTextCapable = isTextCapableChannelType(channel.type)
    const descriptor = channelTypeDescriptor(channel.type)
    const Content = descriptor.Content

    const { memberListOpen, toggleMemberList } = useUI()
    const { addChannel } = useChannels()
    const channelName = useChannels((s) => s.channels[room.id]?.find((c) => c.id === channel.id)?.name ?? channel.name)

    useChannelFocus(isTextCapable ? channel.id : null)
    useMarkRead('channel', isTextCapable ? channel.id : null)

    const showChannel = () => setMainView({ type: 'channel' })

    // Click-outside-to-close for the inline visibility panel below — it's a
    // normal block in the document flow (not a Radix Popover/Portal), so
    // there's no built-in dismiss-on-outside-click to lean on.
    useEffect(() => {
        if (!visibilityOpen) return

        const handleClick = (e: MouseEvent) => {
            if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
                setVisibilityOpen(false)
            }
        }

        document.addEventListener('mousedown', handleClick)
        return () => document.removeEventListener('mousedown', handleClick)
    }, [visibilityOpen])

    // The visibility panel only has a header to attach to on the 'channel'
    // view — collapse it when swapping to one of the other mainView panels.
    useEffect(() => {
        if (mainView.type !== 'channel') setVisibilityOpen(false)
    }, [mainView.type])

    return (
        <>
            <Head title={mainView.type === 'channel' ? `${descriptor.icon} ${channelName}` : channelName} />

            <div className="flex flex-col h-screen">
                <RoomRail rooms={rooms} currentUserId={auth.user.id} activeRoomId={room.id} />

                <div className="flex flex-1 min-h-0">
                    <ChannelSidebar
                        room={room}
                        channels={room.channels ?? []}
                        activeChannelId={channel.id}
                        activeView={mainView}
                        currentUser={auth.user}
                        recentCustomStatuses={recentCustomStatuses}
                        creatableChannelTypes={creatable_channel_types}
                        canManageRoles={can_manage_roles}
                        canManageChannels={can_manage_channels}
                        onSelectRoles={() => setMainView({ type: 'roles' })}
                        onSelectCreateChannel={() => setMainView({ type: 'create-channel' })}
                        onSelectInvite={() => setMainView({ type: 'invite' })}
                        onSelectRoomSettings={() => setMainView({ type: 'room-settings' })}
                    />

                    <main className="flex-1 flex flex-col bg-primary min-w-0">
                        {mainView.type === 'channel' ? (
                            <div ref={headerRef} className="relative border-b border-third flex-shrink-0">
                                <header className="h-12 px-4 flex items-center gap-3">
                                    <span className="text-text-muted font-bold text-lg">{descriptor.icon}</span>
                                    <span className="font-semibold text-text-primary">{channelName}</span>

                                    {channel.topic && (
                                        <>
                                            <span className="w-px h-4 bg-sixth" />
                                            <span className="text-sm text-text-muted truncate">{channel.topic}</span>
                                        </>
                                    )}

                                    {can_manage_channel_visibility && (
                                        <button
                                            onClick={() => setVisibilityOpen((open) => !open)}
                                            className={clsx(
                                                'p-1.5 rounded transition-colors duration-100',
                                                visibilityOpen
                                                    ? 'bg-sixth text-text-primary'
                                                    : 'text-text-muted hover:text-text-primary hover:bg-fifth',
                                            )}
                                            title="Channel permissions"
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

                                {visibilityOpen && (
                                    <div className="absolute top-full left-0 right-0 z-20 shadow-lg">
                                        <ChannelPermissionsPanel
                                            channel={channel}
                                            roomRoles={room.roles ?? []}
                                            onUpdated={setChannel}
                                            onClose={() => setVisibilityOpen(false)}
                                        />
                                    </div>
                                )}
                            </div>
                        ) : (
                            <header className="h-12 px-4 flex items-center gap-3 border-b border-third flex-shrink-0">
                                <span className="font-bold text-lg">
                                    {VIEW_ICONS[mainView.type]}
                                </span>
                                <span className="font-semibold text-text-primary">
                                    {VIEW_LABELS[mainView.type]}
                                </span>

                                <button
                                    onClick={showChannel}
                                    className="ml-auto p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-fifth"
                                    title={`Back to ${channelName}`}
                                >
                                    ✕
                                </button>
                            </header>
                        )}

                        {mainView.type === 'channel' && (
                            Content ? (
                                <Content
                                    channel={channel}
                                    currentUser={auth.user}
                                    initialMessages={initial}
                                    initialHighlightMessageId={highlight_message_id}
                                />
                            ) : (
                                <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
                                    This channel type has no features enabled.
                                </div>
                            )
                        )}
                        {mainView.type === 'roles' && <RoomRolesPanel room={room} />}
                        {mainView.type === 'create-channel' && (
                            <CreateChannelPanel
                                room={room}
                                creatableTypes={creatable_channel_types}
                                onClose={showChannel}
                                onCreated={(created) => {
                                    addChannel(room.id, created)
                                    showChannel()
                                }}
                            />
                        )}
                        {mainView.type === 'invite' && <InvitePanel room={room} onClose={showChannel} />}
                        {mainView.type === 'room-settings' && (
                            <RoomSettingsPanel
                                room={room}
                                currentUserId={auth.user.id}
                                canManageRoom={can_manage_room}
                                canDeleteRoom={can_delete_room}
                            />
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
        </>
    )
}
