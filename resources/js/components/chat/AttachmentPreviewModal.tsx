import type { Attachment } from '@/types'

interface Props {
    attachment: Attachment
    onClose: () => void
}

// The lightbox opened by clicking an inline image/video embed — see
// MessageAttachments. Follows the same hand-rolled overlay pattern as the
// other modals in this codebase (no Radix Dialog dependency).
export function AttachmentPreviewModal({ attachment, onClose }: Props) {
    const isVideo = attachment.mime_type.startsWith('video/')

    return (
        <div
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6"
            onClick={onClose}
        >
            <div
                className="max-w-4xl max-h-full flex flex-col gap-2"
                onClick={(e) => e.stopPropagation()}
            >
                {isVideo ? (
                    <video
                        src={attachment.url}
                        controls
                        autoPlay
                        className="max-w-full max-h-[85vh] rounded"
                    />
                ) : (
                    <img
                        src={attachment.url}
                        alt={attachment.filename}
                        className="max-w-full max-h-[85vh] rounded object-contain"
                    />
                )}

                <div className="flex items-center justify-between text-xs text-text-muted">
                    <span className="truncate">{attachment.filename}</span>
                    <div className="flex items-center gap-3 flex-shrink-0">
                        <a href={attachment.url} download className="hover:text-text-primary">
                            Download
                        </a>
                        <button type="button" onClick={onClose} className="hover:text-text-primary">
                            ✕ Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
