import { useState } from 'react'
import { createChannel } from '@/services/api'
import {
    CHANNEL_CATEGORY_LABELS, KNOWN_CHANNEL_CATEGORIES, KNOWN_CHANNEL_TYPES, type ChannelTypeDescriptor,
} from '@/services/channelTypes'
import type { Channel, Room } from '@/types'

interface Props {
    room: Room
    creatableTypes: string[]
    onClose: () => void
    onCreated: (channel: Channel) => void
}

function groupByCategory(descriptors: ChannelTypeDescriptor[]): [string, ChannelTypeDescriptor[]][] {
    const grouped = new Map<string, ChannelTypeDescriptor[]>()
    for (const descriptor of descriptors) {
        const list = grouped.get(descriptor.category) ?? []
        list.push(descriptor)
        grouped.set(descriptor.category, list)
    }

    return Array.from(grouped.entries()).sort(
        ([a], [b]) => KNOWN_CHANNEL_CATEGORIES.indexOf(a) - KNOWN_CHANNEL_CATEGORIES.indexOf(b)
    )
}

export function CreateChannelModal({ room, creatableTypes, onClose, onCreated }: Props) {
    const availableTypes = KNOWN_CHANNEL_TYPES.filter((d) => creatableTypes.includes(d.key))
    const sections = groupByCategory(availableTypes)

    const [name, setName] = useState('')
    const [type, setType] = useState(availableTypes[0]?.key ?? '')
    const [topic, setTopic] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    const create = async () => {
        if (!name.trim() || !type || busy) return

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
                className="w-full max-w-md bg-second rounded-lg p-6 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="text-lg font-semibold text-text-primary mb-4">Create channel</h2>

                {availableTypes.length === 0 ? (
                    <p className="text-sm text-text-muted mb-4">You don't have permission to create any channel type.</p>
                ) : (
                    sections.map(([category, descriptors]) => (
                        <div key={category} className="mb-4">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-2">
                                {CHANNEL_CATEGORY_LABELS[category] ?? category}
                            </p>
                            <div className="flex gap-2">
                                {descriptors.map((descriptor) => (
                                    <button
                                        key={descriptor.key}
                                        onClick={() => setType(descriptor.key)}
                                        title={descriptor.description}
                                        className={
                                            'flex-1 flex flex-col items-center gap-1 py-2 rounded border text-sm transition-colors duration-100 ' +
                                            (type === descriptor.key
                                                ? 'border-accent-primary bg-fifth text-text-primary'
                                                : 'border-sixth text-text-muted hover:text-text-primary')
                                        }
                                    >
                                        <span className="text-lg">{descriptor.icon}</span>
                                        {descriptor.key}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))
                )}

                <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-2">
                    Channel name
                </p>
                <input
                    type="text"
                    value={name}
                    placeholder="new-channel"
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && create()}
                    className="w-full mb-4 bg-third border border-sixth rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary transition-colors duration-100"
                />

                <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-2">
                    Topic (optional)
                </p>
                <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && create()}
                    className="w-full mb-1 bg-third border border-sixth rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary transition-colors duration-100"
                />
                {error && <p className="text-xs text-danger mt-1.5">{error}</p>}

                <div className="flex gap-2 mt-5">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2 rounded bg-fifth hover:bg-sixth text-text-secondary text-sm font-medium transition-colors duration-100"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={create}
                        disabled={busy || !name.trim() || !type}
                        className="flex-1 px-4 py-2 rounded bg-accent-primary hover:bg-accent-secondary text-inverse text-sm font-medium transition-colors duration-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {busy ? 'Creating…' : 'Create'}
                    </button>
                </div>
            </div>
        </div>
    )
}
