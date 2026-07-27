import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReplyPreviewContent } from '@/components/chat/ReplyPreviewContent'
import type { Message, User } from '@/types'

const author: User = {
    id: 'author-1', username: 'author', display_name: 'Author Name', avatar_url: null, status: 'online',
}

const baseMessage: Message = {
    id: 'msg-0', channel_id: 'chan-1', conversation_id: null, author_id: author.id,
    content: null, type: 'text', is_edited: false, is_pinned: false, reply_to_id: null,
    created_at: '2026-01-01T12:00:00Z', author,
}

const image = {
    id: 'att-1', url: '/storage/vacation.png', filename: 'vacation.png',
    mime_type: 'image/png', size_bytes: 1024, width: 400, height: 300,
}

const pdf = {
    id: 'att-2', url: '/storage/report.pdf', filename: 'report.pdf',
    mime_type: 'application/pdf', size_bytes: 2048, width: null, height: null,
}

describe('ReplyPreviewContent', () => {
    it('renders only the text content when there is no attachment', () => {
        render(<ReplyPreviewContent message={{ ...baseMessage, content: 'hello there' }} />)

        expect(screen.getByText('hello there')).toBeInTheDocument()
        expect(screen.queryByRole('img')).not.toBeInTheDocument()
    })

    it('renders an image thumbnail (not filename text) for an image-only attachment', () => {
        render(<ReplyPreviewContent message={{ ...baseMessage, content: null, attachments: [image] }} />)

        const thumbnail = screen.getByAltText('vacation.png') as HTMLImageElement
        expect(thumbnail.src).toContain('/storage/vacation.png')
        expect(screen.queryByText('📎 vacation.png')).not.toBeInTheDocument()
    })

    it('renders both the thumbnail and the text when an image attachment has accompanying content', () => {
        render(<ReplyPreviewContent message={{ ...baseMessage, content: 'check this out', attachments: [image] }} />)

        expect(screen.getByAltText('vacation.png')).toBeInTheDocument()
        expect(screen.getByText('check this out')).toBeInTheDocument()
    })

    it('renders filename text (no thumbnail) for a non-image attachment', () => {
        render(<ReplyPreviewContent message={{ ...baseMessage, content: null, attachments: [pdf] }} />)

        expect(screen.getByText('📎 report.pdf')).toBeInTheDocument()
        expect(screen.queryByRole('img')).not.toBeInTheDocument()
    })

    it('prefers content text over a non-image attachment filename', () => {
        render(<ReplyPreviewContent message={{ ...baseMessage, content: 'see attached', attachments: [pdf] }} />)

        expect(screen.getByText('see attached')).toBeInTheDocument()
        expect(screen.queryByText('📎 report.pdf')).not.toBeInTheDocument()
    })

    it('renders nothing extra when there is neither content nor an attachment', () => {
        const { container } = render(<ReplyPreviewContent message={{ ...baseMessage, content: null }} />)

        expect(container).toBeEmptyDOMElement()
    })

    it('picks the first image among multiple attachments', () => {
        render(<ReplyPreviewContent message={{ ...baseMessage, content: null, attachments: [pdf, image] }} />)

        expect(screen.getByAltText('vacation.png')).toBeInTheDocument()
    })
})
