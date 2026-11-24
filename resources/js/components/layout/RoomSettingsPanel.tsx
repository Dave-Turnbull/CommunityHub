import { useState } from 'react'
import { router } from '@inertiajs/react'
import { deleteRoom, leaveRoom, updateRoom } from '@/services/api'
import { describeApiError } from '@/services/errorMessages'
import type { Room } from '@/types'

interface Props {
    room: Room
    currentUserId: string
    canManageRoom: boolean
    canDeleteRoom: boolean
}

type Section = 'save' | 'leave' | 'delete'

const labelClass = 'text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-2'
const inputClass =
    'w-full bg-third border border-sixth rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary transition-colors duration-100'

/**
 * The room's settings, rendered inline in Channels/Show's main pane (see
 * ChannelSidebar's ⚙ button / Channels/Show's `mainView` state). Each section
 * only renders when the server said the viewer may use it — see
 * ChannelPageProps.can_manage_room/can_delete_room.
 */
export function RoomSettingsPanel({ room, currentUserId, canManageRoom, canDeleteRoom }: Props) {
    const [name, setName] = useState(room.name)
    const [iconUrl, setIconUrl] = useState(room.icon_url ?? '')
    const [saved, setSaved] = useState(false)
    const [confirmingLeave, setConfirmingLeave] = useState(false)
    const [deleteConfirmation, setDeleteConfirmation] = useState('')
    const [busy, setBusy] = useState<Section | null>(null)
    const [error, setError] = useState<{ section: Section; message: string } | null>(null)

    const isOwner = room.owner_id === currentUserId
    const errorFor = (section: Section) => (error?.section === section ? error.message : null)

    const run = async (section: Section, subject: string, action: () => Promise<void>) => {
        setBusy(section)
        setError(null)
        try {
            await action()
        } catch (e) {
            setError({ section, message: describeApiError(e, subject) })
        } finally {
            setBusy(null)
        }
    }

    const save = () =>
        run('save', 'Saving the room', async () => {
            await updateRoom(room.id, { name: name.trim(), icon_url: iconUrl.trim() || null })
            setSaved(true)
            router.reload()
        })

    const leave = () =>
        run('leave', 'Leaving the room', async () => {
            await leaveRoom(room.id)
            router.visit('/')
        })

    const remove = () =>
        run('delete', 'Deleting the room', async () => {
            await deleteRoom(room.id)
            router.visit('/')
        })

    return (
        <div className="flex-1 min-h-0 overflow-y-auto bg-primary px-6 py-6">
            <div className="max-w-2xl mx-auto space-y-8">
                {canManageRoom && (
                    <section>
                        <p className={labelClass}>Room name</p>
                        <input
                            aria-label="Room name"
                            value={name}
                            maxLength={100}
                            onChange={(e) => {
                                setName(e.target.value)
                                setSaved(false)
                            }}
                            className={inputClass}
                        />

                        <p className={`${labelClass} mt-4`}>Icon URL</p>
                        <input
                            aria-label="Icon URL"
                            value={iconUrl}
                            placeholder="https://example.com/icon.png"
                            onChange={(e) => {
                                setIconUrl(e.target.value)
                                setSaved(false)
                            }}
                            className={inputClass}
                        />

                        <div className="flex items-center gap-3 mt-4">
                            <button
                                onClick={save}
                                disabled={busy === 'save' || !name.trim()}
                                className="px-4 py-2 rounded bg-accent-primary hover:bg-accent-secondary text-inverse text-sm font-medium transition-colors duration-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {busy === 'save' ? 'Saving…' : 'Save'}
                            </button>
                            {saved && <span className="text-sm text-text-muted">Saved.</span>}
                        </div>
                        {errorFor('save') && <p className="text-xs text-danger mt-1.5">{errorFor('save')}</p>}
                    </section>
                )}

                <section>
                    <p className={labelClass}>Leave room</p>
                    {isOwner ? (
                        <p className="text-sm text-text-muted">
                            You own this room, so you can't leave it. Delete the room instead.
                        </p>
                    ) : confirmingLeave ? (
                        <div className="flex items-center gap-3">
                            <span className="text-sm text-text-secondary">Leave {room.name}?</span>
                            <button
                                onClick={leave}
                                disabled={busy === 'leave'}
                                className="px-4 py-2 rounded bg-danger text-inverse text-sm font-medium transition-colors duration-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {busy === 'leave' ? 'Leaving…' : 'Yes, leave'}
                            </button>
                            <button
                                onClick={() => setConfirmingLeave(false)}
                                disabled={busy === 'leave'}
                                className="px-4 py-2 rounded bg-fifth hover:bg-sixth text-text-secondary text-sm font-medium transition-colors duration-100"
                            >
                                Cancel
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setConfirmingLeave(true)}
                            className="px-4 py-2 rounded bg-fifth hover:bg-sixth text-text-secondary text-sm font-medium transition-colors duration-100"
                        >
                            Leave room
                        </button>
                    )}
                    {errorFor('leave') && <p className="text-xs text-danger mt-1.5">{errorFor('leave')}</p>}
                </section>

                {canDeleteRoom && (
                    <section className="rounded border border-danger/30 bg-danger/10 p-4">
                        <p className={labelClass}>Delete room</p>
                        <p className="text-sm text-text-secondary mb-3">
                            This permanently deletes the room, its channels, messages and attachments for everyone.
                            Type <span className="font-semibold text-text-primary">{room.name}</span> to confirm.
                        </p>
                        <div className="flex gap-2">
                            <input
                                aria-label="Type the room name to confirm"
                                value={deleteConfirmation}
                                onChange={(e) => setDeleteConfirmation(e.target.value)}
                                className={inputClass}
                            />
                            <button
                                onClick={remove}
                                disabled={deleteConfirmation !== room.name || busy === 'delete'}
                                className="px-4 py-2 rounded bg-danger text-inverse text-sm font-medium transition-colors duration-100 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                            >
                                {busy === 'delete' ? 'Deleting…' : 'Delete room'}
                            </button>
                        </div>
                        {errorFor('delete') && <p className="text-xs text-danger mt-1.5">{errorFor('delete')}</p>}
                    </section>
                )}
            </div>
        </div>
    )
}
