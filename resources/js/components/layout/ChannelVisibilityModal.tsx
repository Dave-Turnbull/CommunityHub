import { useState } from 'react'
import { updateChannelVisibility } from '@/services/api'
import type { Channel, Role } from '@/types'

interface Props {
    channel: Channel
    roomRoles: Role[]
    onClose: () => void
    onUpdated: (channel: Channel) => void
}

/**
 * "Visible to roles" editor — empty selection means open to every room
 * member. A role that outranks the actor can't be excluded — the backend
 * rejects that (see Api\ChannelController::updateVisibility) and this
 * surfaces the resulting error rather than duplicating Role::rank()'s
 * hierarchy logic on the frontend.
 */
export function ChannelVisibilityModal({ channel, roomRoles, onClose, onUpdated }: Props) {
    const [selected, setSelected] = useState<Set<string>>(
        new Set((channel.visibility_roles ?? []).map((r) => r.id))
    )
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const toggle = (roleId: string) => {
        setSelected((set) => {
            const next = new Set(set)
            next.has(roleId) ? next.delete(roleId) : next.add(roleId)
            return next
        })
    }

    const save = async () => {
        setSaving(true)
        setError(null)
        try {
            const updated = await updateChannelVisibility(channel.id, Array.from(selected))
            onUpdated(updated)
            onClose()
        } catch (e: any) {
            setError(e.response?.data?.message ?? 'Could not update visibility.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
            <div
                className="w-full max-w-md bg-second rounded-lg p-6 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="text-lg font-semibold text-text-primary mb-1">Channel visibility</h2>
                <p className="text-sm text-text-muted mb-4">
                    Restrict this channel to specific roles. Leave every role unchecked to keep it visible to
                    everyone in the room. A role that outranks you can't be excluded.
                </p>

                <div className="max-h-64 overflow-y-auto space-y-1.5 mb-4">
                    {roomRoles.map((role) => (
                        <label key={role.id} className="flex items-center gap-2 text-sm text-text-secondary">
                            <input
                                type="checkbox"
                                checked={selected.has(role.id)}
                                onChange={() => toggle(role.id)}
                            />
                            {role.name}
                        </label>
                    ))}
                </div>

                {error && <p className="text-xs text-danger mb-3">{error}</p>}

                <div className="flex gap-2">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2 rounded bg-fifth hover:bg-sixth text-text-secondary text-sm font-medium transition-colors duration-100"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={save}
                        disabled={saving}
                        className="flex-1 px-4 py-2 rounded bg-accent-primary hover:bg-accent-secondary text-inverse text-sm font-medium transition-colors duration-100 disabled:opacity-50"
                    >
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    )
}
