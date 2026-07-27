import { useState } from 'react'
import { addRoleMember, removeRoleMember, updateRole } from '@/services/api'
import { PERMISSION_LABELS } from '@/types'
import type { PermissionKey, Role } from '@/types'

const ALL_PERMISSIONS = Object.keys(PERMISSION_LABELS) as PermissionKey[]

/**
 * Renders one role's permissions + member management. Scope-agnostic —
 * every API call here is keyed by role id, not a room id, so this same
 * component backs both Rooms/Roles.tsx (room-scoped roles) and
 * Settings' Roles tab (components/settings/GlobalRolesSettings.tsx,
 * global/instance-wide roles). `onMemberChanged` lets
 * the parent re-sync from the server after a removal (see
 * docs/roles-and-permissions.md: removing someone's last custom role can
 * trigger a server-side fallback assignment this component's optimistic
 * update can't know about).
 */
export function RoleCard({
    role, memberOptions, onChange, onRemove, onMove, canMoveUp, canMoveDown, onMemberChanged,
}: {
    role: Role
    memberOptions: { id: string; display_name: string }[]
    onChange: (role: Role) => void
    onRemove: (roleId: string) => void
    onMove?: (direction: 'up' | 'down') => void
    canMoveUp: boolean
    canMoveDown: boolean
    onMemberChanged?: () => void
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
            onMemberChanged?.()
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
                    Full access. Permissions are managed by the system.
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
