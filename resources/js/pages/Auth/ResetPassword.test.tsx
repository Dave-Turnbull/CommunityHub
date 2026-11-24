import { forwardRef, useState } from 'react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ResetPassword from '@/pages/Auth/ResetPassword'
import type { SharedProps } from '@/types'

const post = vi.fn()
let lastData: Record<string, unknown> = {}

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    Link: forwardRef<HTMLAnchorElement, { href: string; className?: string; children: ReactNode }>(
        ({ href, className, children }, ref) => <a href={href} className={className} ref={ref}>{children}</a>
    ),
    useForm: (initial: Record<string, unknown>) => {
        const [data, setDataState] = useState(initial)
        lastData = data
        return {
            data,
            setData: (key: string, value: unknown) => setDataState((d) => ({ ...d, [key]: value })),
            post,
            processing: false,
            errors: { email: 'This password reset link is invalid or has expired.' },
        }
    },
}))

const props = (): SharedProps & { token: string; email: string } => ({
    appName: 'CommunityHub',
    maxUploadSizeBytes: 100 * 1024 * 1024,
    auth: { user: undefined as never },
    rooms: [],
    conversations: [],
    recentCustomStatuses: [],
    flash: {},
    registrationPaths: { manual: true, emailInvite: true, oauth: true },
    authentikEnabled: false,
    token: 'tok-123',
    email: 'a@example.com',
})

describe('Auth/ResetPassword', () => {
    it('prefills the email and carries the token in the form data', () => {
        render(<ResetPassword {...props()} />)

        expect(screen.getByDisplayValue('a@example.com')).toBeInTheDocument()
        expect(lastData.token).toBe('tok-123')
    })

    it('posts to /reset-password', () => {
        render(<ResetPassword {...props()} />)

        fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-password-1' } })
        fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'new-password-1' } })
        fireEvent.click(screen.getByText('Reset password'))

        expect(post).toHaveBeenCalledWith('/reset-password')
        expect(lastData.password).toBe('new-password-1')
    })

    it('shows the invalid-link error', () => {
        render(<ResetPassword {...props()} />)

        expect(screen.getByText('This password reset link is invalid or has expired.')).toBeInTheDocument()
    })
})
