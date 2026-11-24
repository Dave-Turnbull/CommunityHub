import { Head, Link, useForm } from '@inertiajs/react'
import type { SharedProps } from '@/types'

interface Props extends SharedProps {
    token: string
    email: string
}

export default function ResetPassword({ appName, token, email }: Props) {
    const { data, setData, post, processing, errors } = useForm({
        token,
        email,
        password: '',
        password_confirmation: '',
    })

    const submit = () => post('/reset-password')

    return (
        <>
            <Head title="Reset password" />

            <div className="min-h-screen grid place-items-center bg-fourth px-4">
                <div className="w-full max-w-md">
                    <div className="text-center mb-8">
                        <h1 className="text-3xl font-bold text-text-primary">{appName}</h1>
                        <p className="text-sm text-text-muted mt-1">Choose a new password.</p>
                    </div>

                    <div className="bg-second rounded-lg p-8 shadow-2xl">
                        <div className="space-y-4">
                            <div>
                                <label
                                    htmlFor="email"
                                    className="block text-xs font-semibold uppercase tracking-wide text-text-secondary mb-1.5"
                                >
                                    Email
                                </label>
                                <input
                                    id="email"
                                    type="email"
                                    autoComplete="email"
                                    value={data.email}
                                    onChange={(e) => setData('email', e.target.value)}
                                    className="w-full bg-third border border-sixth rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary transition-colors duration-100"
                                />
                                {errors.email && (
                                    <p className="text-xs text-danger mt-1">{errors.email}</p>
                                )}
                            </div>

                            <div>
                                <label
                                    htmlFor="password"
                                    className="block text-xs font-semibold uppercase tracking-wide text-text-secondary mb-1.5"
                                >
                                    New password
                                </label>
                                <input
                                    id="password"
                                    type="password"
                                    autoComplete="new-password"
                                    value={data.password}
                                    onChange={(e) => setData('password', e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && submit()}
                                    className="w-full bg-third border border-sixth rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary transition-colors duration-100"
                                    autoFocus
                                />
                                {errors.password && (
                                    <p className="text-xs text-danger mt-1">{errors.password}</p>
                                )}
                            </div>

                            <div>
                                <label
                                    htmlFor="password_confirmation"
                                    className="block text-xs font-semibold uppercase tracking-wide text-text-secondary mb-1.5"
                                >
                                    Confirm new password
                                </label>
                                <input
                                    id="password_confirmation"
                                    type="password"
                                    autoComplete="new-password"
                                    value={data.password_confirmation}
                                    onChange={(e) => setData('password_confirmation', e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && submit()}
                                    className="w-full bg-third border border-sixth rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary transition-colors duration-100"
                                />
                            </div>

                            <button
                                onClick={submit}
                                disabled={processing}
                                className="w-full px-4 py-2 rounded bg-accent-primary hover:bg-accent-secondary text-inverse text-sm font-medium transition-colors duration-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {processing ? 'Resetting…' : 'Reset password'}
                            </button>
                        </div>

                        <p className="text-sm text-text-muted mt-6">
                            <Link href="/login" className="text-text-link hover:text-text-link-hover hover:underline">
                                Back to login
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </>
    )
}
