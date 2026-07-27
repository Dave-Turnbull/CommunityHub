import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { clsx } from 'clsx'
import { usePage } from '@inertiajs/react'
import { useDropzone } from 'react-dropzone'
import { EmojiPicker } from '@/components/emoji/EmojiPicker'
import { ReplyPreviewContent } from '@/components/chat/ReplyPreviewContent'
import { describeApiError } from '@/services/errorMessages'
import { uploadFile, sendChannelMessage, sendConversationMessage } from '@/services/api'
import { useMessages } from '@/stores'
import type { Message, SharedProps } from '@/types'
import type { SendPayload } from '@/services/api'

interface Props {
    scopeId?: string
    scopeType?: 'channel' | 'conversation'
    placeholder: string
    replyTo: Message | null
    onClearReply: () => void
    /** When set, overrides the normal scope-based send — see NewConversationModal. */
    onSend?: (payload: SendPayload) => Promise<void>
    /**
     * Where a sent message goes. Defaults to a plain store append; the text
     * Feature passes useChat's commitSent, which also handles sending while
     * the message window is detached from the live tail.
     */
    onSent?: (message: Message) => void
    /** Rendered in line with the compose box, at its left — the jump-to-present slot. */
    leading?: ReactNode
}

interface ComposerError {
    id: number
    message: string
}

// Marks a message already turned into a user-facing sentence (a per-file
// upload failure, named after the file) so the outer catch in send() doesn't
// re-run describeApiError against it and lose that context.
class ComposerFriendlyError extends Error {}

export function MessageInput({
    scopeId, scopeType, placeholder, replyTo, onClearReply, onSend, onSent, leading,
}: Props) {
    const [text, setText] = useState('')
    const [files, setFiles] = useState<File[]>([])
    const [busy, setBusy] = useState(false)
    const [errors, setErrors] = useState<ComposerError[]>([])
    const areaRef = useRef<HTMLTextAreaElement>(null)
    const nextErrorId = useRef(0)

    // The one server-configured upload ceiling (config/uploads.php) — see CLAUDE.md.
    // SharedProps lacks the index signature usePage's generic constraint wants, so
    // it's cast rather than passed as the type param (same shape Page<T>.props has
    // at runtime — it's always exactly what HandleInertiaRequests::share() sent).
    const { maxUploadSizeBytes } = usePage().props as unknown as SharedProps

    // The sender adds their own message locally — the broadcast uses toOthers()
    const addMessage = useMessages((s) => s.add)
    const commit = onSent ?? ((message: Message) => addMessage(scopeId!, message))

    // Errors here are scoped to this composer instance and cover the whole
    // send pipeline — message send, file upload, emoji picker load failure —
    // stacked and independently closable, cleared on the next send attempt.
    const pushError = (message: string) => {
        // Captured now, not read inside the updater — the updater runs later,
        // by which point a second pushError in the same tick would already
        // have bumped the ref, handing both errors the same id.
        const id = ++nextErrorId.current
        setErrors((prev) => [...prev, { id, message }])
    }
    const dismissError = (id: number) => setErrors((prev) => prev.filter((e) => e.id !== id))

    const addFiles = (candidates: File[]) => {
        const accepted: File[] = []
        for (const file of candidates) {
            if (file.size > maxUploadSizeBytes) {
                const maxMb = Math.round(maxUploadSizeBytes / (1024 * 1024))
                pushError(`${file.name} is too large to upload (max ${maxMb} MB).`)
            } else {
                accepted.push(file)
            }
        }
        if (accepted.length) setFiles((f) => [...f, ...accepted])
    }

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        noClick: true,
        noKeyboard: true,
        onDrop: addFiles,
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

        setErrors([])
        setBusy(true)
        try {
            const uploaded = await Promise.all(files.map(async (file) => {
                try {
                    return await uploadFile(file)
                } catch (e) {
                    throw new ComposerFriendlyError(describeApiError(e, file.name))
                }
            }))

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

                commit(message)
            }

            setText('')
            setFiles([])
            onClearReply()
            if (areaRef.current) areaRef.current.style.height = 'auto'
        } catch (e) {
            pushError(e instanceof ComposerFriendlyError ? e.message : describeApiError(e, 'Your message'))
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="px-4 pb-6 pt-1 flex-shrink-0 flex items-end gap-2">
            {leading}

            <div className="flex-1 min-w-0">
                {!!errors.length && (
                    <div className="flex flex-col gap-1.5 mb-1.5">
                        {errors.map((e) => (
                            <div
                                key={e.id}
                                className="flex items-start gap-2 px-3 py-2 rounded-lg bg-danger/10 border
                                           border-danger/30 text-xs text-danger"
                            >
                                <span className="flex-1">{e.message}</span>
                                <button
                                    type="button"
                                    onClick={() => dismissError(e.id)}
                                    aria-label="Dismiss"
                                    className="flex-shrink-0 hover:text-text-primary"
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {replyTo && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-fifth rounded-t-lg
                                    border-b border-sixth text-xs text-text-muted min-w-0">
                        <span className="flex-shrink-0">
                            Replying to{' '}
                            <strong className="text-text-secondary">
                                {replyTo.author?.display_name}
                            </strong>
                        </span>
                        <ReplyPreviewContent message={replyTo} />
                        <button
                            onClick={onClearReply}
                            className="ml-auto hover:text-text-primary flex-shrink-0"
                        >
                            ✕
                        </button>
                    </div>
                )}

                {!!files.length && (
                    <div className="flex gap-2 flex-wrap px-3 py-2 bg-fifth border-b border-sixth">
                        {files.map((f, i) => (
                            <div key={i} className="relative group/file">
                                {f.type.startsWith('image/') ? (
                                    <img
                                        src={URL.createObjectURL(f)}
                                        alt={f.name}
                                        className="h-16 w-16 rounded object-cover"
                                    />
                                ) : (
                                    <div className="h-16 w-24 grid place-items-center bg-sixth rounded
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
                        'flex items-center bg-fifth rounded-lg border-panel border-panel-border',
                        (replyTo || files.length) && 'rounded-t-none',
                        isDragActive && 'ring-2 ring-accent-primary',
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
                                addFiles(Array.from(e.target.files ?? []))
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

                    <EmojiPicker
                        onSelect={(e) => { setText((t) => t + e); areaRef.current?.focus() }}
                        onError={() => pushError("Couldn't load the emoji picker. Try again.")}
                    >
                        <button className="p-3 text-text-muted hover:text-text-primary text-lg leading-none">
                            😀
                        </button>
                    </EmojiPicker>

                    {(text.trim() || files.length > 0) && (
                        <button
                            onClick={send}
                            disabled={busy}
                            className="m-2 px-3 py-1.5 rounded bg-accent-primary hover:bg-accent-secondary text-inverse
                                       text-sm disabled:opacity-50"
                        >
                            {busy ? '…' : 'Send'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
