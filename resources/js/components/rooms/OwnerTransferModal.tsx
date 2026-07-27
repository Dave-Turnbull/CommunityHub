interface Props {
    message: string
    onConfirm: () => void
    onCancel: () => void
    busy?: boolean
}

/**
 * Shown when a kick/ban targets a room's Owner — only a global Administrator
 * can ever reach this (see Role::effectiveModerationRank), and removing the
 * Owner necessarily leaves the room without one, so confirming makes the
 * acting admin the new Owner (see RoomMembershipService).
 */
export function OwnerTransferModal({ message, onConfirm, onCancel, busy }: Props) {
    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onCancel}>
            <div
                className="w-full max-w-sm bg-second rounded-lg p-6 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="text-lg font-semibold text-text-primary mb-3">Become the new Owner?</h2>
                <p className="text-sm text-text-secondary mb-5">{message}</p>
                <div className="flex gap-2">
                    <button
                        onClick={onCancel}
                        disabled={busy}
                        className="flex-1 px-4 py-2 rounded bg-fifth hover:bg-sixth text-text-secondary text-sm font-medium transition-colors duration-100 disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={busy}
                        className="flex-1 px-4 py-2 rounded bg-danger hover:opacity-90 text-inverse text-sm font-medium transition-colors duration-100 disabled:opacity-50"
                    >
                        {busy ? 'Confirming…' : 'Confirm'}
                    </button>
                </div>
            </div>
        </div>
    )
}
