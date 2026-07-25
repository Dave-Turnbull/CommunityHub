import { useEffect, useState } from 'react'
import { Head, Link, router } from '@inertiajs/react'
import { RoomRail } from '@/components/layout/RoomRail'
import {
    addRoleMember,
    createRole,
    deleteRole,
    removeRoleMember,
    reorderRoles,
    updateRole,
} from '@/services/api'
import { PERMISSION_LABELS } from '@/types'
import type { PermissionKey, Role, RoomRolesPageProps } from '@/types'

const ALL_PERMISSIONS = Object.keys(PERMISSION_LABELS) as PermissionKey[]

function RoleCard({
    role, memberOptions, onChange, onRemove, onMove, canMoveUp, canMoveDown,
}: {
    role: Role
    memberOptions: { id: string; display_name: string }[]
    onChange: (role: Role) => void
    onRemove: (roleId: string) => void
    onMove?: (direction: 'up' | 'down') => void
    canMoveUp: boolean
    canMoveDown: boolean
}) {
    const [selected, setSelected] = useState<PermissionKey[]>(
        (role.role_permissions ?? []).map((p) => p.permission)
    )
    const [saving, setSaving] = useState(false)
    const [addingUserId, setAddingUserId] = useState('')
    const [memberError, setMemberError] = useState<string | null>(null)

    // Owner is the hierarchy's fixed top and is entirely read-only. Member
    // (is_default) and custom roles are both editable, but administrator can
    // only ever live on Owner — see PermissionKey/ChannelPolicy notes and
    // Api\RoleController::update's matching backend rejection.
    const isOwnerTier = role.is_system && !role.is_default
    const canManage = role.can_manage ?? false

    const togglePermission = (permission: PermissionKey) => {
        if (permission === 'administrator') return
        setSelected((list) =>
            list.includes(permission) ? list.filter((p) => p !== permission) : [...list, permission]
        )
    }

    const savePermissions = async () => {
        setSaving(true)
        try {
            const updated = await updateRole(role.id, { permissions: selected })
            onChange({ ...role, role_permissions: updated.role_permissions })
        } finally {
            setSaving(false)
        }
    }

    const addMember = async () => {
        if (!addingUserId) return
        setMemberError(null)
        try {
            await addRoleMember(role.id, addingUserId)
            const user = memberOptions.find((m) => m.id === addingUserId)
            onChange({ ...role, users: [...(role.users ?? []), { id: addingUserId, display_name: user?.display_name ?? '' } as any] })
            setAddingUserId('')
        } catch (e: any) {
            setMemberError(e.response?.data?.message ?? 'Could not add that member.')
        }
    }

    const removeMember = async (userId: string) => {
        setMemberError(null)
        try {
            await removeRoleMember(role.id, userId)
            onChange({ ...role, users: (role.users ?? []).filter((u) => u.id !== userId) })
            // Removing someone's last custom role falls back to assigning
            // them Member server-side (see Api\RoleController::removeMember)
            // — reload to pick up that side effect on Member's own member
            // list, which this optimistic update above can't know about.
            router.reload({ only: ['room'] })
        } catch (e: any) {
            setMemberError(e.response?.data?.message ?? 'Could not remove that member.')
        }
    }

    const assignedIds = new Set((role.users ?? []).map((u) => u.id))
    const availableOptions = memberOptions.filter((m) => !assignedIds.has(m.id))

    return (
        <div className="bg-second rounded-lg p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    {onMove && (
                        <div className="flex flex-col -my-1 mr-1">
                            <button
                                onClick={() => onMove('up')}
                                disabled={!canMoveUp || !canManage}
                                title="Move up"
                                className="text-text-muted hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed leading-none text-xs"
                            >
                                ▲
                            </button>
                            <button
                                onClick={() => onMove('down')}
                                disabled={!canMoveDown || !canManage}
                                title="Move down"
                                className="text-text-muted hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed leading-none text-xs"
                            >
                                ▼
                            </button>
                        </div>
                    )}
                    <h3 className="font-semibold text-text-primary">{role.name}</h3>
                    {role.is_system && !role.is_default && (
                        <span className="text-[10px] uppercase tracking-wide bg-fifth text-text-muted px-1.5 py-0.5 rounded">
                            System
                        </span>
                    )}
                    {role.is_default && (
                        <span className="text-[10px] uppercase tracking-wide bg-fifth text-text-muted px-1.5 py-0.5 rounded">
                            Default
                        </span>
                    )}
                    {!isOwnerTier && !canManage && (
                        <span
                            className="text-[10px] uppercase tracking-wide bg-fifth text-text-muted px-1.5 py-0.5 rounded"
                            title="This role's rank is equal to or higher than your own — you can't manage it"
                        >
                            🔒 Locked
                        </span>
                    )}
                </div>
                {!role.is_system && canManage && (
                    <button
                        onClick={() => onRemove(role.id)}
                        className="text-xs text-text-muted hover:text-danger transition-colors duration-100"
                    >
                        Delete role
                    </button>
                )}
            </div>

            {isOwnerTier ? (
                <p className="text-sm text-text-muted mb-4">
                    Full access to this room. Permissions are managed by the system.
                </p>
            ) : (
                <>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-2">
                        Permissions
                    </p>
                    <div className="grid grid-cols-2 gap-1.5 mb-3">
                        {ALL_PERMISSIONS.map((permission) => {
                            const isAdministrator = permission === 'administrator'
                            return (
                                <label
                                    key={permission}
                                    className={
                                        'flex items-center gap-2 text-sm ' +
                                        (isAdministrator ? 'text-text-muted' : 'text-text-secondary')
                                    }
                                    title={isAdministrator ? 'Only the Owner role can have Administrator' : undefined}
                                >
                                    <input
                                        type="checkbox"
                                        checked={!isAdministrator && selected.includes(permission)}
                                        disabled={isAdministrator || !canManage}
                                        onChange={() => togglePermission(permission)}
                                    />
                                    {PERMISSION_LABELS[permission]}
                                </label>
                            )
                        })}
                    </div>
                    {canManage && (
                        <button
                            onClick={savePermissions}
                            disabled={saving}
                            className="px-3 py-1.5 rounded bg-accent-primary hover:bg-accent-secondary text-inverse text-xs font-medium transition-colors duration-100 disabled:opacity-50 mb-4"
                        >
                            {saving ? 'Saving…' : 'Save permissions'}
                        </button>
                    )}
                </>
            )}

            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-2">Members</p>
            {(role.users ?? []).map((u) => (
                <div key={u.id} className="flex items-center justify-between py-1">
                    <span className="text-sm text-text-secondary">{u.display_name}</span>
                    {canManage && (
                        <button
                            onClick={() => removeMember(u.id)}
                            className="text-xs text-text-muted hover:text-danger transition-colors duration-100"
                        >
                            Remove
                        </button>
                    )}
                </div>
            ))}

            {canManage && availableOptions.length > 0 && (
                <div className="flex gap-2 mt-2">
                    <select
                        value={addingUserId}
                        onChange={(e) => setAddingUserId(e.target.value)}
                        className="flex-1 bg-third border border-sixth rounded px-2 py-1 text-sm text-text-primary"
                    >
                        <option value="">Add a member…</option>
                        {availableOptions.map((m) => (
                            <option key={m.id} value={m.id}>{m.display_name}</option>
                        ))}
                    </select>
                    <button
                        onClick={addMember}
                        disabled={!addingUserId}
                        className="px-3 py-1 rounded bg-fifth hover:bg-sixth text-text-secondary text-xs font-medium transition-colors duration-100 disabled:opacity-50"
                    >
                        Add
                    </button>
                </div>
            )}
            {memberError && <p className="text-xs text-danger mt-1.5">{memberError}</p>}
        </div>
    )
}

