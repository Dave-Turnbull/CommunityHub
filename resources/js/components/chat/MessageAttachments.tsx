import { useState } from 'react'
import type { Attachment } from '@/types'
import { AttachmentPreviewModal } from './AttachmentPreviewModal'

interface Props {
    attachments: Attachment[]
}

// Renders a message's attachments as inline embeds (image thumbnail / video
// thumbnail with a play badge / generic download link), each image or video
// opening AttachmentPreviewModal on click. Not MessageRow-specific — anything
// that renders a list of Attachment (a future pinned-attachments view, a
// search result, ...) can reuse this instead of re-deriving the mime-type
// branching.
export function MessageAttachments({ attachments }: Props) {
    const [preview, setPreview] = useState<Attachment | null>(null)

    return (
        <div className="mt-2 flex flex-wrap gap-2">
            {attachments.map((a) => {
                if (a.mime_type.startsWith('image/')) {
                    return (
                        <button key={a.id} type="button" onClick={() => setPreview(a)} className="block">
                            <img
                                src={a.url}
                                alt={a.filename}
                                className="max-w-sm max-h-80 rounded object-cover"
                            />
                        </button>
                    )
                }

                if (a.mime_type.startsWith('video/')) {
                    return (
                        <button
                            key={a.id}
                            type="button"
                            onClick={() => setPreview(a)}
                            className="relative block"
                        >
                            <video
                                src={a.url}
                                preload="metadata"
                                muted
                                className="max-w-sm max-h-80 rounded object-cover pointer-events-none"
                            />
                            <span className="absolute inset-0 flex items-center justify-center">
                                <span className="w-10 h-10 rounded-full bg-black/60 text-inverse grid place-items-center text-lg">
                                    ▶
                                </span>
                            </span>
                        </button>
                    )
                }

                return (
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
            })}

            {preview && <AttachmentPreviewModal attachment={preview} onClose={() => setPreview(null)} />}
        </div>
    )
}
