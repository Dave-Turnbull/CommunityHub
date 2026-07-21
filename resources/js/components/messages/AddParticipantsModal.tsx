import { useState } from 'react'
import { router } from '@inertiajs/react'
import { addConversationParticipants } from '@/services/api'
import { UserPicker } from './UserPicker'
import type { Conversation, User } from '@/types'

interface Props {
    conversation: Conversation
    onClose: () => void
}

export function AddParticipantsModal({ conversation, onClose }: Props) {
    const [selected, setSelected] = useState<User[]>([])
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const add = async () => {
        if (!selected.length || busy) return

        setBusy(true)
        setError(null)
        try {
            await addConversationParticipants(conversation.id, selected.map((u) => u.id))
            router.reload({ only: ['conversation'] })
            onClose()
        } catch (e: any) {
            setError(e.response?.data?.message ?? 'Could not add people.')
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
                <h2 className="text-lg font-semibold text-text-primary mb-4">
                    Add people to {conversation.name ?? 'Group Chat'}
                </h2>

                <UserPicker selected={selected} onChange={setSelected} />

                {error && <p className="text-xs text-danger mt-2">{error}</p>}

                <div className="flex gap-2 mt-5">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2 rounded bg-surface-500 hover:bg-surface-400 text-text-secondary text-sm font-medium transition-colors duration-100"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={add}
                        disabled={!selected.length || busy}
                        className="flex-1 px-4 py-2 rounded bg-brand hover:bg-brand-hover text-white text-sm font-medium transition-colors duration-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {busy ? 'Adding…' : 'Add'}
                    </button>
                </div>
            </div>
        </div>
    )
}
