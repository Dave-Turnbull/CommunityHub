import { useEffect, useState } from 'react'
import { fetchRoomInvites, revokeRoomInvite, sendRoomInvite } from '@/services/api'
import type { Room, RoomInvite } from '@/types'

interface Props {
    room: Room
    onClose: () => void
}

export function InviteModal({ room, onClose }: Props) {
    const [email, setEmail] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [invites, setInvites] = useState<RoomInvite[]>([])
    const [copied, setCopied] = useState(false)

    const inviteLink = `${window.location.origin}/join/${room.invite_code}`

    useEffect(() => {
        fetchRoomInvites(room.id).then(setInvites).catch(() => {})
    }, [room.id])

    useEffect(() => {
        if (!copied) return
        const timer = setTimeout(() => setCopied(false), 2000)
        return () => clearTimeout(timer)
    }, [copied])

    const copyLink = async () => {
        await navigator.clipboard.writeText(inviteLink)
        setCopied(true)
    }

    const send = async () => {
        if (!email.trim() || busy) return

        setBusy(true)
        setError(null)
        try {
            const invite = await sendRoomInvite(room.id, email.trim())
            setInvites((list) => [invite, ...list])
            setEmail('')
        } catch (e: any) {
            setError(e.response?.data?.message ?? e.response?.data?.errors?.email?.[0] ?? 'Could not send invite.')
        } finally {
            setBusy(false)
        }
    }

    const revoke = async (invite: RoomInvite) => {
        setInvites((list) => list.filter((i) => i.id !== invite.id))
        await revokeRoomInvite(invite.id).catch(() => {})
    }

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
            <div
                className="w-full max-w-md bg-second rounded-lg p-6 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="text-lg font-semibold text-text-primary mb-1">Invite people to {room.name}</h2>

                <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-2">
                    Invite link
                </p>
                <div className="flex gap-2 mb-5">
                    <input
                        type="text"
                        readOnly
                        value={inviteLink}
                        onFocus={(e) => e.target.select()}
                        className="flex-1 bg-third border border-sixth rounded px-3 py-2 text-sm text-text-muted"
                    />
                    <button
                        onClick={copyLink}
                        className="px-4 py-2 rounded bg-fifth hover:bg-sixth text-text-secondary text-sm font-medium transition-colors duration-100 flex-shrink-0"
                    >
                        {copied ? 'Copied!' : 'Copy'}
                    </button>
                </div>

                <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-2">
                    Invite by email
                </p>
                <p className="text-sm text-text-muted mb-4">
                    They'll get an email with a link to join — no account needed yet.
                </p>

                <div className="flex gap-2">
                    <input
                        type="email"
                        value={email}
                        placeholder="name@example.com"
                        onChange={(e) => setEmail(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && send()}
                        className="flex-1 bg-third border border-sixth rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary transition-colors duration-100"
                    />
                    <button
                        onClick={send}
                        disabled={busy}
                        className="px-4 py-2 rounded bg-accent-primary hover:bg-accent-secondary text-inverse text-sm font-medium transition-colors duration-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {busy ? 'Sending…' : 'Invite'}
                    </button>
                </div>
                {error && <p className="text-xs text-danger mt-1.5">{error}</p>}

                {invites.length > 0 && (
                    <div className="mt-5">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-2">
                            Pending invites
                        </p>
                        {invites.map((invite) => (
                            <div key={invite.id} className="flex items-center justify-between py-1.5">
                                <span className="text-sm text-text-secondary truncate">{invite.email}</span>
                                <button
                                    onClick={() => revoke(invite)}
                                    className="text-xs text-text-muted hover:text-danger transition-colors duration-100"
                                >
                                    Revoke
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <button
                    onClick={onClose}
                    className="w-full mt-5 px-4 py-2 rounded bg-fifth hover:bg-sixth text-text-secondary text-sm font-medium transition-colors duration-100"
                >
                    Done
                </button>
            </div>
        </div>
    )
}
