import { Toggle } from '@/components/ui/Toggle'
import { PERMISSION_DESCRIPTIONS, PERMISSION_GROUP_LABELS, PERMISSION_GROUP_ORDER, PERMISSION_GROUPS, PERMISSION_LABELS } from '@/types'
import type { PermissionGroup, PermissionKey } from '@/types'

interface Props {
    /** Already scoped/filtered by the caller (e.g. to a tier, or a channel's applicable set) — this component only groups and renders. */
    permissions: PermissionKey[]
    selected: PermissionKey[]
    onToggle: (permission: PermissionKey) => void
    /** Overall disable — e.g. the viewer can't manage this role at all. */
    disabled?: boolean
    /**
     * Every permission in `permissions` the viewer may currently turn ON —
     * `undefined` disables the graying behavior entirely (nothing is
     * force-disabled beyond `disabled`/`forceDisabled`), `'unrestricted'`
     * means everything is grantable. Turning an already-selected permission
     * OFF is always allowed regardless of this list — see
     * PermissionCeiling::grantablePermissions().
     */
    grantable?: PermissionKey[] | 'unrestricted'
    /** Permissions that are always off and disabled, each with a tooltip explaining why (e.g. 'administrator' outside the Owner role). */
    forceDisabled?: Partial<Record<PermissionKey, string>>
    groupOrder?: PermissionGroup[]
}

/**
 * The one shared permission-editing checklist — used for a room role's own
 * permissions, a global role's server/room-tier permissions, a global
 * role's room-permission ceiling, and (filtered to the curated overridable
 * subset) a channel's per-role overrides. Keeping every surface on this one
 * component is what keeps them visually consistent and what makes adding a
 * new permission low-friction: add the PermissionKey/PERMISSION_LABELS/
 * PERMISSION_DESCRIPTIONS/PERMISSION_GROUPS entries once, and every one of
 * these surfaces picks it up automatically — no per-surface UI code to touch.
 */
export function PermissionToggleList({
    permissions, selected, onToggle, disabled, grantable, forceDisabled = {}, groupOrder = PERMISSION_GROUP_ORDER,
}: Props) {
    const sections = groupOrder
        .map((group): [PermissionGroup, PermissionKey[]] => [group, permissions.filter((p) => PERMISSION_GROUPS[p] === group)])
        .filter(([, list]) => list.length > 0)

    return (
        <>
            {sections.map(([group, list]) => (
                <div key={group} className="mb-4 last:mb-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-2">
                        {PERMISSION_GROUP_LABELS[group]}
                    </p>
                    <div className="space-y-2.5">
                        {list.map((permission) => {
                            const forceReason = forceDisabled[permission]
                            const isChecked = !forceReason && selected.includes(permission)
                            const canGrant = grantable === undefined || grantable === 'unrestricted' || grantable.includes(permission)
                            const isDisabled = disabled || !!forceReason || (!isChecked && !canGrant)

                            let title = forceReason
                            if (!title && !isChecked && !canGrant) {
                                title = "You can't grant a permission you don't currently hold yourself."
                            }

                            return (
                                <div key={permission} className="flex items-start gap-3" title={title}>
                                    <Toggle
                                        checked={isChecked}
                                        onChange={() => onToggle(permission)}
                                        disabled={isDisabled}
                                        label={PERMISSION_LABELS[permission]}
                                    />
                                    <div className="min-w-0">
                                        <p className={isDisabled && !isChecked ? 'text-sm text-text-muted' : 'text-sm text-text-secondary'}>
                                            {PERMISSION_LABELS[permission]}
                                        </p>
                                        <p className="text-xs text-text-muted">{PERMISSION_DESCRIPTIONS[permission]}</p>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            ))}
        </>
    )
}
