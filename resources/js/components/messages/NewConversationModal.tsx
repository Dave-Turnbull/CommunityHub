import { useState } from 'react'
import { router } from '@inertiajs/react'
import { MessageInput } from '@/components/chat/MessageInput'
import { resolveConversation, startConversation } from '@/services/api'
import { UserPicker } from './UserPicker'
import type { SendPayload, StartConversationPayload } from '@/services/api'
import type { Conversation, User } from '@/types'

interface Props {
    onClose: () => void
}

type Step = 'picking' | 'confirm-duplicate' | 'compose'

/**
 * A conversation is only created once the first message is actually sent —
 * picking participants (and optionally naming a group) is a client-side
 * draft state. Selecting exactly one person silently reuses an existing DM;
 * an exact-membership group match is surfaced as a confirm-before-duplicate
 * step instead of being reused automatically. See ConversationController.
 */
export function NewConversationModal({ onClose }: Props) {
    const [selected, setSelected] = useState<User[]>([])
    const [name, setName] = useState('')
    const [step, setStep] = useState<Step>('picking')
    const [matchedGroup, setMatchedGroup] = useState<Conversation | null>(null)
    const [confirmDuplicate, setConfirmDuplicate] = useState(false)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const goToConversation = (id: string) => {
        onClose()
        router.visit(`/conversations/${id}`)
    }

    const continueFromPicking = async () => {
        if (!selected.length || busy) return

        setBusy(true)
        setError(null)
        try {
            const { type, existing } = await resolveConversation(selected.map((u) => u.id))

            if (type === 'dm' && existing) {
                goToConversation(existing.id)
                return
            }

            if (type === 'group' && existing) {
                setMatchedGroup(existing)
                setStep('confirm-duplicate')
                return
            }

            setStep('compose')
        } catch (e: any) {
            setError(e.response?.data?.message ?? 'Could not start the conversation.')
        } finally {
            setBusy(false)
        }
    }

    const send = async (payload: SendPayload) => {
        setError(null)

        const body: StartConversationPayload = {
            ...payload,
            user_ids: selected.map((u) => u.id),
            name: selected.length > 1 ? (name.trim() || undefined) : undefined,
            confirm_duplicate: confirmDuplicate,
        }

        try {
            const { conversation } = await startConversation(body)
            goToConversation(conversation.id)
        } catch (e: any) {
            if (e.response?.status === 409 && e.response?.data?.existing) {
                setMatchedGroup(e.response.data.existing)
                setStep('confirm-duplicate')
                return
            }
            setError(e.response?.data?.message ?? 'Could not send the message.')
        }
    }

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
            <div
                className="w-full max-w-md bg-surface-panel rounded-lg p-6 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {step === 'picking' && (
                    <>
                        <h2 className="text-lg font-semibold text-text-primary mb-4">New message</h2>

                        <UserPicker selected={selected} onChange={setSelected} />

                        {selected.length > 1 && (
                            <input
                                type="text"
                                value={name}
                                placeholder="Group name (optional)"
                                onChange={(e) => setName(e.target.value)}
                                className="w-full mt-3 bg-surface-inset border border-surface-subtle rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand transition-colors duration-100"
                            />
                        )}

                        {error && <p className="text-xs text-danger mt-2">{error}</p>}

                        <div className="flex gap-2 mt-5">
                            <button
                                onClick={onClose}
                                className="flex-1 px-4 py-2 rounded bg-surface-raised hover:bg-surface-subtle text-text-secondary text-sm font-medium transition-colors duration-100"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={continueFromPicking}
                                disabled={!selected.length || busy}
                                className="flex-1 px-4 py-2 rounded bg-brand hover:bg-brand-hover text-inverse text-sm font-medium transition-colors duration-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {busy ? 'Checking…' : 'Continue'}
                            </button>
                        </div>
                    </>
                )}

                {step === 'confirm-duplicate' && matchedGroup && (
                    <>
                        <h2 className="text-lg font-semibold text-text-primary mb-2">Group already exists</h2>
                        <p className="text-sm text-text-muted mb-5">
                            You already have a group with these exact members
                            {matchedGroup.name ? ` called "${matchedGroup.name}"` : ''}.
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => goToConversation(matchedGroup.id)}
                                className="flex-1 px-4 py-2 rounded bg-surface-raised hover:bg-surface-subtle text-text-secondary text-sm font-medium transition-colors duration-100"
                            >
                                Go to existing
                            </button>
                            <button
                                onClick={() => { setConfirmDuplicate(true); setStep('compose') }}
                                className="flex-1 px-4 py-2 rounded bg-brand hover:bg-brand-hover text-inverse text-sm font-medium transition-colors duration-100"
                            >
                                Create new anyway
                            </button>
                        </div>
                    </>
                )}

                {step === 'compose' && (
                    <>
                        <h2 className="text-lg font-semibold text-text-primary mb-1 truncate">
                            Message {selected.map((u) => u.display_name).join(', ')}
                        </h2>

                        {error && <p className="text-xs text-danger mb-2">{error}</p>}

                        <div className="mt-3 -mx-6 -mb-6">
                            <MessageInput
                                placeholder={`Message ${selected[0]?.display_name ?? ''}`}
                                replyTo={null}
                                onClearReply={() => {}}
                                onSend={send}
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
