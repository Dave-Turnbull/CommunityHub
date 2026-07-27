import { useEffect, useState } from 'react'
import { RoleCard } from '@/components/roles/RoleCard'
import { createRole, deleteRole, fetchRoomRoles, reorderRoles } from '@/services/api'
import type { Role, RoomMember, Room } from '@/types'

interface Props {
    room: Room
}

/**
 * Room-scoped role management — the inline panel ChannelSidebar's "Roles"
 * button swaps into Channels/Show's main pane, in place of the channel
 * content (see Channels/Show's `mainView` state). Self-fetches via
 * GET /api/rooms/{room}/roles (see Api\RoleController::index) rather than
 * Inertia props, the same pattern GlobalRolesSettings.tsx uses for the
 * Settings Roles tab — needed here specifically so opening this panel never
 * requires a page navigation.
 */
export function RoomRolesPanel({ room }: Props) {
    const [roles, setRoles] = useState<Role[]>([])
    const [members, setMembers] = useState<RoomMember[]>([])
    const [loaded, setLoaded] = useState(false)
    const [newRoleName, setNewRoleName] = useState('')
    const [creating, setCreating] = useState(false)

    const reload = () => fetchRoomRoles(room.id).then(({ roles, members }) => {
        setRoles(roles)
        setMembers(members)
        setLoaded(true)
    })

    useEffect(() => {
        reload()
    }, [room.id])

    const memberOptions = members
        .map((m) => m.user)
        .filter((u): u is NonNullable<typeof u> => !!u)
        .map((u) => ({ id: u.id, display_name: u.display_name }))

    const addRole = async () => {
        if (!newRoleName.trim() || creating) return
        setCreating(true)
        try {
            const role = await createRole(room.id, newRoleName.trim())
            setRoles((list) => [...list, role])
            setNewRoleName('')
        } finally {
            setCreating(false)
        }
    }

    const removeRole = async (roleId: string) => {
        await deleteRole(roleId)
        setRoles((list) => list.filter((r) => r.id !== roleId))
        // Deleting a role falls back anyone left with none to Member
        // server-side (see Api\RoleController::destroy) — reload to reflect
        // that on the member list.
        reload()
    }

    // Hierarchy order: Owner (top, fixed) → custom roles by position,
    // highest first → Member (bottom, fixed) — see Role::rank() on the
    // backend, which this mirrors purely for display/sort purposes.
    const sorted = [...roles].sort((a, b) => b.position - a.position)
    const customRoles = sorted.filter((r) => !r.is_system)

    const moveCustomRole = async (roleId: string, direction: 'up' | 'down') => {
        const ids = customRoles.map((r) => r.id)
        const index = ids.indexOf(roleId)
        const swapWith = direction === 'up' ? index - 1 : index + 1
        if (swapWith < 0 || swapWith >= ids.length) return

        const reordered = [...ids]
        ;[reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]]

        // Optimistic: assign descending positions matching the new order,
        // mirroring Api\RoleController::reorder's `count - index` scheme.
        const count = reordered.length
        setRoles((list) =>
            list.map((r) => {
                const newIndex = reordered.indexOf(r.id)
                return newIndex === -1 ? r : { ...r, position: count - newIndex }
            })
        )

        await reorderRoles(room.id, reordered)
        // Reordering can shift which roles the viewer outranks (and
        // therefore can_manage) — the optimistic update above only knows
        // about position, not the hierarchy comparison that depends on it.
        reload()
    }

    if (!loaded) {
        return (
            <div className="flex-1 min-h-0 overflow-y-auto bg-primary px-6 py-6">
                <p className="text-sm text-text-muted">Loading…</p>
            </div>
        )
    }

    return (
        <div className="flex-1 min-h-0 overflow-y-auto bg-primary px-6 py-6">
            <div className="max-w-2xl mx-auto">
                <p className="text-sm text-text-muted mb-6">
                    Roles are ranked top to bottom: Owner, then custom roles in the order below (drag with
                    the arrows), then Member. A role can only manage roles ranked below it, and can only
                    add or remove members who are themselves ranked lower than you — never someone of an
                    equal or higher role. Every member needs at least one role — removing or deleting
                    someone's only custom role falls back to Member automatically, but removing Member
                    itself while it's their only role is blocked. Instance-wide staff roles are managed
                    from the Roles tab in Settings (server admins only).
                </p>

                <div className="flex gap-2 mb-6">
                    <input
                        type="text"
                        value={newRoleName}
                        placeholder="New role name"
                        onChange={(e) => setNewRoleName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addRole()}
                        className="flex-1 bg-third border border-sixth rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary transition-colors duration-100"
                    />
                    <button
                        onClick={addRole}
                        disabled={creating || !newRoleName.trim()}
                        className="px-4 py-2 rounded bg-accent-primary hover:bg-accent-secondary text-inverse text-sm font-medium transition-colors duration-100 disabled:opacity-50"
                    >
                        {creating ? 'Creating…' : 'New role'}
                    </button>
                </div>

                {sorted.map((role) => {
                    const customIndex = customRoles.findIndex((r) => r.id === role.id)

                    return (
                        <RoleCard
                            key={role.id}
                            role={role}
                            memberOptions={memberOptions}
                            onChange={(updated) => setRoles((list) => list.map((r) => (r.id === updated.id ? updated : r)))}
                            onRemove={removeRole}
                            onMove={role.is_system ? undefined : (direction) => moveCustomRole(role.id, direction)}
                            canMoveUp={customIndex > 0}
                            canMoveDown={customIndex !== -1 && customIndex < customRoles.length - 1}
                            onMemberChanged={reload}
                        />
                    )
                })}
            </div>
        </div>
    )
}
