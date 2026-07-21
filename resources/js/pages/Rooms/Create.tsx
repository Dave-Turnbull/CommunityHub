import { Head, Link, useForm } from '@inertiajs/react'
import { RoomRail } from '@/components/layout/RoomRail'
import type { SharedProps } from '@/types'

export default function RoomCreate({ auth, rooms }: SharedProps) {
    const { data, setData, post, processing, errors } = useForm({
        name: '',
        icon_url: '',
    })

    const submit = () => post('/rooms')

    return (
        <>
            <Head title="Create a Room" />

            <div className="flex flex-col h-screen">
                <RoomRail rooms={rooms} currentUserId={auth.user.id} />

                <main className="flex-1 min-h-0 grid place-items-center bg-surface-600 px-4">
                    <div className="w-full max-w-md bg-surface-700 rounded-lg p-8 shadow-2xl">
                        <h1 className="text-2xl font-bold text-text-primary text-center mb-1">
                            Create a room
                        </h1>
                        <p className="text-sm text-text-muted text-center mb-6">
                            Give it a name and an optional icon. You can change these later.
                        </p>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wide text-text-secondary mb-1.5">
                                    Room Name
                                </label>
                                <input
                                    value={data.name}
                                    onChange={(e) => setData('name', e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && submit()}
                                    className="w-full bg-surface-800 border border-surface-400 rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand transition-colors duration-100"
                                    autoFocus
                                />
                                {errors.name && (
                                    <p className="text-xs text-danger mt-1">{errors.name}</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wide text-text-secondary mb-1.5">
                                    Icon URL <span className="text-text-muted normal-case">(optional)</span>
                                </label>
                                <input
                                    value={data.icon_url}
                                    onChange={(e) => setData('icon_url', e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && submit()}
                                    placeholder="https://…"
                                    className="w-full bg-surface-800 border border-surface-400 rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand transition-colors duration-100"
                                />
                                {errors.icon_url && (
                                    <p className="text-xs text-danger mt-1">{errors.icon_url}</p>
                                )}
                            </div>

                            <button
                                onClick={submit}
                                disabled={processing || !data.name.trim()}
                                className="w-full px-4 py-2 rounded bg-brand hover:bg-brand-hover text-white text-sm font-medium transition-colors duration-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {processing ? 'Creating…' : 'Create Room'}
                            </button>

                            <Link
                                href="/"
                                className="block text-center text-sm text-text-muted hover:text-text-primary"
                            >
                                Cancel
                            </Link>
                        </div>
                    </div>
                </main>
            </div>
        </>
    )
}
