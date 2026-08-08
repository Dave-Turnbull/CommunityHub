import { useState } from 'react'
import { Toggle } from '@/components/ui/Toggle'
import { updateRoleRoomCeiling } from '@/services/api'
import { PermissionToggleList } from '@/components/roles/PermissionToggleList'
import { PERMISSION_TIERS } from '@/types'
import type { PermissionKey, Role } from '@/types'

const ROOM_TIER_PERMISSIONS = (Object.keys(PERMISSION_TIERS) as PermissionKey[]).filter((p) =>
    PERMISSION_TIERS[p].includes('room')
)

interface Props {
    role: Role
    onChange: (role: Role) => void
}

/**
 * A global role's room-permission ceiling — the cap on what rooms created by
 * this role's holders are ever allowed to grant, room-wide, to any of their
 * own roles including Owner. Only rendered when `role.can_manage_ceiling` is
 * true (Gate::allows('manageCeiling', ...), computed server-side). Reuses
 * PermissionToggleList — same visual language as the role's own permission
 * checklist above it, scoped to room-tier permissions only (a ceiling has
 * nothing to say about server-tier ones like CreateRoom). See
 * docs/roles-and-permissions.md's "Room permission ceilings".
 */
export function RoomCeilingSection({ role, onChange }: Props) {
    const [enabled, setEnabled] = useState(role.has_room_permission_ceiling ?? false)
    const [selected, setSelected] = useState<PermissionKey[]>(role.room_permission_ceiling ?? [])
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    if (!role.can_manage_ceiling) return null

    const toggle = (permission: PermissionKey) => {
        setSelected((list) => (list.includes(permission) ? list.filter((p) => p !== permission) : [...list, permission]))
    }

    const save = async () => {
        setSaving(true)
        setError(null)
        try {
            const updated = await updateRoleRoomCeiling(role.id, { has_ceiling: enabled, permissions: selected })
            onChange({
                ...role,
                has_room_permission_ceiling: updated.has_room_permission_ceiling,
                room_permission_ceiling: updated.room_permission_ceiling,
            })
        } catch (e: any) {
            setError(e.response?.data?.message ?? 'Could not update the room permission ceiling.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="mt-5 pt-4 border-t border-third">
            <div className="flex items-start gap-3 mb-3">
                <Toggle checked={enabled} onChange={setEnabled} label="Room permission ceiling" />
                <div>
                    <p className="text-sm font-semibold text-text-primary">Room permission ceiling</p>
                    <p className="text-xs text-text-muted">
                        Cap what rooms created by holders of this role are ever allowed to grant, room-wide —
                        including that room's own Owner. Applied once, when a room is created; changing this
                        doesn't retroactively affect rooms that already exist.
                    </p>
                </div>
            </div>

            {enabled && (
                <div className="mb-3">
                    <PermissionToggleList
                        permissions={ROOM_TIER_PERMISSIONS}
                        selected={selected}
                        onToggle={toggle}
                        grantable={role.grantable_ceiling_permissions}
                    />
                </div>
            )}

            {error && <p className="text-xs text-danger mb-2">{error}</p>}

            <button
                onClick={save}
                disabled={saving}
                className="px-3 py-1.5 rounded bg-accent-primary hover:bg-accent-secondary text-inverse text-xs font-medium transition-colors duration-100 disabled:opacity-50"
            >
                {saving ? 'Saving…' : 'Save ceiling'}
            </button>
        </div>
    )
}
