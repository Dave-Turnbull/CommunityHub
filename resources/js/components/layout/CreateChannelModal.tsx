import { useState } from 'react'
import { createChannel } from '@/services/api'
import { KNOWN_CHANNEL_TYPES } from '@/services/channelTypes'
import type { Channel, Room } from '@/types'

interface Props {
    room: Room
    onClose: () => void
    onCreated: (channel: Channel) => void
}

export function CreateChannelModal({ room, onClose, onCreated }: Props) {
    const [name, setName] = useState('')
    const [type, setType] = useState(KNOWN_CHANNEL_TYPES[0]?.key ?? 'text')
    const [topic, setTopic] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    const create = async () => {
        if (!name.trim() || busy) return

        setBusy(true)
        setError(null)
        try {
            const channel = await createChannel(room.id, {
                name: name.trim(),
                type,
                topic: topic.trim() || undefined,
            })
            onCreated(channel)
            onClose()
        } catch (e: any) {
            setError(e.response?.data?.message ?? e.response?.data?.errors?.name?.[0] ?? 'Could not create channel.')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
            <div
                className="w-full max-w-md bg-surface-700 rounded-lg p-6 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="text-lg font-semibold text-text-primary mb-4">Create channel</h2>

                <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-2">
                    Channel type
                </p>
                <div className="flex gap-2 mb-4">
                    {KNOWN_CHANNEL_TYPES.map((descriptor) => (
                        <button
                            key={descriptor.key}
                            onClick={() => setType(descriptor.key)}
                            className={
                                'flex-1 flex flex-col items-center gap-1 py-2 rounded border text-sm transition-colors duration-100 ' +
                                (type === descriptor.key
                                    ? 'border-brand bg-surface-500 text-text-primary'
                                    : 'border-surface-400 text-text-muted hover:text-text-primary')
                            }
                        >
                            <span className="text-lg">{descriptor.icon}</span>
                            {descriptor.key}
                        </button>
                    ))}
                </div>

                <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-2">
                    Channel name
                </p>
                <input
                    type="text"
                    value={name}
                    placeholder="new-channel"
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && create()}
                    className="w-full mb-4 bg-surface-800 border border-surface-400 rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand transition-colors duration-100"
                />

                <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-2">
                    Topic (optional)
                </p>
                <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && create()}
                    className="w-full mb-1 bg-surface-800 border border-surface-400 rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand transition-colors duration-100"
                />
                {error && <p className="text-xs text-danger mt-1.5">{error}</p>}

                <div className="flex gap-2 mt-5">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2 rounded bg-surface-500 hover:bg-surface-400 text-text-secondary text-sm font-medium transition-colors duration-100"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={create}
                        disabled={busy || !name.trim()}
                        className="flex-1 px-4 py-2 rounded bg-brand hover:bg-brand-hover text-white text-sm font-medium transition-colors duration-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {busy ? 'Creating…' : 'Create'}
                    </button>
                </div>
            </div>
        </div>
    )
}
