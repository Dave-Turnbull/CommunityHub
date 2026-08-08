import { Head, Link, useForm } from '@inertiajs/react'

interface Props {
    invite_token?: string
    invite_email?: string
    invite_invalid?: boolean
}

export default function Register({ invite_token, invite_email, invite_invalid }: Props) {
    const { data, setData, post, processing, errors } = useForm({
        username: '',
        display_name: '',
        email: invite_email ?? '',
        password: '',
        password_confirmation: '',
        invite_token: invite_token ?? '',
    })

    const submit = () => post('/register')

    const field = (
        key: keyof typeof data,
        label: string,
        type = 'text',
        hint?: string,
        disabled = false,
    ) => (
        <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-text-secondary mb-1.5">
                {label}
            </label>
            <input
                type={type}
                value={data[key] as string}
                onChange={(e) => setData(key, e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                disabled={disabled}
                className="w-full bg-third border border-sixth rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary transition-colors duration-100 disabled:opacity-60"
            />
            {hint && !errors[key] && (
                <p className="text-[11px] text-text-muted mt-1">{hint}</p>
            )}
            {errors[key] && (
                <p className="text-xs text-danger mt-1">{errors[key]}</p>
            )}
        </div>
    )

    if (invite_invalid) {
        return (
            <>
                <Head title="Register" />
                <div className="min-h-screen grid place-items-center bg-fourth px-4 py-12">
                    <div className="w-full max-w-md text-center">
                        <div className="bg-second rounded-lg p-8 shadow-2xl">
                            <h1 className="text-xl font-bold text-text-primary mb-2">Invite link invalid</h1>
                            <p className="text-sm text-text-muted">
                                This invite link is invalid, expired, or has already been used.
                            </p>
                            <Link
                                href="/login"
                                className="inline-block mt-6 text-sm text-text-link hover:text-text-link-hover hover:underline"
                            >
                                Back to login
                            </Link>
                        </div>
                    </div>
                </div>
            </>
        )
    }

    return (
        <>
            <Head title="Register" />

            <div className="min-h-screen grid place-items-center bg-fourth px-4 py-12">
                <div className="w-full max-w-md">
                    <div className="text-center mb-8">
                        <h1 className="text-3xl font-bold text-text-primary">Create an account</h1>
                    </div>

                    <div className="bg-second rounded-lg p-8 shadow-2xl">
                        <div className="space-y-4">
                            {field('username', 'Username', 'text', 'Lowercase letters, numbers, _ and . only')}
                            {field('display_name', 'Display Name')}
                            {field('email', 'Email', 'email', undefined, Boolean(invite_email))}
                            {field('password', 'Password', 'password', 'At least 8 characters')}
                            {field('password_confirmation', 'Confirm Password', 'password')}

                            <button
                                onClick={submit}
                                disabled={processing}
                                className="w-full px-4 py-2 rounded bg-accent-primary hover:bg-accent-secondary text-inverse text-sm font-medium transition-colors duration-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {processing ? 'Creating…' : 'Continue'}
                            </button>
                        </div>

                        <p className="text-sm text-text-muted mt-6">
                            Already have an account?{' '}
                            <Link href="/login" className="text-text-link hover:text-text-link-hover hover:underline">
                                Log in
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </>
    )
}
