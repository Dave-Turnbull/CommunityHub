import { useEffect, useState } from 'react'
import { RoleCard } from '@/components/roles/RoleCard'
import { createGlobalRole, deleteRole, fetchGlobalRoles, reorderGlobalRoles } from '@/services/api'
import type { Role, User } from '@/types'

/**
 * Instance-wide (global) role management — the Settings tab equivalent of
 * Rooms/Roles.tsx, backed by the same RoleCard component. Self-fetches via
 * GET /api/settings/roles (see Api\RoleController::indexGlobal) rather than
 * Inertia props, matching NotificationPreferences/AudioSettings's pattern
 * for settings tab content. Only rendered at all when Settings/Index's
 * `can_manage_global_roles` prop is true — see SettingsController::show.
 * Global roles have no per-room hierarchy (see RolePolicy::manage's
 * `!$role->room` branch), so unlike Rooms/Roles.tsx there is no outranks()
 * gate on reordering — any user who can manage global roles at all can
 * reorder any of them.
 */
export function GlobalRolesSettings() {
    const [roles, setRoles] = useState<Role[]>([])
    const [users, setUsers] = useState<User[]>([])
    const [loaded, setLoaded] = useState(false)
    const [newRoleName, setNewRoleName] = useState('')
    const [creating, setCreating] = useState(false)

    const reload = () => fetchGlobalRoles().then(({ roles, users }) => {
        setRoles(roles)
        setUsers(users)
        setLoaded(true)
    })

    useEffect(() => {
        reload()
    }, [])

    const memberOptions = users.map((u) => ({ id: u.id, display_name: u.display_name }))

    const addRole = async () => {
        if (!newRoleName.trim() || creating) return
        setCreating(true)
        try {
            const role = await createGlobalRole(newRoleName.trim())
            setRoles((list) => [...list, role])
            setNewRoleName('')
        } finally {
            setCreating(false)
        }
    }

    const removeRole = async (roleId: string) => {
        await deleteRole(roleId)
        setRoles((list) => list.filter((r) => r.id !== roleId))
        reload()
    }

    const sorted = [...roles].sort((a, b) => b.position - a.position)
    const customRoles = sorted.filter((r) => !r.is_system)

    const moveCustomRole = async (roleId: string, direction: 'up' | 'down') => {
        const ids = customRoles.map((r) => r.id)
        const index = ids.indexOf(roleId)
        const swapWith = direction === 'up' ? index - 1 : index + 1
        if (swapWith < 0 || swapWith >= ids.length) return

        const reordered = [...ids]
        ;[reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]]

        const count = reordered.length
        setRoles((list) =>
            list.map((r) => {
                const newIndex = reordered.indexOf(r.id)
                return newIndex === -1 ? r : { ...r, position: count - newIndex }
            })
        )

        await reorderGlobalRoles(reordered)
        reload()
    }

    if (!loaded) {
        return <p className="text-sm text-text-muted">Loading…</p>
    }

    return (
        <div>
            <p className="text-sm text-text-muted mb-6">
                Instance-wide roles apply in every room. Every user always holds at least the default
                Member role. A role with Administrator can do anything, anywhere.
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
    )
}
