import { useState } from 'react'
import { addRoleMember, removeRoleMember, updateRole } from '@/services/api'
import { CHANNEL_CATEGORY_LABELS, KNOWN_CHANNEL_CATEGORIES } from '@/services/channelTypes'
import { PermissionToggleList } from '@/components/roles/PermissionToggleList'
import { RoomCeilingSection } from '@/components/roles/RoomCeilingSection'
import { Toggle } from '@/components/ui/Toggle'
import { PERMISSION_TIERS } from '@/types'
import type { PermissionKey, Role } from '@/types'

const ALL_PERMISSIONS = Object.keys(PERMISSION_TIERS) as PermissionKey[]
const SERVER_TIER_PERMISSIONS = ALL_PERMISSIONS.filter((p) => PERMISSION_TIERS[p].includes('server'))
const ROOM_TIER_PERMISSIONS = ALL_PERMISSIONS.filter((p) => PERMISSION_TIERS[p].includes('room'))
// A global role's "Room permissions" section sits below its "Server
// permissions" one — dual-tier permissions (administrator, manage_roles)
// already appear up there, so don't render them twice.
const ROOM_ONLY_FOR_GLOBAL = ROOM_TIER_PERMISSIONS.filter((p) => !SERVER_TIER_PERMISSIONS.includes(p))

// administrator is never toggleable from this component regardless of
// section — it's reserved for the pinned Owner tier (see Api\RoleController::
// update's matching backend rejection) and is always shown, forced off, with
// an explanation rather than hidden — hiding it would leave "why can't I see
// Administrator on this list" unanswered.
const FORCE_DISABLED = { administrator: 'Only the Owner role can have Administrator' }

// Every category other than 'mod' falls under the "user channels" bucket —
// mirrors ChannelPolicy::create()'s exact `$category === 'mod'` branch, so
// this stays correct as new non-mod categories are registered.
const NON_MOD_CATEGORIES = KNOWN_CHANNEL_CATEGORIES.filter((c) => c !== 'mod')

/**
 * Renders one role's permissions + member management. Scope-agnostic —
 * every API call here is keyed by role id, not a room id, so this same
 * component backs both RoomRolesPanel.tsx (room-scoped roles) and
 * Settings' Roles tab (components/settings/GlobalRolesSettings.tsx,
 * global/instance-wide roles). `onMemberChanged` lets
 * the parent re-sync from the server after a removal (see
 * docs/roles-and-permissions.md: removing someone's last custom role can
 * trigger a server-side fallback assignment this component's optimistic
 * update can't know about).
 *
 * A global role's own permissions are split into two sections — "Server
 * permissions" (server-tier: CreateRoom, InviteServer, SendDirectMessages,
 * plus Administrator/ManageRoles) and "Room permissions" (room-tier — if
 * granted here, applies in *every* room, since a global role's grants are
 * checked room = null OR any room). A room-scoped role only ever shows the
 * room-tier section, since server-tier permissions are no-ops there (see
 * PERMISSION_TIERS). Below both, `RoomCeilingSection` (global roles only)
 * lets a sufficiently-ranked viewer cap what rooms created under this role
 * may grant — a different question from what this role itself holds.
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
    const [selectedCategories, setSelectedCategories] = useState<string[]>(
        (role.channel_categories ?? []).map((c) => c.category)
    )
    const [saving, setSaving] = useState(false)
    const [addingUserId, setAddingUserId] = useState('')
    const [memberError, setMemberError] = useState<string | null>(null)

    // Owner is the hierarchy's fixed top and is entirely read-only. Member
    // (is_default) and custom roles are both editable, but administrator can
    // only ever live on Owner — see PermissionKey/ChannelPolicy notes and
    // Api\RoleController::update's matching backend rejection.
    const isOwnerTier = role.is_system && !role.is_default
    const isGlobal = role.room_id === null
    const canManage = role.can_manage ?? false

    const togglePermission = (permission: PermissionKey) => {
        if (permission === 'administrator') return
        const enabling = !selected.includes(permission)

        setSelected((list) => (enabling ? [...list, permission] : list.filter((p) => p !== permission)))

        // Manage User Channels / Manage Mod Channels bulk-apply their
        // channel-category bucket as a convenience default — each category
        // checkbox stays independently toggleable afterward (see
        // ChannelPolicy::create(): an explicit per-category grant always
        // authorizes on its own, regardless of these two permissions).
        if (permission === 'manage_channels') {
            setSelectedCategories((cats) =>
                enabling
                    ? Array.from(new Set([...cats, ...NON_MOD_CATEGORIES]))
                    : cats.filter((c) => !NON_MOD_CATEGORIES.includes(c))
            )
        } else if (permission === 'manage_mod_channels') {
            setSelectedCategories((cats) =>
                enabling ? Array.from(new Set([...cats, 'mod'])) : cats.filter((c) => c !== 'mod')
            )
        }
    }

    const toggleCategory = (category: string) => {
        setSelectedCategories((cats) =>
            cats.includes(category) ? cats.filter((c) => c !== category) : [...cats, category]
        )
    }

    const savePermissions = async () => {
        setSaving(true)
        try {
            const updated = await updateRole(role.id, { permissions: selected, channel_categories: selectedCategories })
            onChange({ ...role, role_permissions: updated.role_permissions, channel_categories: updated.channel_categories })
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
                    {isGlobal && (
                        <div className="mb-4">
                            <p className="text-xs font-semibold text-text-secondary mb-2">Server permissions</p>
                            <PermissionToggleList
                                permissions={SERVER_TIER_PERMISSIONS}
                                selected={selected}
                                onToggle={togglePermission}
                                disabled={!canManage}
                                grantable={role.grantable_permissions}
                                forceDisabled={FORCE_DISABLED}
                            />
                        </div>
                    )}

                    <div className="mb-4">
                        {isGlobal && <p className="text-xs font-semibold text-text-secondary mb-2">Room permissions</p>}
                        <PermissionToggleList
                            permissions={isGlobal ? ROOM_ONLY_FOR_GLOBAL : ROOM_TIER_PERMISSIONS}
                            selected={selected}
                            onToggle={togglePermission}
                            disabled={!canManage}
                            grantable={role.grantable_permissions}
                            forceDisabled={FORCE_DISABLED}
                        />
                    </div>

                    <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-2">
                        Channel categories this role can create
                    </p>
                    <div className="space-y-2 mb-4">
                        {KNOWN_CHANNEL_CATEGORIES.map((category) => {
                            const isChecked = selectedCategories.includes(category)
                            const canGrant = !role.grantable_channel_categories || role.grantable_channel_categories.includes(category)
                            return (
                                <div key={category} className="flex items-center gap-3">
                                    <Toggle
                                        checked={isChecked}
                                        onChange={() => toggleCategory(category)}
                                        disabled={!canManage || (!isChecked && !canGrant)}
                                        label={CHANNEL_CATEGORY_LABELS[category] ?? category}
                                    />
                                    <span className="text-sm text-text-secondary">
                                        {CHANNEL_CATEGORY_LABELS[category] ?? category}
                                    </span>
                                </div>
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

                    {isGlobal && <RoomCeilingSection role={role} onChange={onChange} />}
                </>
            )}

            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-2 mt-5">Members</p>
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
