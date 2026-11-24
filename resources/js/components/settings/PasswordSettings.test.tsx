import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { PasswordSettings } from '@/components/settings/PasswordSettings'

const put = vi.fn()

vi.mock('@inertiajs/react', () => ({
    useForm: (initial: Record<string, unknown>) => {
        const [data, setDataState] = useState(initial)
        return {
            data,
            setData: (key: string, value: unknown) => setDataState((d) => ({ ...d, [key]: value })),
            put,
            reset: vi.fn(),
            processing: false,
            recentlySuccessful: false,
            errors: { current_password: 'The password is incorrect.' },
        }
    },
}))

describe('PasswordSettings', () => {
    it('shows the three password fields and submits to /settings/password', () => {
        render(<PasswordSettings hasPassword />)

        expect(screen.getByLabelText('Current password')).toBeInTheDocument()
        expect(screen.getByLabelText('New password')).toBeInTheDocument()
        expect(screen.getByLabelText('Confirm new password')).toBeInTheDocument()

        fireEvent.click(screen.getByText('Change Password'))

        expect(put).toHaveBeenCalledWith('/settings/password', expect.objectContaining({ preserveScroll: true }))
    })

    it('shows validation errors', () => {
        render(<PasswordSettings hasPassword />)

        expect(screen.getByText('The password is incorrect.')).toBeInTheDocument()
    })

    it('points a user with no password at the forgot-password flow instead of a form', () => {
        render(<PasswordSettings hasPassword={false} />)

        expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument()
        expect(screen.queryByText('Change Password')).not.toBeInTheDocument()
        expect(screen.getByText(/Forgot password\?/)).toBeInTheDocument()
    })
})
