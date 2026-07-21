import { useState } from 'react'
import { clsx } from 'clsx'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Avatar } from '@/components/ui/Avatar'
import { EmojiPicker } from '@/components/emoji/EmojiPicker'
import { addReaction, removeReaction, deleteMessage, editMessage } from '@/services/api'
import type { Message, User } from '@/types'

interface Props {
    message: Message
    grouped: boolean          // same author as previous → hide avatar/header
    currentUser: User
    onReply: (m: Message) => void
}

const time = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

const fullTime = (iso: string) =>
    new Date(iso).toLocaleString([], {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })

export function MessageRow({ message, grouped, currentUser, onReply }: Props) {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(message.content ?? '')

    const isMine = message.author_id === currentUser.id

    const toggleReaction = (emoji: string) => {
        const r = message.reactions?.find((x) => x.emoji === emoji)
        r?.reacted ? removeReaction(message.id, emoji) : addReaction(message.id, emoji)
    }

    const save = async () => {
        const trimmed = draft.trim()
        if (trimmed && trimmed !== message.content) {
            await editMessage(message.id, trimmed)
        }
        setEditing(false)
    }

    return (
        <div className={clsx('px-4 hover:bg-surface-500 transition-colors duration-75 group', grouped ? 'py-0.5' : 'pt-4 pb-0.5')}>
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

                    {/* Reply context */}
                    {message.reply_to && (
                        <div className="flex items-center gap-1.5 mb-1 pl-2 border-l-2 border-surface-400 text-xs text-text-muted">
                            <span className="font-medium text-text-secondary">
                                {message.reply_to.author?.display_name}
                            </span>
                            <span className="truncate">{message.reply_to.content}</span>
                        </div>
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
                                className="w-full bg-surface-800 rounded p-2 text-sm resize-none focus:outline-none"
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
                                        className="px-3 py-2 bg-surface-500 border border-surface-400 rounded text-xs
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
                                    onClick={() => toggleReaction(r.emoji)}
                                    className={clsx(
                                        'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors',
                                        r.reacted
                                            ? 'bg-brand/20 border-brand text-text-primary'
                                            : 'bg-surface-500 border-surface-400 text-text-secondary hover:border-brand',
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
                    <EmojiPicker onSelect={(e) => addReaction(message.id, e)}>
                        <button className="p-1 rounded hover:bg-surface-400 text-text-muted hover:text-text-primary">
                            😀
                        </button>
                    </EmojiPicker>

                    <button
                        onClick={() => onReply(message)}
                        className="p-1 rounded hover:bg-surface-400 text-text-muted hover:text-text-primary"
                        title="Reply"
                    >
                        ↩
                    </button>

                    {isMine && (
                        <DropdownMenu.Root>
                            <DropdownMenu.Trigger asChild>
                                <button className="p-1 rounded hover:bg-surface-400 text-text-muted hover:text-text-primary">
                                    ⋯
                                </button>
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Portal>
                                <DropdownMenu.Content
                                    align="end"
                                    sideOffset={4}
                                    className="z-50 min-w-[160px] p-1 rounded-md bg-surface-900 border
                                               border-surface-400 shadow-xl text-sm animate-fade-in"
                                >
                                    <DropdownMenu.Item
                                        onSelect={() => setEditing(true)}
                                        className="px-2 py-1.5 rounded cursor-pointer outline-none text-text-secondary
                                                   hover:bg-brand hover:text-white"
                                    >
                                        Edit
                                    </DropdownMenu.Item>
                                    <DropdownMenu.Item
                                        onSelect={() => deleteMessage(message.id)}
                                        className="px-2 py-1.5 rounded cursor-pointer outline-none text-danger
                                                   hover:bg-danger hover:text-white"
                                    >
                                        Delete
                                    </DropdownMenu.Item>
                                </DropdownMenu.Content>
                            </DropdownMenu.Portal>
                        </DropdownMenu.Root>
                    )}
                </div>
            </div>
        </div>
    )
}
