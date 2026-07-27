import { useState } from 'react'
import { updateChannelVisibility } from '@/services/api'
import type { Channel, Role } from '@/types'

interface Props {
    channel: Channel
    roomRoles: Role[]
    onUpdated: (channel: Channel) => void
    onClose: () => void
}

/**
 * "Visible to roles" editor — empty selection means open to every room
 * member. A role that outranks the actor can't be excluded — the backend
 * rejects that (see Api\ChannelController::updateVisibility) and this
 * surfaces the resulting error rather than duplicating Role::rank()'s
 * hierarchy logic on the frontend.
 *
 * Rendered by Channels/Show below the channel header, when the header's 🔒
 * button is toggled on — not a modal, and not a Radix Popover either.
 * Channels/Show absolutely-positions the wrapper around this component
 * (`top-full` off a `relative` header), so it reads visually as sitting
 * right below the title, above the channel content, without actually
 * pushing that content down — opening/closing it must never move the
 * message list's scroll position. Channels/Show owns the open/closed state
 * and the click-outside-to-close behavior (there's no Radix dismissal
 * behavior to hook into here); this component only owns the form itself.
 */
export function ChannelVisibilityPanel({ channel, roomRoles, onUpdated, onClose }: Props) {
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
        <div className="px-4 py-4 border-b border-third bg-second">
            <h2 className="text-sm font-semibold text-text-primary mb-1">Channel visibility</h2>
            <p className="text-xs text-text-muted mb-3">
                Restrict this channel to specific roles. Leave every role unchecked to keep it visible to
                everyone in the room. A role that outranks you can't be excluded.
            </p>

            <div className="max-h-48 overflow-y-auto space-y-1.5 mb-3">
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
