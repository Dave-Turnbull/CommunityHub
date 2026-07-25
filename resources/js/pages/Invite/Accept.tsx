import { Head, useForm } from '@inertiajs/react'
import type { SharedProps } from '@/types'

interface Props extends SharedProps {
    invalid: boolean
    room?: { id: string; name: string; icon_url: string | null }
    inviter?: { display_name: string }
    email?: string
    has_account?: boolean
}

export default function Accept({ invalid, room, inviter, email, has_account, appName }: Props) {
    const login = useForm({ login: email ?? '', password: '', remember: false })
    const register = useForm({
        username: '', display_name: '', email: email ?? '', password: '', password_confirmation: '',
    })

    return (
        <>
            <Head title="Accept invite" />

            <div className="min-h-screen grid place-items-center bg-surface-app px-4 py-12">
                <div className="w-full max-w-md">
                    {invalid ? (
                        <div className="bg-surface-panel rounded-lg p-8 shadow-2xl text-center">
                            <h1 className="text-xl font-bold text-text-primary mb-2">This invite is no longer valid</h1>
                            <p className="text-sm text-text-muted mb-6">
                                It may have expired or already been used.
                            </p>
                            <a
                                href="/"
                                className="inline-block px-4 py-2 rounded bg-brand hover:bg-brand-hover text-inverse text-sm font-medium transition-colors duration-100"
                            >
                                Go home
                            </a>
                        </div>
                    ) : (
                        <div className="bg-surface-panel rounded-lg p-8 shadow-2xl">
                            <div className="text-center mb-6">
                                <h1 className="text-xl font-bold text-text-primary">
                                    Join {room?.name}
                                </h1>
                                <p className="text-sm text-text-muted mt-1">
                                    {inviter?.display_name} invited you to {appName}.
                                </p>
                            </div>

                            {has_account ? (
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-semibold uppercase tracking-wide text-text-secondary mb-1.5">
                                            Email
                                        </label>
                                        <input
                                            type="email"
                                            value={login.data.login}
                                            readOnly
                                            className="w-full bg-surface-inset border border-surface-subtle rounded px-3 py-2 text-sm text-text-muted"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold uppercase tracking-wide text-text-secondary mb-1.5">
                                            Password
                                        </label>
                                        <input
                                            type="password"
                                            value={login.data.password}
                                            onChange={(e) => login.setData('password', e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && login.post('/login')}
                                            className="w-full bg-surface-inset border border-surface-subtle rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-brand transition-colors duration-100"
                                            autoFocus
                                        />
                                        {login.errors.login && (
                                            <p className="text-xs text-danger mt-1">{login.errors.login}</p>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => login.post('/login')}
                                        disabled={login.processing}
                                        className="w-full px-4 py-2 rounded bg-brand hover:bg-brand-hover text-inverse text-sm font-medium transition-colors duration-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {login.processing ? 'Joining…' : 'Log in and join'}
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {(
                                        [
                                            ['username', 'Username', 'text'],
                                            ['display_name', 'Display Name', 'text'],
                                            ['password', 'Password', 'password'],
                                            ['password_confirmation', 'Confirm Password', 'password'],
                                        ] as const
                                    ).map(([key, label, type]) => (
                                        <div key={key}>
                                            <label className="block text-xs font-semibold uppercase tracking-wide text-text-secondary mb-1.5">
                                                {label}
                                            </label>
                                            <input
                                                type={type}
                                                value={register.data[key]}
                                                onChange={(e) => register.setData(key, e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && register.post('/register')}
                                                className="w-full bg-surface-inset border border-surface-subtle rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-brand transition-colors duration-100"
                                            />
                                            {register.errors[key] && (
                                                <p className="text-xs text-danger mt-1">{register.errors[key]}</p>
                                            )}
                                        </div>
                                    ))}
                                    <div>
                                        <label className="block text-xs font-semibold uppercase tracking-wide text-text-secondary mb-1.5">
                                            Email
                                        </label>
                                        <input
                                            type="email"
                                            value={register.data.email}
                                            readOnly
                                            className="w-full bg-surface-inset border border-surface-subtle rounded px-3 py-2 text-sm text-text-muted"
                                        />
                                    </div>
                                    <button
                                        onClick={() => register.post('/register')}
                                        disabled={register.processing}
                                        className="w-full px-4 py-2 rounded bg-brand hover:bg-brand-hover text-inverse text-sm font-medium transition-colors duration-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {register.processing ? 'Joining…' : 'Create account and join'}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </>
    )
}
