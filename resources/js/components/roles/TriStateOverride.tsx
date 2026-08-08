import { clsx } from 'clsx'

export type OverrideState = 'inherit' | 'allow' | 'deny'

const OPTIONS: { value: OverrideState; label: string }[] = [
    { value: 'inherit', label: 'Inherit' },
    { value: 'allow', label: 'Allow' },
    { value: 'deny', label: 'Deny' },
]

/**
 * A three-way segmented control for a channel permission override — unlike
 * an ordinary permission grant (on/off), a channel override has a real
 * third state: "no row for this (channel, role, permission) — inherit the
 * room-tier resolution for this role" is meaningfully different from either
 * force-on or force-off, so a binary Toggle can't represent it. See
 * PermissionChecker::canInChannel().
 */
export function TriStateOverride({
    value, onChange, disabled, label,
}: {
    value: OverrideState
    onChange: (value: OverrideState) => void
    disabled?: boolean
    label: string
}) {
    return (
        <div role="radiogroup" aria-label={label} className="inline-flex rounded-md overflow-hidden border border-sixth">
            {OPTIONS.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={value === option.value}
                    disabled={disabled}
                    onClick={() => onChange(option.value)}
                    className={clsx(
                        'px-2 py-1 text-[11px] font-medium transition-colors duration-100 disabled:opacity-50 disabled:cursor-not-allowed',
                        value === option.value
                            ? option.value === 'deny'
                                ? 'bg-danger text-inverse'
                                : option.value === 'allow'
                                  ? 'bg-accent-primary text-inverse'
                                  : 'bg-sixth text-text-primary'
                            : 'bg-third text-text-muted hover:text-text-secondary'
                    )}
                >
                    {option.label}
                </button>
            ))}
        </div>
    )
}
