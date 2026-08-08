import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import VerifyEmail from '@/pages/Auth/VerifyEmail'
import type { SharedProps } from '@/types'

const routerPost = vi.fn()

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    router: { post: (...args: unknown[]) => routerPost(...args) },
    useForm: () => {
        const [processing, setProcessing] = useState(false)
        return {
            post: (_url: string, opts?: { onSuccess?: () => void }) => {
                setProcessing(true)
                opts?.onSuccess?.()
                setProcessing(false)
            },
            processing,
        }
    },
}))

const props: SharedProps = {
    appName: 'CommunityHub',
    maxUploadSizeBytes: 100 * 1024 * 1024,
    auth: { user: undefined as never },
    rooms: [],
    conversations: [],
    recentCustomStatuses: [],
    registrationPaths: { manual: true, emailInvite: true, oauth: true },
    authentikEnabled: false,
    flash: {},
}

describe('Auth/VerifyEmail', () => {
    it('shows a resend button and confirms once clicked', async () => {
        render(<VerifyEmail {...props} />)

        await userEvent.click(screen.getByText('Resend verification email'))

        expect(screen.getByText('Verification email sent.')).toBeInTheDocument()
    })

    it('logs out via router.post when the logout button is clicked', async () => {
        render(<VerifyEmail {...props} />)

        await userEvent.click(screen.getByText('Log out'))

        expect(routerPost).toHaveBeenCalledWith('/logout')
    })
})
