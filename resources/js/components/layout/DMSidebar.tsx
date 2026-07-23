import { useState } from 'react'
import { clsx } from 'clsx'
import { Link } from '@inertiajs/react'
import { Avatar } from '@/components/ui/Avatar'
import { NewConversationModal } from '@/components/messages/NewConversationModal'
import { UserPanel } from './UserPanel'
import type { Conversation, User } from '@/types'

interface Props {
    conversations: Conversation[]
    currentUser: User
    activeConversationId?: string
}

/** For a DM show the other person; for a group show the group name. */
function title(c: Conversation, meId: string): string {
    if (c.type === 'group') return c.name ?? 'Group Chat'

    const other = c.participants?.find((p) => p.user_id !== meId)
    return other?.user?.display_name ?? 'Unknown'
}

export function DMSidebar({ conversations, currentUser, activeConversationId }: Props) {
    const [composing, setComposing] = useState(false)

    const dms    = conversations.filter((c) => c.type === 'dm')
    const groups = conversations.filter((c) => c.type === 'group')

    const renderList = (list: Conversation[], label: string) => {
        if (!list.length) return null

        return (
            <div className="mb-4">
                <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                    {label}
                </p>

                {list.map((c) => {
                    const other = c.participants?.find((p) => p.user_id !== currentUser.id)

                    return (
                        <Link
                            key={c.id}
                            href={`/conversations/${c.id}`}
                            className={clsx(
                                'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors duration-100',
                                c.id === activeConversationId
                                    ? 'bg-surface-400 text-text-primary'
                                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-500',
                            )}
                        >
                            {c.type === 'dm' && other?.user ? (
                                <Avatar user={other.user} size="sm" showStatus />
                            ) : (
                                <span className="w-8 h-8 grid place-items-center rounded-full bg-surface-400">
                                    👥
                                </span>
                            )}

                            <div className="flex-1 min-w-0">
                                <p className="truncate">{title(c, currentUser.id)}</p>
                                {c.last_message && (
                                    <p className="text-[11px] text-text-muted truncate">
                                        {c.last_message.content ?? '📎 Attachment'}
                                    </p>
                                )}
                            </div>

                            {c.unread_count > 0 && (
                                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-xxs font-bold bg-danger text-white leading-none">
                                    {c.unread_count}
                                </span>
                            )}
                        </Link>
                    )
                })}
            </div>
        )
    }

    return (
        <div className="w-sidebar-channel bg-surface-700 flex flex-col flex-shrink-0">
            <div className="h-12 px-3 flex items-center justify-between border-b border-surface-800 flex-shrink-0">
                <span className="font-semibold text-text-primary">Messages</span>
                <button
                    onClick={() => setComposing(true)}
                    title="New message"
                    className="text-text-muted hover:text-text-primary transition-colors duration-100 flex-shrink-0"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path d="M14.7 2.3a1 1 0 0 1 1.4 0l1.6 1.6a1 1 0 0 1 0 1.4L8.6 14.4l-3.3.9a.5.5 0 0 1-.6-.6l.9-3.3L14.7 2.3ZM3 17h14v1.5H3V17Z" />
                    </svg>
                </button>
            </div>

            {composing && <NewConversationModal onClose={() => setComposing(false)} />}

            <nav className="flex-1 min-h-0 overflow-y-auto p-2 select-none">
                {renderList(dms, 'Direct Messages')}
                {renderList(groups, 'Group Messages')}

                {!conversations.length && (
                    <p className="px-2 py-4 text-xs text-text-muted">
                        No conversations yet.
                    </p>
                )}
            </nav>

            <UserPanel user={currentUser} />
        </div>
    )
}
