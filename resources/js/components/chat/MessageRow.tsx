import { useState } from 'react'
import { clsx } from 'clsx'
import { Avatar } from '@/components/ui/Avatar'
import { DropdownMenu } from '@/components/ui/DropdownMenu'
import { EmojiPicker } from '@/components/emoji/EmojiPicker'
import { removeMessage, saveEdit, toggleReaction } from '@/services/messageActions'
import type { Message, User } from '@/types'

interface Props {
    message: Message
    scopeId: string
    grouped: boolean          // same author as previous → hide avatar/header
    currentUser: User
    onReply: (m: Message) => void
    /** "Go to message" (see CLAUDE.md) — jumps to the message a reply preview
     * points at. Only called from the reply-context button below. */
    onJumpToMessage?: (messageId: string) => void
    /** Briefly flashed after a jump lands on this row — see MessageList's scrollTo. */
    highlighted?: boolean
}

const time = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

const fullTime = (iso: string) =>
    new Date(iso).toLocaleString([], {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })

export function MessageRow({ message, scopeId, grouped, currentUser, onReply, onJumpToMessage, highlighted }: Props) {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(message.content ?? '')

    const isMine = message.author_id === currentUser.id

    const react = (emoji: string) => {
        toggleReaction(scopeId, message, emoji).catch(() => {})
    }

    // Closes on submit rather than on the server's answer — saveEdit puts the
    // old content back if the save fails, and the editor comes back with the
    // draft still in it so the attempt isn't lost.
    const save = () => {
        const trimmed = draft.trim()
        setEditing(false)

        if (!trimmed || trimmed === message.content) return

        saveEdit(scopeId, message, trimmed).catch(() => setEditing(true))
    }

    return (
        <div
            className={clsx(
                'px-4 hover:bg-fifth transition-colors duration-75 group',
                grouped ? 'py-0.5' : 'pt-4 pb-0.5',
                highlighted && 'bg-accent-primary/10',
            )}
        >
            <div className="flex gap-3">
                {/* Gutter: avatar, or hover-timestamp when grouped */}
                <div className="w-10 flex-shrink-0">
                    {grouped ? (
                        <span className="block text-[10px] text-text-muted opacity-0 group-hover:opacity-100 pt-1 text-center select-none">
                            {time(message.created_at)}
                        </span>
                    ) : (
                        <Avatar user={message.author!} size="md" />
                    )}
                </div>

                <div className="flex-1 min-w-0">
                    {!grouped && (
                        <div className="flex items-baseline gap-2">
                            <span className="font-semibold text-text-primary">
                                {message.author?.display_name}
                            </span>
                            <span className="text-[11px] text-text-muted">
                                {fullTime(message.created_at)}
                            </span>
                        </div>
                    )}

                    {/* Reply context — jumps to the replied-to message (see CLAUDE.md's "go to message") */}
                    {message.reply_to && (
                        <button
                            type="button"
                            onClick={() => onJumpToMessage?.(message.reply_to_id!)}
                            className="flex items-center gap-1.5 mb-1 pl-2 border-l-2 border-sixth text-xs text-text-muted
                                       hover:border-accent-primary hover:text-text-secondary transition-colors text-left"
                        >
                            <span className="font-medium text-text-secondary">
                                {message.reply_to.author?.display_name}
                            </span>
                            <span className="truncate">{message.reply_to.content}</span>
                        </button>
                    )}

                    {editing ? (
                        <div>
                            <textarea
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save() }
                                    if (e.key === 'Escape') setEditing(false)
                                }}
                                autoFocus
                                className="w-full bg-third rounded p-2 text-sm resize-none focus:outline-none"
                                rows={2}
                            />
                            <p className="text-[11px] text-text-muted mt-1">
                                escape to cancel · enter to save
                            </p>
                        </div>
                    ) : (
                        <p className="text-text-primary leading-relaxed break-words whitespace-pre-wrap">
                            {message.content}
                            {message.is_edited && (
                                <span className="text-[10px] text-text-muted ml-1">(edited)</span>
                            )}
                        </p>
                    )}

                    {/* Attachments */}
                    {!!message.attachments?.length && (
                        <div className="mt-2 flex flex-wrap gap-2">
                            {message.attachments.map((a) =>
                                a.mime_type.startsWith('image/') ? (
                                    <a key={a.id} href={a.url} target="_blank" rel="noreferrer">
                                        <img
                                            src={a.url}
                                            alt={a.filename}
                                            className="max-w-sm max-h-80 rounded object-cover"
                                        />
                                    </a>
                                ) : (
                                    <a
                                        key={a.id}
                                        href={a.url}
                                        download
                                        className="px-3 py-2 bg-fifth border border-sixth rounded text-xs
                                                   text-text-secondary hover:text-text-primary"
                                    >
                                        📎 {a.filename}
                                    </a>
                                )
                            )}
                        </div>
                    )}

                    {/* Reactions */}
                    {!!message.reactions?.length && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                            {message.reactions.map((r) => (
                                <button
                                    key={r.emoji}
                                    onClick={() => react(r.emoji)}
                                    className={clsx(
                                        'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors',
                                        r.reacted
                                            ? 'bg-accent-primary/20 border-accent-primary text-text-primary'
                                            : 'bg-fifth border-sixth text-text-secondary hover:border-accent-primary',
                                    )}
                                >
                                    <span>{r.emoji}</span>
                                    <span>{r.count}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Hover actions */}
                <div className="opacity-0 group-hover:opacity-100 flex items-start gap-0.5 transition-opacity">
                    <EmojiPicker onSelect={react}>
                        <button className="p-1 rounded hover:bg-sixth text-text-muted hover:text-text-primary">
                            😀
                        </button>
                    </EmojiPicker>

                    <button
                        onClick={() => onReply(message)}
                        className="p-1 rounded hover:bg-sixth text-text-muted hover:text-text-primary"
                        title="Reply"
                    >
                        ↩
                    </button>

                    {isMine && (
                        <DropdownMenu
                            trigger={
                                <button className="p-1 rounded hover:bg-sixth text-text-muted hover:text-text-primary">
                                    ⋯
                                </button>
                            }
                            align="end"
                            sideOffset={4}
                            className="min-w-[160px] p-1 rounded-md bg-fourth border border-sixth shadow-xl text-sm"
                        >
                            <DropdownMenu.Item onSelect={() => setEditing(true)}>Edit</DropdownMenu.Item>
                            <DropdownMenu.Item
                                onSelect={() => { removeMessage(scopeId, message).catch(() => {}) }}
                                danger
                            >
                                Delete
                            </DropdownMenu.Item>
                        </DropdownMenu>
                    )}
                </div>
            </div>
        </div>
    )
}
