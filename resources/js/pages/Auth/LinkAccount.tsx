import { Head, useForm } from '@inertiajs/react'

interface Props {
    email: string
}

/**
 * Reached after an Authentik login matches an existing password account's
 * email — see AuthentikController::showLinkAccount/AuthentikLoginService's
 * docblock for why this requires the account's actual password rather than
 * auto-linking on the email match alone.
 */
export default function LinkAccount({ email }: Props) {
    const { data, setData, post, processing, errors } = useForm({ password: '' })

    const submit = () => post('/auth/link-account')

    return (
        <>
            <Head title="Link your account" />

            <div className="min-h-screen grid place-items-center bg-fourth px-4 py-12">
                <div className="w-full max-w-md">
                    <div className="text-center mb-8">
                        <h1 className="text-2xl font-bold text-text-primary">Link your account</h1>
                        <p className="text-sm text-text-muted mt-2">
                            An account already exists for <span className="text-text-primary">{email}</span>.
                            Enter its password to link your Authentik login.
                        </p>
                    </div>

                    <div className="bg-second rounded-lg p-8 shadow-2xl">
                        <div className="space-y-4">
                            <div>
                                <label
                                    htmlFor="link-account-password"
                                    className="block text-xs font-semibold uppercase tracking-wide text-text-secondary mb-1.5"
                                >
                                    Password
                                </label>
                                <input
                                    id="link-account-password"
                                    type="password"
                                    autoFocus
                                    value={data.password}
                                    onChange={(e) => setData('password', e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && submit()}
                                    className="w-full bg-third border border-sixth rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary transition-colors duration-100"
                                />
                                {errors.password && (
                                    <p className="text-xs text-danger mt-1">{errors.password}</p>
                                )}
                            </div>

                            <button
                                onClick={submit}
                                disabled={processing}
                                className="w-full px-4 py-2 rounded bg-accent-primary hover:bg-accent-secondary text-inverse text-sm font-medium transition-colors duration-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {processing ? 'Linking…' : 'Link account'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}
