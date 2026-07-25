import { Head, Link, useForm } from '@inertiajs/react'
import type { SharedProps } from '@/types'

export default function Login({ appName }: SharedProps) {
    const { data, setData, post, processing, errors } = useForm({
        login: '',
        password: '',
        remember: false,
    })

    return (
        <>
            <Head title="Log in" />

            <div className="min-h-screen grid place-items-center bg-surface-app px-4">
                <div className="w-full max-w-md">
                    <div className="text-center mb-8">
                        <h1 className="text-3xl font-bold text-text-primary">{appName}</h1>
                        <p className="text-sm text-text-muted mt-1">Welcome back.</p>
                    </div>

                    <div className="bg-surface-panel rounded-lg p-8 shadow-2xl">
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wide text-text-secondary mb-1.5">
                                    Email or Username
                                </label>
                                <input
                                    type="text"
                                    autoComplete="username"
                                    value={data.login}
                                    onChange={(e) => setData('login', e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && post('/login')}
                                    className="w-full bg-surface-inset border border-surface-subtle rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand transition-colors duration-100"
                                    autoFocus
                                />
                                {errors.login && (
                                    <p className="text-xs text-danger mt-1">{errors.login}</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wide text-text-secondary mb-1.5">
                                    Password
                                </label>
                                <input
                                    type="password"
                                    value={data.password}
                                    onChange={(e) => setData('password', e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && post('/login')}
                                    className="w-full bg-surface-inset border border-surface-subtle rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand transition-colors duration-100"
                                />
                                {errors.password && (
                                    <p className="text-xs text-danger mt-1">{errors.password}</p>
                                )}
                            </div>

                            <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={data.remember}
                                    onChange={(e) => setData('remember', e.target.checked)}
                                    className="rounded border-surface-subtle bg-surface-inset text-brand focus:ring-brand"
                                />
                                Remember me
                            </label>

                            <button
                                onClick={() => post('/login')}
                                disabled={processing}
                                className="w-full px-4 py-2 rounded bg-brand hover:bg-brand-hover text-inverse text-sm font-medium transition-colors duration-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {processing ? 'Logging in…' : 'Log In'}
                            </button>
                        </div>

                        <p className="text-sm text-text-muted mt-6">
                            Need an account?{' '}
                            <Link href="/register" className="text-text-link hover:text-text-link-hover hover:underline">
                                Register
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </>
    )
}
