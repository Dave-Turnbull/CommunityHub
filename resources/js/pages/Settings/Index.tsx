import { Head, Link, useForm } from '@inertiajs/react'
import { Avatar } from '@/components/ui/Avatar'
import { Tabs } from '@/components/ui/Tabs'
import { NotificationPreferences } from '@/components/settings/NotificationPreferences'
import { AudioSettings } from '@/components/settings/AudioSettings'
import type { SharedProps, User } from '@/types'

interface Props extends SharedProps {
    user: User
}

export default function SettingsIndex({ user }: Props) {
    const { data, setData, patch, processing, isDirty } = useForm({
        display_name: user.display_name,
        bio:          user.bio ?? '',
        avatar_url:   user.avatar_url ?? '',
    })

    return (
        <>
            <Head title="Settings" />

            <div className="h-screen bg-surface-600 overflow-y-auto">
                <div className="max-w-2xl mx-auto px-6 py-12">
                    <div className="flex items-center justify-between mb-8">
                        <h1 className="text-2xl font-bold text-text-primary">Settings</h1>
                        <Link
                            href="/"
                            className="text-sm text-text-muted hover:text-text-primary"
                        >
                            ✕ Close
                        </Link>
                    </div>

                    <Tabs
                        tabs={[
                            {
                                value: 'profile',
                                label: 'Profile',
                                content: (
                                    <>
                                        {/* Live preview */}
                                        <div className="bg-surface-700 rounded-lg p-6 mb-6 flex items-center gap-4">
                                            <Avatar
                                                user={{ ...user, ...data } as User}
                                                size="lg"
                                                showStatus
                                            />
                                            <div className="min-w-0">
                                                <p className="text-lg font-bold text-text-primary truncate">
                                                    {data.display_name || user.display_name}
                                                </p>
                                                <p className="text-sm text-text-muted">@{user.username}</p>
                                                {data.bio && (
                                                    <p className="text-sm text-text-secondary mt-2">{data.bio}</p>
                                                )}
                                            </div>
                                        </div>

                                        {/* Form */}
                                        <div className="bg-surface-700 rounded-lg p-6 space-y-5">
                                            <div>
                                                <label className="block text-xs font-semibold uppercase tracking-wide text-text-secondary mb-1.5">
                                                    Display Name
                                                </label>
                                                <input
                                                    value={data.display_name}
                                                    onChange={(e) => setData('display_name', e.target.value)}
                                                    className="w-full bg-surface-800 border border-surface-400 rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand transition-colors duration-100"
                                                    maxLength={32}
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-xs font-semibold uppercase tracking-wide text-text-secondary mb-1.5">
                                                    Avatar URL
                                                </label>
                                                <input
                                                    value={data.avatar_url}
                                                    onChange={(e) => setData('avatar_url', e.target.value)}
                                                    placeholder="https://…"
                                                    className="w-full bg-surface-800 border border-surface-400 rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand transition-colors duration-100"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-xs font-semibold uppercase tracking-wide text-text-secondary mb-1.5">
                                                    About Me
                                                </label>
                                                <textarea
                                                    value={data.bio}
                                                    onChange={(e) => setData('bio', e.target.value)}
                                                    rows={3}
                                                    maxLength={190}
                                                    className="w-full bg-surface-800 border border-surface-400 rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand transition-colors duration-100 resize-none"
                                                />
                                                <p className="text-[11px] text-text-muted mt-1 text-right">
                                                    {data.bio.length}/190
                                                </p>
                                            </div>

                                            <button
                                                onClick={() => patch('/settings')}
                                                disabled={processing || !isDirty}
                                                className="w-full px-4 py-2 rounded bg-brand hover:bg-brand-hover text-white text-sm font-medium transition-colors duration-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {processing ? 'Saving…' : 'Save Changes'}
                                            </button>
                                        </div>
                                    </>
                                ),
                            },
                            {
                                value: 'notifications',
                                label: 'Notifications',
                                content: <NotificationPreferences />,
                            },
                            {
                                value: 'voice',
                                label: 'Voice & Video',
                                content: <AudioSettings />,
                            },
                        ]}
                    />
                </div>
            </div>
        </>
    )
}
