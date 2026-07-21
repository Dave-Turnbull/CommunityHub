import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UserPicker } from '@/components/messages/UserPicker'
import * as api from '@/services/api'
import type { User } from '@/types'

vi.mock('@/services/api', () => ({
    fetchConversationCandidates: vi.fn(),
}))

const bob: User = {
    id: 'user-2', username: 'bob', display_name: 'Bob Builder', avatar_url: null, status: 'online',
}

describe('UserPicker', () => {
    afterEach(() => {
        vi.clearAllMocks()
    })

    it('searches candidates as the query changes', async () => {
        vi.mocked(api.fetchConversationCandidates).mockResolvedValue([bob])
        const user = userEvent.setup()

        render(<UserPicker selected={[]} onChange={vi.fn()} />)

        await user.type(screen.getByPlaceholderText(/search people/i), 'bob')

        await waitFor(() => expect(api.fetchConversationCandidates).toHaveBeenCalledWith('bob'))
        expect(await screen.findByText('Bob Builder')).toBeInTheDocument()
    })

    it('selects a result on click', async () => {
        vi.mocked(api.fetchConversationCandidates).mockResolvedValue([bob])
        const onChange = vi.fn()
        const user = userEvent.setup()

        render(<UserPicker selected={[]} onChange={onChange} />)

        await user.click(await screen.findByText('Bob Builder'))

        expect(onChange).toHaveBeenCalledWith([bob])
    })

    it('shows selected users as removable chips and deselects on click', async () => {
        vi.mocked(api.fetchConversationCandidates).mockResolvedValue([]);
        const onChange = vi.fn()
        const user = userEvent.setup()

        render(<UserPicker selected={[bob]} onChange={onChange} />)

        expect(screen.getByText('Bob Builder')).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: '✕' }))

        expect(onChange).toHaveBeenCalledWith([])
    })
})
