import { DropdownMenu } from '@/components/ui/DropdownMenu'

interface Props {
    canMoveUp: boolean
    canMoveDown: boolean
    onRename: () => void
    onMoveUp: () => void
    onMoveDown: () => void
    onDelete: () => void
}

export function ChannelRowMenu({ canMoveUp, canMoveDown, onRename, onMoveUp, onMoveDown, onDelete }: Props) {
    return (
        <DropdownMenu
            trigger={
                <button
                    title="Channel actions"
                    className="mt-1.5 px-1 leading-none text-text-muted hover:text-text-primary opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 transition-opacity duration-100"
                >
                    ⋯
                </button>
            }
            className="bg-third border border-sixth rounded-lg shadow-lg p-1 min-w-[140px]"
        >
            <DropdownMenu.Item onSelect={onRename}>Rename</DropdownMenu.Item>
            {canMoveUp && <DropdownMenu.Item onSelect={onMoveUp}>Move up</DropdownMenu.Item>}
            {canMoveDown && <DropdownMenu.Item onSelect={onMoveDown}>Move down</DropdownMenu.Item>}
            <DropdownMenu.Item danger onSelect={onDelete}>Delete</DropdownMenu.Item>
        </DropdownMenu>
    )
}
