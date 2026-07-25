import { useState } from 'react'
import type { ReactNode } from 'react'
import { clsx } from 'clsx'
import { Link, router } from '@inertiajs/react'
import { Popover } from '@/components/ui/Popover'
import { usePresence } from '@/stores'
import { updateUserStatus } from '@/services/api'
import type { RecentCustomStatus, User, UserStatus } from '@/types'

const STATUSES: { value: Exclude<UserStatus, 'custom'>; label: string; color: string }[] = [
    { value: 'online',  label: 'Online',         color: 'bg-status-online' },
    { value: 'idle',    label: 'Idle',           color: 'bg-status-idle' },
    { value: 'dnd',     label: 'Do Not Disturb', color: 'bg-status-dnd' },
    { value: 'offline', label: 'Invisible',      color: 'bg-status-offline' },
]

interface Props {
    user: User
    recentCustomStatuses: RecentCustomStatus[]
    trigger: ReactNode
}

// Composes ui/Popover rather than ui/DropdownMenu — this panel mixes
// dismiss-on-click status buttons with a persistent text/color input that
// must survive keystrokes without the panel auto-closing, which fits
// Popover's free-form content, not DropdownMenu's auto-closing Item model.
// Deliberately left uncontrolled — picking a status or a recent chip fires
// the request but leaves the popover open, since setting a plain status and
// a custom status in the same visit is a normal flow; only Settings/Logout
// leave it behind.
export function UserStatusPopover({ user, recentCustomStatuses, trigger }: Props) {
    const currentStatus = usePresence((s) => s.statuses[user.id]?.status) ?? user.status
    const setPresence = usePresence((s) => s.setPresence)

    const [color, setColor] = useState(user.custom_status_color ?? '#5865F2')
    const [text, setText] = useState('')
    const [recent, setRecent] = useState(recentCustomStatuses)

    // One call for every status change, plain or custom — the response is
    // always the full new status/customStatus/customStatusColor together, so
    // there's no partial field to merge or carry forward from a prior render.
    const applyStatus = async (status: UserStatus, customStatus?: string, customStatusColor?: string) => {
        const data = await updateUserStatus(status, customStatus, customStatusColor)
        setPresence(user.id, {
            status: data.status, customStatus: data.custom_status, customStatusColor: data.custom_status_color,
        })
        setRecent(data.recent)
        if (status === 'custom') setText('')
    }

    return (
        <Popover
            trigger={trigger}
            side="top"
            align="start"
            sideOffset={8}
            className="w-64 rounded-lg overflow-hidden shadow-2xl border border-sixth bg-fourth p-2 text-sm"
        >
            <div className="grid grid-cols-2 gap-1 mb-2">
                {STATUSES.map((s) => (
                    <button
                        key={s.value}
                        onClick={() => applyStatus(s.value)}
                        className={clsx(
                            'flex items-center gap-2 px-2 py-1.5 rounded border text-xs transition-colors',
                            currentStatus === s.value
                                ? 'border-accent-primary bg-accent-primary/10 text-text-primary'
                                : 'border-sixth text-text-secondary hover:border-accent-primary',
                        )}
                    >
                        <span className={clsx('w-2 h-2 rounded-full flex-shrink-0', s.color)} />
                        <span className="truncate">{s.label}</span>
                    </button>
                ))}
            </div>

            <div className="h-px bg-sixth my-2" />

            <div className="flex items-center gap-1.5 mb-2">
                <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    aria-label="Custom status color"
                    className="w-7 h-7 flex-shrink-0 rounded cursor-pointer bg-transparent border border-sixth p-0.5"
                />
                <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && text.trim()) applyStatus('custom', text.trim(), color)
                    }}
                    placeholder="Set custom status"
                    maxLength={128}
                    className="flex-1 min-w-0 bg-third border border-sixth rounded px-2 py-1.5 text-xs
                               text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary"
                />
                <button
                    onClick={() => applyStatus('custom', text.trim(), color)}
                    disabled={!text.trim()}
                    title="Save custom status"
                    className="flex-shrink-0 p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-fifth
                               disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    💾
                </button>
            </div>

            {!!recent.length && (
                <div className="flex flex-wrap gap-1 mb-2">
                    {recent.map((r) => (
                        <button
                            key={r.text}
                            onClick={() => applyStatus('custom', r.text, r.color)}
                            className="flex items-center gap-1.5 max-w-full px-2 py-1 rounded-full text-xs bg-fifth
                                       border border-sixth text-text-secondary hover:border-accent-primary"
                        >
                            <span
                                className="w-2.5 h-2.5 rounded-full flex-shrink-0 ring-1 ring-inset ring-inverse/30"
                                style={{ backgroundColor: r.color }}
                            />
                            <span className="truncate">{r.text}</span>
                        </button>
                    ))}
                </div>
            )}

            <div className="h-px bg-sixth my-2" />

            <Link
                href="/settings"
                className="block px-2 py-1.5 rounded text-text-secondary hover:bg-fifth hover:text-text-primary"
            >
                ⚙ Settings
            </Link>
            <button
                onClick={() => router.post('/logout')}
                className="w-full text-left px-2 py-1.5 rounded text-text-secondary hover:bg-fifth hover:text-danger"
            >
                ⏻ Log out
            </button>
        </Popover>
    )
}
