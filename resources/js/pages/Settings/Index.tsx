import { Head, Link, useForm } from '@inertiajs/react'
import { Avatar } from '@/components/ui/Avatar'
import { Tabs } from '@/components/ui/Tabs'
import { NotificationPreferences } from '@/components/settings/NotificationPreferences'
import { AudioSettings } from '@/components/settings/AudioSettings'
import type { SharedProps, User, UserStatus } from '@/types'

interface Props extends SharedProps {
    user: User
}

const STATUSES: { value: UserStatus; label: string; color: string }[] = [
    { value: 'online',  label: 'Online',        color: 'bg-status-online' },
    { value: 'idle',    label: 'Idle',          color: 'bg-status-idle' },
    { value: 'dnd',     label: 'Do Not Disturb',color: 'bg-status-dnd' },
    { value: 'offline', label: 'Invisible',     color: 'bg-status-offline' },
]

export default function SettingsIndex({ user }: Props) {
    const { data, setData, patch, processing, isDirty } = useForm({
        display_name:  user.display_name,
        bio:           user.bio ?? '',
        avatar_url:    user.avatar_url ?? '',
        status:        user.status,
        custom_status: user.custom_status ?? '',
    })

    return (
        <>
            <Head title="Settings" />

            <div className="min-h-screen bg-surface-600 overflow-y-auto">
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
                                                {data.custom_status && (
                                                    <p className="text-sm text-text-secondary mt-1 truncate">
                                                        {data.custom_status}
                                                    </p>
                                                )}
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

                                            <div>
                                                <label className="block text-xs font-semibold uppercase tracking-wide text-text-secondary mb-1.5">
                                                    Custom Status
                                                </label>
                                                <input
                                                    value={data.custom_status}
                                                    onChange={(e) => setData('custom_status', e.target.value)}
                                                    placeholder="What's happening?"
                                                    maxLength={128}
                                                    className="w-full bg-surface-800 border border-surface-400 rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand transition-colors duration-100"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-xs font-semibold uppercase tracking-wide text-text-secondary mb-2">
                                                    Status
                                                </label>
                                                <div className="grid grid-cols-2 gap-2">
                                                    {STATUSES.map((s) => (
                                                        <button
                                                            key={s.value}
                                                            onClick={() => setData('status', s.value)}
                                                            className={`flex items-center gap-2 px-3 py-2 rounded border text-sm transition-colors
                                                                ${data.status === s.value
                                                                    ? 'border-brand bg-brand/10 text-text-primary'
                                                                    : 'border-surface-400 text-text-secondary hover:border-brand'}`}
                                                        >
                                                            <span className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
                                                            {s.label}
                                                        </button>
                                                    ))}
                                                </div>
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
