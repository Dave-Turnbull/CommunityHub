import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VoteControl } from '@/components/messages/VoteControl'
import * as api from '@/services/api'
import type { Message } from '@/types'

vi.mock('@/services/api', () => ({
    castVote: vi.fn(),
    removeVote: vi.fn(),
}))

const message = (votes?: Message['votes']): Message => ({
    id: 'msg-1',
    channel_id: 'chan-1',
    conversation_id: null,
    author_id: 'user-1',
    content: 'hello',
    type: 'text',
    is_edited: false,
    is_pinned: false,
    reply_to_id: null,
    created_at: '2026-01-01T00:00:00Z',
    votes,
})

describe('VoteControl', () => {
    afterEach(() => {
        vi.clearAllMocks()
    })

    it('optimistically applies an upvote before the request resolves', async () => {
        let resolve!: (v: { score: number; mine: 1 | null }) => void
        vi.mocked(api.castVote).mockReturnValue(new Promise((r) => { resolve = r }))
        const onChange = vi.fn()

        render(<VoteControl message={message({ score: 0, mine: null })} onChange={onChange} />)
        await userEvent.click(screen.getByLabelText('Upvote'))

        expect(onChange).toHaveBeenCalledWith({ score: 1, mine: 1 })
        resolve({ score: 1, mine: 1 })
    })

    it('reconciles with the authoritative summary once the request resolves', async () => {
        vi.mocked(api.castVote).mockResolvedValue({ score: 5, mine: 1 })
        const onChange = vi.fn()

        render(<VoteControl message={message({ score: 4, mine: null })} onChange={onChange} />)
        await userEvent.click(screen.getByLabelText('Upvote'))

        expect(onChange).toHaveBeenLastCalledWith({ score: 5, mine: 1 })
    })

    it('restores the previous vote when the request fails', async () => {
        vi.mocked(api.castVote).mockRejectedValue(new Error('boom'))
        const onChange = vi.fn()

        render(<VoteControl message={message({ score: 2, mine: null })} onChange={onChange} />)
        await userEvent.click(screen.getByLabelText('Upvote'))

        expect(onChange).toHaveBeenLastCalledWith({ score: 2, mine: null })
    })

    it('removing an existing vote calls removeVote instead of castVote', async () => {
        vi.mocked(api.removeVote).mockResolvedValue({ score: 0, mine: null })
        const onChange = vi.fn()

        render(<VoteControl message={message({ score: 1, mine: 1 })} onChange={onChange} />)
        await userEvent.click(screen.getByLabelText('Upvote'))

        expect(api.removeVote).toHaveBeenCalledWith('msg-1')
        expect(api.castVote).not.toHaveBeenCalled()
    })
})
