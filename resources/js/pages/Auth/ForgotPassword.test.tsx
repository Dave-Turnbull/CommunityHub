import { forwardRef, useState } from 'react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ForgotPassword from '@/pages/Auth/ForgotPassword'
import type { SharedProps } from '@/types'

const post = vi.fn()

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    Link: forwardRef<HTMLAnchorElement, { href: string; className?: string; children: ReactNode }>(
        ({ href, className, children }, ref) => <a href={href} className={className} ref={ref}>{children}</a>
    ),
    useForm: (initial: Record<string, unknown>) => {
        const [data, setDataState] = useState(initial)
        return {
            data,
            setData: (key: string, value: unknown) => setDataState((d) => ({ ...d, [key]: value })),
            post,
            processing: false,
            errors: {},
        }
    },
}))

const props = (flash: SharedProps['flash'] = {}): SharedProps => ({
    appName: 'CommunityHub',
    maxUploadSizeBytes: 100 * 1024 * 1024,
    auth: { user: undefined as never },
    rooms: [],
    conversations: [],
    recentCustomStatuses: [],
    flash,
    registrationPaths: { manual: true, emailInvite: true, oauth: true },
    authentikEnabled: false,
})

describe('Auth/ForgotPassword', () => {
    it('posts the email to /forgot-password', () => {
        render(<ForgotPassword {...props()} />)

        fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@example.com' } })
        fireEvent.click(screen.getByText('Send reset link'))

        expect(post).toHaveBeenCalledWith('/forgot-password')
    })

    it('shows the flash success message', () => {
        render(<ForgotPassword {...props({ success: 'A link is on its way.' })} />)

        expect(screen.getByText('A link is on its way.')).toBeInTheDocument()
    })

    it('links back to login', () => {
        render(<ForgotPassword {...props()} />)

        expect(screen.getByText('Back to login')).toHaveAttribute('href', '/login')
    })
})
