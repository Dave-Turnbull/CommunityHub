import { useEffect, useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { fetchConversationCandidates } from '@/services/api'
import type { User } from '@/types'

interface Props {
    selected: User[]
    onChange: (users: User[]) => void
}

/** Search + multi-select over users sharing a room with the current user. */
export function UserPicker({ selected, onChange }: Props) {
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<User[]>([])

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchConversationCandidates(query || undefined).then(setResults).catch(() => {})
        }, 250)
        return () => clearTimeout(timer)
    }, [query])

    const isSelected = (user: User) => selected.some((u) => u.id === user.id)

    const toggle = (user: User) => {
        onChange(isSelected(user) ? selected.filter((u) => u.id !== user.id) : [...selected, user])
    }

    return (
        <div>
            {!!selected.length && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                    {selected.map((user) => (
                        <span
                            key={user.id}
                            className="inline-flex items-center gap-1 pl-1 pr-2 py-1 rounded-full bg-surface-500 text-xs text-text-secondary"
                        >
                            <Avatar user={user} size="xs" />
                            {user.display_name}
                            <button
                                onClick={() => toggle(user)}
                                className="text-text-muted hover:text-danger transition-colors duration-100"
                            >
                                ✕
                            </button>
                        </span>
                    ))}
                </div>
            )}

            <input
                type="text"
                value={query}
                placeholder="Search people you share a room with…"
                onChange={(e) => setQuery(e.target.value)}
                className="w-full bg-surface-800 border border-surface-400 rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand transition-colors duration-100 mb-2"
            />

            <div className="max-h-48 overflow-y-auto">
                {results.length === 0 && (
                    <p className="px-1 py-2 text-xs text-text-muted">No matches.</p>
                )}

                {results.map((user) => (
                    <label
                        key={user.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-500 cursor-pointer"
                    >
                        <input
                            type="checkbox"
                            checked={isSelected(user)}
                            onChange={() => toggle(user)}
                            className="accent-brand"
                        />
                        <Avatar user={user} size="sm" />
                        <span className="text-sm text-text-secondary truncate">{user.display_name}</span>
                    </label>
                ))}
            </div>
        </div>
    )
}
