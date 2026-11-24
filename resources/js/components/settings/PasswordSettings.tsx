import { useForm } from '@inertiajs/react'

interface Props {
    hasPassword: boolean
}

export function PasswordSettings({ hasPassword }: Props) {
    const { data, setData, put, processing, errors, reset, recentlySuccessful } = useForm({
        current_password: '',
        password: '',
        password_confirmation: '',
    })

    const submit = () =>
        put('/settings/password', { preserveScroll: true, onSuccess: () => reset() })

    const field = (key: keyof typeof data, label: string, autoComplete: string) => (
        <div>
            <label
                htmlFor={key}
                className="block text-xs font-semibold uppercase tracking-wide text-text-secondary mb-1.5"
            >
                {label}
            </label>
            <input
                id={key}
                type="password"
                autoComplete={autoComplete}
                value={data[key]}
                onChange={(e) => setData(key, e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                className="w-full bg-third border border-sixth rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary transition-colors duration-100"
            />
            {errors[key] && <p className="text-xs text-danger mt-1">{errors[key]}</p>}
        </div>
    )

    return (
        <div className="bg-second rounded-lg p-6 mt-6 space-y-5">
            <h2 className="text-sm font-semibold text-text-primary">Password</h2>

            {hasPassword ? (
                <>
                    {field('current_password', 'Current password', 'current-password')}
                    {field('password', 'New password', 'new-password')}
                    {field('password_confirmation', 'Confirm new password', 'new-password')}

                    <button
                        onClick={submit}
                        disabled={processing}
                        className="w-full px-4 py-2 rounded bg-accent-primary hover:bg-accent-secondary text-inverse text-sm font-medium transition-colors duration-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {processing ? 'Saving…' : 'Change Password'}
                    </button>

                    {recentlySuccessful && (
                        <p className="text-xs text-text-secondary">Password updated.</p>
                    )}
                </>
            ) : (
                <p className="text-sm text-text-muted">
                    Your account doesn't have a password yet. To set one, log out and use
                    "Forgot password?" on the login page — we'll email you a link.
                </p>
            )}
        </div>
    )
}
