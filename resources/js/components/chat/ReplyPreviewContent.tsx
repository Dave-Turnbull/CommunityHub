import type { Message } from '@/types'

interface Props {
    message: Message
}

/**
 * The compact "what am I replying to" preview — shared by MessageRow's
 * reply-context (a sent reply) and MessageInput's "Replying to…" bar (while
 * composing one), so both surfaces stay in sync. An image attachment gets an
 * actual thumbnail, not just its filename — text alongside it if the message
 * also has content, filename-only text for a non-image attachment, nothing
 * extra beyond the author name if there's neither.
 */
export function ReplyPreviewContent({ message }: Props) {
    const image = message.attachments?.find((a) => a.mime_type.startsWith('image/'))
    const fallbackFile = !image ? message.attachments?.[0] : undefined
    const text = message.content || (fallbackFile ? `📎 ${fallbackFile.filename}` : undefined)

    return (
        <>
            {image && (
                <img
                    src={image.url}
                    alt={image.filename}
                    className="h-6 w-6 rounded object-cover flex-shrink-0"
                />
            )}
            {text && <span className="truncate">{text}</span>}
        </>
    )
}
