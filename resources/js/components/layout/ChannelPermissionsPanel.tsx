import { useState } from 'react'
import { Toggle } from '@/components/ui/Toggle'
import { TriStateOverride } from '@/components/roles/TriStateOverride'
import type { OverrideState } from '@/components/roles/TriStateOverride'
import { updateChannelPermissions } from '@/services/api'
import { overridablePermissionsFor } from '@/services/channelTypes'
import { PERMISSION_LABELS } from '@/types'
import type { Channel, PermissionKey, Role } from '@/types'

interface Props {
    channel: Channel
    roomRoles: Role[]
    onUpdated: (channel: Channel) => void
    onClose: () => void
}

type OverrideMap = Record<string, Partial<Record<PermissionKey, OverrideState>>>

function initialOverrides(channel: Channel): OverrideMap {
    const map: OverrideMap = {}
    for (const override of channel.permission_overrides ?? []) {
        map[override.role_id] ??= {}
        map[override.role_id][override.permission] = override.allowed ? 'allow' : 'deny'
    }
    return map
}

/**
 * A channel's role-based permissions — who can see it (existing
 * `channel_role_visibility`) and, per role, whether a curated set of
 * room-tier permissions is force-allowed/denied here specifically instead
 * of just inheriting the room-wide grant (see PermissionChecker::
 * canInChannel and Permission::channelOverridableCases()). One panel, one
 * save — both fields go to Api\ChannelController::update together, in the
 * same transaction.
 *
 * Only the permissions this channel's *type* actually supports are shown
 * (overridablePermissionsFor) — e.g. Vote never appears on a plain text
 * channel, Comment never appears where the channel type has no comment
 * feature at all — so the grid never offers a toggle that would silently do
 * nothing.
 *
 * Rendered by Channels/Show below the channel header, when the header's 🔒
 * button is toggled on — not a modal, and not a Radix Popover either.
 * Channels/Show absolutely-positions the wrapper around this component
 * (`top-full` off a `relative` header), so it reads visually as sitting
 * right below the title, above the channel content, without actually
 * pushing that content down. Channels/Show owns the open/closed state and
 * the click-outside-to-close behavior; this component only owns the form.
 */
export function ChannelPermissionsPanel({ channel, roomRoles, onUpdated, onClose }: Props) {
    const [visible, setVisible] = useState<Set<string>>(
        new Set((channel.visibility_roles ?? []).map((r) => r.id))
    )
    const [overrides, setOverrides] = useState<OverrideMap>(() => initialOverrides(channel))
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const overridablePermissions = overridablePermissionsFor(channel.type)

    const toggleVisible = (roleId: string) => {
        setVisible((set) => {
            const next = new Set(set)
            next.has(roleId) ? next.delete(roleId) : next.add(roleId)
            return next
        })
    }

    const setOverride = (roleId: string, permission: PermissionKey, value: OverrideState) => {
        setOverrides((map) => ({
            ...map,
            [roleId]: { ...map[roleId], [permission]: value },
        }))
    }

    const save = async () => {
        setSaving(true)
        setError(null)
        try {
            const permission_overrides = Object.entries(overrides).flatMap(([role_id, permissions]) =>
                Object.entries(permissions)
                    .filter(([, state]) => state !== 'inherit')
                    .map(([permission, state]) => ({
                        role_id,
                        permission: permission as PermissionKey,
                        allowed: state === 'allow',
                    }))
            )

            const updated = await updateChannelPermissions(channel.id, {
                visibility_role_ids: Array.from(visible),
                permission_overrides,
            })
            onUpdated(updated)
            onClose()
        } catch (e: any) {
            setError(e.response?.data?.message ?? 'Could not update channel permissions.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="px-4 py-4 border-b border-third bg-second max-h-[70vh] overflow-y-auto">
            <h2 className="text-sm font-semibold text-text-primary mb-1">Channel permissions</h2>

            <p className="text-xs text-text-muted mb-2 mt-3 font-semibold uppercase tracking-wider">Visible to</p>
            <p className="text-xs text-text-muted mb-3">
                Restrict this channel to specific roles. Leave every role off to keep it visible to everyone
                in the room. A role that outranks you can't be excluded.
            </p>
            <div className="space-y-2 mb-4">
                {roomRoles.map((role) => (
                    <div key={role.id} className="flex items-center gap-3">
                        <Toggle checked={visible.has(role.id)} onChange={() => toggleVisible(role.id)} label={role.name} />
                        <span className="text-sm text-text-secondary">{role.name}</span>
                    </div>
                ))}
            </div>

            {overridablePermissions.length > 0 && (
                <>
                    <p className="text-xs text-text-muted mb-2 font-semibold uppercase tracking-wider">
                        Permission overrides
                    </p>
                    <p className="text-xs text-text-muted mb-3">
                        Override a role's room-wide permission just for this channel. "Inherit" (the default)
                        uses whatever the role is granted at the room level. You can only force a permission
                        Allow if you currently hold it yourself.
                    </p>
                    <div className="space-y-4 mb-4">
                        {roomRoles.map((role) => (
                            <div key={role.id}>
                                <p className="text-xs font-semibold text-text-secondary mb-1.5">{role.name}</p>
                                <div className="space-y-1.5">
                                    {overridablePermissions.map((permission) => (
                                        <div key={permission} className="flex items-center justify-between gap-3">
                                            <span className="text-xs text-text-muted">{PERMISSION_LABELS[permission]}</span>
                                            <TriStateOverride
                                                label={`${role.name} — ${PERMISSION_LABELS[permission]}`}
                                                value={overrides[role.id]?.[permission] ?? 'inherit'}
                                                onChange={(value) => setOverride(role.id, permission, value)}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {error && <p className="text-xs text-danger mb-3">{error}</p>}

            <div className="flex gap-2">
                <button
                    onClick={onClose}
                    className="px-4 py-2 rounded bg-fifth hover:bg-sixth text-text-secondary text-sm font-medium transition-colors duration-100"
                >
                    Cancel
                </button>
                <button
                    onClick={save}
                    disabled={saving}
                    className="px-4 py-2 rounded bg-accent-primary hover:bg-accent-secondary text-inverse text-sm font-medium transition-colors duration-100 disabled:opacity-50"
                >
                    {saving ? 'Saving…' : 'Save'}
                </button>
            </div>
        </div>
    )
}
