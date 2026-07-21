import { Link, router } from '@inertiajs/react'
import { Avatar } from '@/components/ui/Avatar'
import { Tooltip } from '@/components/ui/Tooltip'
import type { User } from '@/types'

export function UserPanel({ user }: { user: User }) {
    return (
        <div className="flex items-center gap-2 px-2 py-2 bg-surface-800 flex-shrink-0">
            <Avatar user={user} size="sm" showStatus />

            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary truncate leading-tight">
                    {user.display_name}
                </p>
                <p className="text-[11px] text-text-muted truncate leading-tight">
                    {user.custom_status ?? `@${user.username}`}
                </p>
            </div>

            <Tooltip content="Settings">
                <Link
                    href="/settings"
                    className="p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-surface-500"
                >
                    ⚙
                </Link>
            </Tooltip>

            <Tooltip content="Log out">
                <button
                    onClick={() => router.post('/logout')}
                    className="p-1.5 rounded text-text-muted hover:text-danger hover:bg-surface-500"
                >
                    ⏻
                </button>
            </Tooltip>
        </div>
    )
}
