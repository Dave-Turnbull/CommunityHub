import { useState } from 'react'
import { Head, router, useForm } from '@inertiajs/react'
import type { SharedProps } from '@/types'

export default function VerifyEmail({ appName }: SharedProps) {
    const { post, processing } = useForm({})
    const [sent, setSent] = useState(false)

    const resend = () => {
        setSent(false)
        post('/email/resend', { onSuccess: () => setSent(true) })
    }

    return (
        <>
            <Head title="Verify your email" />

            <div className="min-h-screen grid place-items-center bg-fourth px-4 py-12">
                <div className="w-full max-w-md text-center">
                    <div className="bg-second rounded-lg p-8 shadow-2xl">
                        <h1 className="text-xl font-bold text-text-primary mb-2">Verify your email</h1>
                        <p className="text-sm text-text-muted">
                            We sent a verification link to your email address. Click it to
                            finish setting up your {appName} account.
                        </p>

                        <button
                            onClick={resend}
                            disabled={processing}
                            className="w-full mt-6 px-4 py-2 rounded bg-accent-primary hover:bg-accent-secondary text-inverse text-sm font-medium transition-colors duration-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {processing ? 'Sending…' : 'Resend verification email'}
                        </button>

                        {sent && (
                            <p className="text-xs text-text-secondary mt-3">
                                Verification email sent.
                            </p>
                        )}

                        <button
                            onClick={() => router.post('/logout')}
                            className="text-sm text-text-link hover:text-text-link-hover hover:underline mt-6"
                        >
                            Log out
                        </button>
                    </div>
                </div>
            </div>
        </>
    )
}
