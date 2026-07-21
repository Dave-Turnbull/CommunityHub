import { clsx } from 'clsx'

interface Props {
    checked: boolean
    onChange: (checked: boolean) => void
    label?: string
    disabled?: boolean
}

export function Toggle({ checked, onChange, label, disabled }: Props) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={clsx(
                'relative w-9 h-5 rounded-full flex-shrink-0 transition-colors duration-150',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                checked ? 'bg-brand' : 'bg-surface-400',
            )}
        >
            <span
                className={clsx(
                    'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-150',
                    checked && 'translate-x-4',
                )}
            />
        </button>
    )
}
