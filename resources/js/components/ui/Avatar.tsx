import { clsx } from 'clsx'
import { usePresence } from '@/stores'
import type { User, UserStatus } from '@/types'

const SIZES = {
    xs: 'w-5 h-5 text-[9px]',
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-20 h-20 text-2xl',
} as const

const DOT_SIZES = {
    xs: 'w-2 h-2',
    sm: 'w-3 h-3',
    md: 'w-3.5 h-3.5',
    lg: 'w-5 h-5',
} as const

const DOT_COLORS: Record<UserStatus, string> = {
    online:  'bg-status-online',
    idle:    'bg-status-idle',
    dnd:     'bg-status-dnd',
    offline: 'bg-status-offline',
}

interface Props {
    user: User
    size?: keyof typeof SIZES
    showStatus?: boolean
    className?: string
}

export function Avatar({ user, size = 'md', showStatus = false, className }: Props) {
    // Live status from the presence store, falling back to the seeded value
    const live = usePresence((s) => s.statuses[user.id]) ?? user.status

    const initials = user.display_name
        .split(' ')
        .slice(0, 2)
        .map((w) => w[0])
        .join('')
        .toUpperCase()

    return (
        <div className={clsx('relative flex-shrink-0', className)}>
            {user.avatar_url ? (
                <img
                    src={user.avatar_url}
                    alt={user.display_name}
                    className={clsx('rounded-full object-cover', SIZES[size])}
                />
            ) : (
                <div className={clsx(
                    'rounded-full bg-brand text-white flex items-center justify-center font-semibold select-none',
                    SIZES[size],
                )}>
                    {initials}
                </div>
            )}

            {showStatus && (
                <span className={clsx(
                    'absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-surface-700',
                    DOT_SIZES[size],
                    DOT_COLORS[live],
                )} />
            )}
        </div>
    )
}
