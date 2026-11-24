import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { Link, router } from '@inertiajs/react'
import { UserPanel } from './UserPanel'
import { ChannelRowMenu } from './ChannelRowMenu'
import { channelTypeDescriptor, orderedTypesIn } from '@/services/channelTypes'
import { deleteChannel, reorderChannels, updateChannel } from '@/services/api'
import { subscribeRoomChannels } from '@/services/echo'
import { describeApiError } from '@/services/errorMessages'
import { useChannels } from '@/stores'
import type { Channel, MainView, RecentCustomStatus, Room, User } from '@/types'

interface Props {
    room: Room
    channels: Channel[]
    activeChannelId: string
    activeView: MainView
    currentUser: User
    recentCustomStatuses: RecentCustomStatus[]
    creatableChannelTypes?: string[]
    canManageRoles?: boolean
    canManageChannels?: boolean
    onSelectRoles: () => void
    onSelectCreateChannel: () => void
    onSelectInvite: () => void
}

function DefaultChannelRow({ channel, active }: { channel: Channel; active: boolean }) {
    const descriptor = channelTypeDescriptor(channel.type)

    return (
        <Link
            href={`/channels/${channel.id}`}
            className={clsx(
                'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors duration-100',
                active
                    ? 'bg-sixth text-text-primary'
                    : 'text-text-secondary hover:text-text-primary hover:bg-fifth',
            )}
        >
            <span className="text-text-muted">{descriptor.icon}</span>
            <span className="truncate">{channel.name}</span>
        </Link>
    )
}

