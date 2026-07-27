import { useState } from 'react'
import { router } from '@inertiajs/react'
import { Avatar } from '@/components/ui/Avatar'
import { DropdownMenu } from '@/components/ui/DropdownMenu'
import { OwnerTransferModal } from '@/components/rooms/OwnerTransferModal'
import { banRoomMember, kickRoomMember, OwnerTransferRequiredError } from '@/services/api'
import { usePresence } from '@/stores'
import type { RoomMember } from '@/types'

interface Props {
    members: RoomMember[]
    // Kick/ban affordances are opt-in — only Channels/Show passes these
    // (room context); DM member lists have no room to act against.
    roomId?: string
    currentUserId?: string
    canManageMembers?: boolean
    canBanMembers?: boolean
}

export function MemberList({ members, roomId, currentUserId, canManageMembers, canBanMembers }: Props) {
    const statuses = usePresence((s) => s.statuses)
    const [pendingTransfer, setPendingTransfer] = useState<{ action: 'kick' | 'ban'; userId: string; message: string } | null>(null)
    const [busy, setBusy] = useState(false)

    const isOnline = (m: RoomMember) =>
        (statuses[m.user_id]?.status ?? m.user?.status) !== 'offline'

    const online  = members.filter(isOnline)
    const offline = members.filter((m) => !isOnline(m))

    const runAction = async (action: 'kick' | 'ban', userId: string, confirmOwnerTransfer = false) => {
        if (!roomId) return
        setBusy(true)
        try {
            if (action === 'kick') {
                await kickRoomMember(roomId, userId, confirmOwnerTransfer)
            } else {
                await banRoomMember(roomId, userId, confirmOwnerTransfer)
            }
            setPendingTransfer(null)
            router.reload()
        } catch (e) {
            if (e instanceof OwnerTransferRequiredError) {
                setPendingTransfer({ action, userId, message: e.message })
            }
        } finally {
            setBusy(false)
        }
    }

    const group = (list: RoomMember[], label: string, dim = false) => {
        if (!list.length) return null

        return (
            <div className="mb-4">
                <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                    {label} — {list.length}
                </p>

                {list.map((m) => {
                    if (!m.user) return null

                    const status = statuses[m.user_id]?.status ?? m.user.status
                    const customStatus = statuses[m.user_id]?.customStatus ?? m.user.custom_status
                    const label = status === 'custom' ? customStatus : null
                    const canAct = roomId && m.user_id !== currentUserId && (canManageMembers || canBanMembers)

                    return (
                        <div
                            key={m.id}
                            className={`group flex items-center gap-2 px-3 py-1.5 mx-1 rounded
                                        hover:bg-fifth cursor-pointer ${dim ? 'opacity-40' : ''}`}
                        >
                            <Avatar user={m.user} size="sm" showStatus />
                            <div className="min-w-0 flex-1">
                                <p className="text-sm text-text-secondary truncate leading-tight">
                                    {m.nickname ?? m.user.display_name}
                                </p>
                                {label && (
                                    <p className="text-[11px] text-text-muted truncate leading-tight">
                                        {label}
                                    </p>
                                )}
                            </div>
                            {canAct && (
                                <DropdownMenu
                                    trigger={
                                        <button
                                            className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-text-primary transition-opacity duration-100 px-1"
                                            title="Member actions"
                                        >
                                            ⋯
                                        </button>
                                    }
                                    className="bg-third border border-sixth rounded-lg shadow-lg p-1 min-w-[140px]"
                                >
                                    {canManageMembers && (
                                        <DropdownMenu.Item onSelect={() => runAction('kick', m.user_id)}>
                                            Kick
                                        </DropdownMenu.Item>
                                    )}
                                    {canBanMembers && (
                                        <DropdownMenu.Item danger onSelect={() => runAction('ban', m.user_id)}>
                                            Ban
                                        </DropdownMenu.Item>
                                    )}
                                </DropdownMenu>
                            )}
                        </div>
                    )
                })}
            </div>
        )
    }

    return (
        <aside className="w-sidebar-members bg-second border-l-panel border-panel-border flex-shrink-0 overflow-y-auto py-4">
            {group(online, 'Online')}
            {group(offline, 'Offline', true)}

            {pendingTransfer && (
                <OwnerTransferModal
                    message={pendingTransfer.message}
                    busy={busy}
                    onCancel={() => setPendingTransfer(null)}
                    onConfirm={() => runAction(pendingTransfer.action, pendingTransfer.userId, true)}
                />
            )}
        </aside>
    )
}
