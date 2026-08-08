import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LinkAccount from '@/pages/Auth/LinkAccount'

const post = vi.fn()

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    useForm: (initial: Record<string, unknown>) => {
        const [data, setDataState] = useState(initial)
        return {
            data,
            setData: (key: string, value: unknown) => setDataState((d) => ({ ...d, [key]: value })),
            post: (url: string) => post(url),
            processing: false,
            errors: {},
        }
    },
}))

describe('Auth/LinkAccount', () => {
    it('shows the matched email and submits the password to /auth/link-account', async () => {
        render(<LinkAccount email="existing@example.com" />)

        expect(screen.getByText('existing@example.com')).toBeInTheDocument()

        await userEvent.type(screen.getByLabelText('Password'), 'correct-password')
        await userEvent.click(screen.getByText('Link account'))

        expect(post).toHaveBeenCalledWith('/auth/link-account')
    })
})
