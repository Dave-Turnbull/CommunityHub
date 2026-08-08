import { useState } from 'react'
import { forwardRef } from 'react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import Login from '@/pages/Auth/Login'
import type { SharedProps } from '@/types'

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
            post: vi.fn(),
            processing: false,
            errors: {},
        }
    },
}))

const props = (
    overrides: Partial<SharedProps['registrationPaths']> = {},
    authentikEnabled = false
): SharedProps => ({
    appName: 'CommunityHub',
    maxUploadSizeBytes: 100 * 1024 * 1024,
    auth: { user: undefined as never },
    rooms: [],
    conversations: [],
    recentCustomStatuses: [],
    flash: {},
    registrationPaths: { manual: true, emailInvite: true, oauth: true, ...overrides },
    authentikEnabled,
})

describe('Auth/Login', () => {
    it('shows the Register link when manual signup is open', () => {
        render(<Login {...props({ manual: true })} />)

        expect(screen.getByText('Register')).toBeInTheDocument()
    })

    it('hides the Register link when manual signup is closed', () => {
        render(<Login {...props({ manual: false })} />)

        expect(screen.queryByText('Register')).not.toBeInTheDocument()
    })

    it('hides the Authentik button when disabled', () => {
        render(<Login {...props({}, false)} />)

        expect(screen.queryByText('Log in with Authentik')).not.toBeInTheDocument()
    })

    it('shows a full-page-redirect Authentik button when enabled', () => {
        render(<Login {...props({}, true)} />)

        const link = screen.getByText('Log in with Authentik')
        expect(link).toBeInTheDocument()
        expect(link).toHaveAttribute('href', '/auth/authentik/redirect')
    })
})
