import { useRef, useState } from 'react'
import { clsx } from 'clsx'
import { useDropzone } from 'react-dropzone'
import { EmojiPicker } from '@/components/emoji/EmojiPicker'
import { uploadFile, sendChannelMessage, sendConversationMessage } from '@/services/api'
import { useMessages } from '@/stores'
import type { Message } from '@/types'
import type { SendPayload } from '@/services/api'

interface Props {
    scopeId?: string
    scopeType?: 'channel' | 'conversation'
    placeholder: string
    replyTo: Message | null
    onClearReply: () => void
    /** When set, overrides the normal scope-based send — see NewConversationModal. */
    onSend?: (payload: SendPayload) => Promise<void>
}

export function MessageInput({
    scopeId, scopeType, placeholder, replyTo, onClearReply, onSend,
}: Props) {
    const [text, setText] = useState('')
    const [files, setFiles] = useState<File[]>([])
    const [busy, setBusy] = useState(false)
    const areaRef = useRef<HTMLTextAreaElement>(null)

    // The sender adds their own message locally — the broadcast uses toOthers()
    const addMessage = useMessages((s) => s.add)

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        noClick: true,
        noKeyboard: true,
        maxSize: 8 * 1024 * 1024,
        onDrop: (dropped) => setFiles((f) => [...f, ...dropped]),
    })

    const grow = () => {
        const el = areaRef.current
        if (!el) return
        el.style.height = 'auto'
        el.style.height = `${Math.min(el.scrollHeight, 200)}px`
    }

    const send = async () => {
        const content = text.trim()
        if ((!content && !files.length) || busy) return

        setBusy(true)
        try {
            const uploaded = await Promise.all(files.map(uploadFile))

            const payload: SendPayload = {
                content: content || undefined,
                attachment_ids: uploaded.map((a) => a.id),
                reply_to_id: replyTo?.id,
            }

            if (onSend) {
                await onSend(payload)
            } else {
                const message = scopeType === 'channel'
                    ? await sendChannelMessage(scopeId!, payload)
                    : await sendConversationMessage(scopeId!, payload)

                addMessage(scopeId!, message)
            }

            setText('')
            setFiles([])
            onClearReply()
            if (areaRef.current) areaRef.current.style.height = 'auto'
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="px-4 pb-6 pt-1 flex-shrink-0">
            {replyTo && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-raised rounded-t-lg
                                border-b border-surface-subtle text-xs text-text-muted">
                    <span>
                        Replying to{' '}
                        <strong className="text-text-secondary">
                            {replyTo.author?.display_name}
                        </strong>
                    </span>
                    <button
                        onClick={onClearReply}
                        className="ml-auto hover:text-text-primary"
                    >
                        ✕
                    </button>
                </div>
            )}

            {!!files.length && (
                <div className="flex gap-2 flex-wrap px-3 py-2 bg-surface-raised border-b border-surface-subtle">
                    {files.map((f, i) => (
                        <div key={i} className="relative group/file">
                            {f.type.startsWith('image/') ? (
                                <img
                                    src={URL.createObjectURL(f)}
                                    alt={f.name}
                                    className="h-16 w-16 rounded object-cover"
                                />
                            ) : (
                                <div className="h-16 w-24 grid place-items-center bg-surface-subtle rounded
                                                text-[10px] text-text-muted p-1 text-center">
                                    {f.name}
                                </div>
                            )}
                            <button
                                onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                                className="absolute -top-1 -right-1 w-4 h-4 grid place-items-center rounded-full
                                           bg-danger text-inverse text-[9px] opacity-0 group-hover/file:opacity-100"
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <div
                {...getRootProps()}
                className={clsx(
                    'flex items-end bg-surface-raised rounded-lg',
                    (replyTo || files.length) && 'rounded-t-none',
                    isDragActive && 'ring-2 ring-brand',
                )}
            >
                <input {...getInputProps()} />

                <label className="p-3 text-text-muted hover:text-text-primary cursor-pointer text-lg leading-none">
                    +
                    <input
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                            setFiles((f) => [...f, ...Array.from(e.target.files ?? [])])
                            e.target.value = ''
                        }}
                    />
                </label>

                <textarea
                    ref={areaRef}
                    rows={1}
                    value={text}
                    placeholder={isDragActive ? 'Drop files here' : placeholder}
                    disabled={busy}
                    onChange={(e) => { setText(e.target.value); grow() }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
                    }}
                    className="flex-1 bg-transparent py-3 text-sm text-text-primary
                               placeholder:text-text-muted focus:outline-none resize-none leading-relaxed"
                />

                <EmojiPicker onSelect={(e) => { setText((t) => t + e); areaRef.current?.focus() }}>
                    <button className="p-3 text-text-muted hover:text-text-primary text-lg leading-none">
                        😀
                    </button>
                </EmojiPicker>

                {(text.trim() || files.length > 0) && (
                    <button
                        onClick={send}
                        disabled={busy}
                        className="m-2 px-3 py-1.5 rounded bg-brand hover:bg-brand-hover text-inverse
                                   text-sm disabled:opacity-50"
                    >
                        {busy ? '…' : 'Send'}
                    </button>
                )}
            </div>
        </div>
    )
}