export default function RoomRoles({ auth, rooms, room }: RoomRolesPageProps) {
    const [roles, setRoles] = useState<Role[]>(room.roles)
    const [newRoleName, setNewRoleName] = useState('')
    const [creating, setCreating] = useState(false)

    // Re-syncs after a router.reload({ only: ['room'] }) — see removeRole/
    // RoleCard's removeMember, both of which can trigger a server-side
    // fallback role assignment elsewhere in this list that only a fresh
    // room.roles prop (not the optimistic local updates) reflects.
    useEffect(() => {
        setRoles(room.roles)
    }, [room.roles])

    const memberOptions = (room.members ?? [])
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
        // that on Member's member list.
        router.reload({ only: ['room'] })
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
        router.reload({ only: ['room'] })
    }

    return (
        <>
            <Head title={`Roles — ${room.name}`} />

            <div className="flex flex-col h-screen">
                <RoomRail rooms={rooms} currentUserId={auth.user.id} activeRoomId={room.id} />

                <main className="flex-1 min-h-0 overflow-y-auto bg-primary px-6 py-6">
                    <div className="max-w-2xl mx-auto">
                        <Link href={`/rooms/${room.id}`} className="text-sm text-text-muted hover:text-text-primary">
                            ← Back to {room.name}
                        </Link>
                        <h1 className="text-2xl font-bold text-text-primary mt-2 mb-1">Roles</h1>
                        <p className="text-sm text-text-muted mb-6">
                            Roles are ranked top to bottom: Owner, then custom roles in the order below (drag with
                            the arrows), then Member. A role can only manage roles ranked below it, and can only
                            add or remove members who are themselves ranked lower than you — never someone of an
                            equal or higher role. Every member needs at least one role — removing or deleting
                            someone's only custom role falls back to Member automatically, but removing Member
                            itself while it's their only role is blocked. Instance-wide staff roles aren't managed
                            here yet.
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
                                />
                            )
                        })}
                    </div>
                </main>
            </div>
        </>
    )
}