export function ChannelSidebar({
    room, channels, activeChannelId, activeView, currentUser, recentCustomStatuses,
    creatableChannelTypes = [], canManageRoles, canManageChannels, onSelectRoles, onSelectCreateChannel, onSelectInvite,
}: Props) {
    const list = useChannels((s) => s.channels[room.id] ?? channels)
    const { setChannels, updateChannel: storeUpdateChannel, removeChannel } = useChannels()
    const [renamingId, setRenamingId] = useState<string | null>(null)
    const [draft, setDraft] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const renameInput = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (renamingId) renameInput.current?.select()
    }, [renamingId])

    // Re-seed from the page's fresh `channels` prop on every navigation to
    // this room, then let subscribeRoomChannels() keep it live from there.
    useEffect(() => {
        setChannels(room.id, channels)
    }, [room.id])

    useEffect(() => subscribeRoomChannels(room.id), [room.id])

    const startRename = (c: Channel) => {
        setError(null)
        setDraft(c.name)
        setRenamingId(c.id)
    }

    const cancelRename = () => {
        if (!busy) setRenamingId(null)
    }

    const commitRename = async (c: Channel) => {
        const name = draft.trim()
        if (!name || name === c.name) {
            setRenamingId(null)
            return
        }

        setBusy(true)
        try {
            const updated = await updateChannel(c.id, { name })
            storeUpdateChannel(room.id, { ...c, ...updated })
            setRenamingId(null)
        } catch (e) {
            setError(describeApiError(e, 'Renaming the channel'))
        } finally {
            setBusy(false)
        }
    }

    const move = async (c: Channel, direction: -1 | 1) => {
        const group = list.filter((x) => x.type === c.type)
        const neighbor = group[group.indexOf(c) + direction]
        if (!neighbor) return

        const reordered = [...list]
        const a = reordered.indexOf(c)
        const b = reordered.indexOf(neighbor)
        ;[reordered[a], reordered[b]] = [reordered[b], reordered[a]]

        setError(null)
        try {
            await reorderChannels(room.id, reordered.map((x) => x.id))
            setChannels(room.id, reordered.map((x, position) => ({ ...x, position })))
        } catch (e) {
            setError(describeApiError(e, 'Reordering channels'))
        }
    }

    const remove = async (c: Channel) => {
        if (!window.confirm(`Delete #${c.name}? This permanently removes the channel and its messages.`)) return

        setError(null)
        try {
            await deleteChannel(c.id)
            removeChannel(room.id, c.id)
            if (c.id === activeChannelId) router.visit(`/rooms/${room.id}`)
        } catch (e) {
            setError(describeApiError(e, 'Deleting the channel'))
        }
    }

    return (
        <div className="w-sidebar-channel bg-second border-r-panel border-panel-border flex flex-col flex-shrink-0">
            <div className="h-12 px-4 flex items-center justify-between gap-2 border-b border-third flex-shrink-0">
                <span className="font-semibold text-text-primary truncate">{room.name}</span>
                <div className="flex items-center gap-1 flex-shrink-0">
                    {canManageRoles && (
                        <button
                            onClick={onSelectRoles}
                            title="Manage roles"
                            className={clsx(
                                'p-1 rounded transition-colors duration-100',
                                activeView.type === 'roles'
                                    ? 'bg-sixth text-text-primary'
                                    : 'text-text-muted hover:text-text-primary',
                            )}
                        >
                            🛡
                        </button>
                    )}
                    {creatableChannelTypes.length > 0 && (
                        <button
                            onClick={onSelectCreateChannel}
                            title="Add channel"
                            className={clsx(
                                'p-1 rounded text-lg leading-none transition-colors duration-100',
                                activeView.type === 'create-channel'
                                    ? 'bg-sixth text-text-primary'
                                    : 'text-text-muted hover:text-text-primary',
                            )}
                        >
                            +
                        </button>
                    )}
                    <button
                        onClick={onSelectInvite}
                        title="Invite people"
                        className={clsx(
                            'p-1 rounded transition-colors duration-100',
                            activeView.type === 'invite'
                                ? 'bg-sixth text-text-primary'
                                : 'text-text-muted hover:text-text-primary',
                        )}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path d="M11 4a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM3 15.5c0-2.5 2.5-4 5-4s5 1.5 5 4v.5H3v-.5ZM15.5 7v2h2v1.5h-2v2H14v-2h-2V9h2V7h1.5Z" />
                        </svg>
                    </button>
                </div>
            </div>

            <nav className="flex-1 min-h-0 overflow-y-auto p-2 select-none">
                {error && <p className="px-2 mb-2 text-xs text-danger">{error}</p>}
                {orderedTypesIn(list.map((c) => c.type)).map((type) => {
                    const group = list.filter((c) => c.type === type)
                    const descriptor = channelTypeDescriptor(type)
                    const SidebarItem = descriptor.SidebarItem

                    return (
                        <div key={type} className="mb-4">
                            <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                                {descriptor.label}
                            </p>

                            {group.map((c, index, arr) => {
                                const active = activeView.type === 'channel' && c.id === activeChannelId

                                if (renamingId === c.id) {
                                    return (
                                        <input
                                            key={c.id}
                                            ref={renameInput}
                                            autoFocus
                                            value={draft}
                                            maxLength={100}
                                            disabled={busy}
                                            aria-label="Channel name"
                                            onChange={(e) => setDraft(e.target.value)}
                                            onBlur={cancelRename}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') void commitRename(c)
                                                if (e.key === 'Escape') cancelRename()
                                            }}
                                            className="w-full px-2 py-1.5 rounded bg-primary text-text-primary border border-sixth outline-none focus:border-accent-primary"
                                        />
                                    )
                                }

                                return (
                                    <div key={c.id} className="group flex items-start gap-1">
                                        <div className="flex-1 min-w-0">
                                            {SidebarItem ? (
                                                <SidebarItem channel={c} active={active} currentUser={currentUser} />
                                            ) : (
                                                <DefaultChannelRow channel={c} active={active} />
                                            )}
                                        </div>
                                        {canManageChannels && (
                                            <ChannelRowMenu
                                                canMoveUp={index > 0}
                                                canMoveDown={index < arr.length - 1}
                                                onRename={() => startRename(c)}
                                                onMoveUp={() => void move(c, -1)}
                                                onMoveDown={() => void move(c, 1)}
                                                onDelete={() => void remove(c)}
                                            />
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )
                })}
            </nav>

            <UserPanel user={currentUser} recentCustomStatuses={recentCustomStatuses} />
        </div>
    )
}
